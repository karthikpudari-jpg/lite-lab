const { Op } = require('sequelize');
const {
  Sample, BillItem, TestMaster, ParameterMaster, Result, Report, Bill, Patient, Client, ReferralDoctor, Payor,
} = require('../models');
const { buildParameterInsight } = require('../utils/trendInsights');

// A client doing result entry sees every universal parameter plus whatever
// parameters it added for itself for that test - never another client's own.
function buildSampleIncludes(clientId) {
  const paramWhere = { [Op.or]: [{ clientId: null }, { clientId }] };
  return [
    {
      model: BillItem,
      include: [
        { model: TestMaster, include: [{ model: ParameterMaster, where: paramWhere, required: false }] },
        { model: Bill, include: [Patient] },
      ],
    },
    Report,
    { model: Result, include: [ParameterMaster] },
  ];
}

// GET /api/lab/samples?status=PENDING_COLLECTION
async function listSamples(req, res) {
  const { clientId } = req.user;
  const { status } = req.query;
  const where = { clientId };
  if (status) where.status = status;

  const samples = await Sample.findAll({ where, include: buildSampleIncludes(clientId), order: [['createdAt', 'DESC']] });
  return res.json(samples);
}

// GET /api/lab/samples/:id
async function getSample(req, res) {
  const { clientId } = req.user;
  const sample = await Sample.findOne({ where: { id: req.params.id, clientId }, include: buildSampleIncludes(clientId) });
  if (!sample) return res.status(404).json({ message: 'Sample not found' });
  return res.json(sample);
}

// POST /api/lab/samples/:id/collect
async function collectSample(req, res) {
  const { clientId } = req.user;
  const sample = await Sample.findOne({ where: { id: req.params.id, clientId } });
  if (!sample) return res.status(404).json({ message: 'Sample not found' });
  if (sample.status !== 'PENDING_COLLECTION') {
    return res.status(400).json({ message: `Sample already ${sample.status}` });
  }

  await sample.update({ status: 'COLLECTED', collectedAt: new Date() });
  return res.json(sample);
}

function isOutOfRange(value, low, high) {
  const v = Number(value);
  if (Number.isNaN(v) || low == null || high == null) return false;
  const l = Number(low);
  const h = Number(high);
  if (Number.isNaN(l) || Number.isNaN(h)) return false;
  return v < l || v > h;
}

// POST /api/lab/samples/:id/results  { results: [{ parameterId, value }] }
// Allowed up to and including VERIFIED - editing an already-verified result
// moves the sample back to RESULT_ENTERED, since a value change invalidates
// the earlier verification and it must be re-verified before release.
async function enterResults(req, res) {
  const { clientId } = req.user;
  const { results } = req.body;
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ message: 'results array is required' });
  }

  const sample = await Sample.findOne({ where: { id: req.params.id, clientId }, include: [Report] });
  if (!sample) return res.status(404).json({ message: 'Sample not found' });
  if (!['COLLECTED', 'RESULT_ENTERED', 'VERIFIED'].includes(sample.status)) {
    return res.status(400).json({ message: 'Sample must be collected before entering results' });
  }

  for (const r of results) {
    const parameter = await ParameterMaster.findByPk(r.parameterId);
    if (!parameter) continue;
    const isAbnormal = isOutOfRange(r.value, parameter.normalRangeLow, parameter.normalRangeHigh);

    const [record] = await Result.findOrCreate({
      where: { sampleId: sample.id, parameterId: r.parameterId },
      defaults: { value: r.value, isAbnormal },
    });
    if (record.value !== r.value) await record.update({ value: r.value, isAbnormal });
  }

  await sample.update({ status: 'RESULT_ENTERED' });
  if (sample.Report.status !== 'PENDING') {
    await sample.Report.update({ status: 'PENDING', verifiedAt: null });
  }
  return res.json({ message: 'Results saved' });
}

// POST /api/lab/samples/:id/verify
async function verifySample(req, res) {
  const { clientId } = req.user;
  const sample = await Sample.findOne({ where: { id: req.params.id, clientId }, include: [Report] });
  if (!sample) return res.status(404).json({ message: 'Sample not found' });
  if (sample.status !== 'RESULT_ENTERED') {
    return res.status(400).json({ message: 'Results must be entered before verification' });
  }

  await sample.update({ status: 'VERIFIED' });
  await sample.Report.update({ status: 'VERIFIED', verifiedAt: new Date() });
  return res.json({ message: 'Sample verified' });
}

// POST /api/lab/samples/:id/release
async function releaseSample(req, res) {
  const { clientId } = req.user;
  const sample = await Sample.findOne({ where: { id: req.params.id, clientId }, include: [Report] });
  if (!sample) return res.status(404).json({ message: 'Sample not found' });
  if (sample.status !== 'VERIFIED') {
    return res.status(400).json({ message: 'Sample must be verified before release' });
  }

  await sample.update({ status: 'RELEASED' });
  await sample.Report.update({ status: 'RELEASED', releasedAt: new Date() });
  return res.json({ message: 'Report released' });
}

// GET /api/lab/bills/:billId/report
// A single consolidated report covering every RELEASED test on this bill -
// a patient with several tests on one visit gets one combined report, and
// tests not yet released simply aren't included until they are.
async function getBillReport(req, res) {
  const { clientId } = req.user;
  const bill = await Bill.findOne({ where: { id: req.params.billId, clientId }, include: [Patient, Client, ReferralDoctor, Payor] });
  if (!bill) return res.status(404).json({ message: 'Bill not found' });

  const samples = await Sample.findAll({
    where: { clientId },
    include: [
      { model: BillItem, where: { billId: bill.id }, include: [TestMaster] },
      Report,
      { model: Result, include: [ParameterMaster] },
    ],
  });
  const releasedSamples = samples.filter((s) => s.status === 'RELEASED');
  if (releasedSamples.length === 0) {
    return res.status(404).json({ message: 'No released reports for this bill yet' });
  }

  return res.json({
    bill: {
      id: bill.id, billNo: bill.billNo, createdAt: bill.createdAt,
      referredDoctor: bill.ReferralDoctor?.name || null,
      payor: bill.Payor?.name || null,
    },
    patient: bill.Patient,
    client: {
      clientName: bill.Client.clientName,
      address: bill.Client.address,
      mobile: bill.Client.mobile,
      email: bill.Client.email,
      logoUrl: bill.Client.reportLogoPath,
      letterheadUrl: bill.Client.reportLetterheadPath,
    },
    tests: releasedSamples.map((s) => ({
      testName: s.BillItem.TestMaster.testName,
      testCode: s.BillItem.TestMaster.testCode,
      barcode: s.barcode,
      collectedAt: s.collectedAt,
      releasedAt: s.Report.releasedAt,
      parameters: s.Results.map((r) => ({
        parameterName: r.ParameterMaster.parameterName,
        value: r.value,
        unit: r.ParameterMaster.unit,
        normalRangeLow: r.ParameterMaster.normalRangeLow,
        normalRangeHigh: r.ParameterMaster.normalRangeHigh,
        isAbnormal: r.isAbnormal,
      })),
    })),
  });
}

/** Every past RELEASED value this patient has for one parameter, oldest first. */
async function getPatientParameterHistory(clientId, patientId, parameterId) {
  const results = await Result.findAll({
    where: { parameterId },
    include: [
      {
        model: Sample,
        required: true,
        where: { clientId, status: 'RELEASED' },
        include: [
          { model: BillItem, required: true, include: [{ model: Bill, required: true, where: { patientId } }] },
          { model: Report, required: true },
        ],
      },
    ],
  });

  return results
    .map((r) => ({ date: r.Sample.Report.releasedAt, value: r.value, isAbnormal: r.isAbnormal }))
    .filter((r) => r.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// GET /api/lab/bills/:billId/trend  ("AI Report" - each parameter on this bill
// compared against this same patient's own history of that same parameter,
// with a short rule-based interpretation of the trend).
async function getBillTrendReport(req, res) {
  const { clientId } = req.user;
  const bill = await Bill.findOne({ where: { id: req.params.billId, clientId }, include: [Patient] });
  if (!bill) return res.status(404).json({ message: 'Bill not found' });

  const samples = await Sample.findAll({
    where: { clientId, status: 'RELEASED' },
    include: [
      { model: BillItem, where: { billId: bill.id }, include: [TestMaster] },
      Report,
      { model: Result, include: [ParameterMaster] },
    ],
  });
  if (samples.length === 0) {
    return res.status(404).json({ message: 'No released reports for this bill yet' });
  }

  const parameters = [];
  for (const sample of samples) {
    for (const result of sample.Results) {
      const param = result.ParameterMaster;
      const history = await getPatientParameterHistory(clientId, bill.patientId, param.id);
      parameters.push({
        testName: sample.BillItem.TestMaster.testName,
        parameterName: param.parameterName,
        unit: param.unit,
        normalRangeLow: param.normalRangeLow,
        normalRangeHigh: param.normalRangeHigh,
        history,
        insight: buildParameterInsight(history),
      });
    }
  }

  return res.json({
    patient: { name: bill.Patient.name, umr: bill.Patient.umr },
    parameters,
  });
}

module.exports = {
  listSamples, getSample, collectSample, enterResults, verifySample, releaseSample, getBillReport, getBillTrendReport,
};
