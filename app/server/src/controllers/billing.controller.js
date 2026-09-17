const crypto = require('crypto');
const {
  sequelize, Bill, BillItem, ClientTestPrice, TestMaster, Sample, Report, Patient, ReferralDoctor, Client,
  Payor, PayorTestPrice, ClientTestShortName,
} = require('../models');
const { findOrCreatePatient } = require('./patient.controller');
const { findOrCreateDoctor } = require('./referralDoctor.controller');

function generateBarcode() {
  return `S${Date.now()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

const billIncludes = [
  Patient,
  ReferralDoctor,
  Payor,
  { model: BillItem, include: [TestMaster, { model: Sample, include: [Report] }] },
];

// POST /api/billing/bills
// Body: { patientId } OR { umr | mobile, name, age, gender, email, address } to
// find-or-register the patient in the same request; plus testIds, and
// optional referredDoctorName, walkInDate, discount, paymentMode, visitAddress,
// remarks, payorId. When payorId is given, each test is charged at that
// payor's negotiated price (falling back to the client's standard price if
// the payor has none set) instead of the walk-in patient paying the standard
// price directly - the standard price is still kept as BillItem.originalPrice
// so a monthly Payor invoice can show the discount given.
async function createBill(req, res) {
  const { clientId, id: userId } = req.user;
  const {
    patientId, umr, name, age, gender, mobile, email, address,
    testIds, referredDoctorName, walkInDate, discount, paymentMode, visitAddress, transactionNumber, remarks, payorId,
  } = req.body;

  if (!Array.isArray(testIds) || testIds.length === 0) {
    return res.status(400).json({ message: 'At least one testId is required' });
  }
  if ((Number(discount) || 0) > 0 && !remarks?.trim()) {
    return res.status(400).json({ message: 'Remarks are required when a discount is given' });
  }
  // A credit (Payor) bill is settled later via a Payor invoice, so it has no
  // payment mode of its own; every other bill is paid at the counter right
  // now and must record how.
  if (!payorId && !paymentMode) {
    return res.status(400).json({ message: 'Payment Mode is required' });
  }

  let patient;
  if (patientId) {
    patient = await Patient.findOne({ where: { id: patientId, clientId } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
  } else {
    try {
      patient = await findOrCreatePatient(clientId, { umr, name, age, gender, mobile, email, address });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  }

  const prices = await ClientTestPrice.findAll({
    where: { clientId, testId: testIds },
    include: [TestMaster],
  });
  if (prices.length !== testIds.length) {
    return res.status(400).json({ message: 'Price not configured for one or more selected tests' });
  }

  let payor = null;
  let payorPriceByTestId = new Map();
  if (payorId) {
    payor = await Payor.findOne({ where: { id: payorId, clientId } });
    if (!payor) return res.status(400).json({ message: 'Selected payor not found' });
    const payorPrices = await PayorTestPrice.findAll({ where: { payorId: payor.id, testId: testIds } });
    payorPriceByTestId = new Map(payorPrices.map((p) => [p.testId, Number(p.price)]));
  }

  function chargedPriceFor(p) {
    if (payor && payorPriceByTestId.has(p.testId)) return payorPriceByTestId.get(p.testId);
    return Number(p.price);
  }

  const doctor = referredDoctorName ? await findOrCreateDoctor(clientId, referredDoctorName) : null;
  const discountAmount = Number(discount) || 0;

  try {
    const result = await sequelize.transaction(async (t) => {
      const totalAmount = prices.reduce((sum, p) => sum + chargedPriceFor(p), 0);
      const bill = await Bill.create({
        clientId, patientId: patient.id, createdByUserId: userId,
        referredDoctorId: doctor?.id || null,
        payorId: payor?.id || null,
        billNo: `INV-${Date.now()}`,
        walkInDate: walkInDate || new Date().toISOString().slice(0, 10),
        totalAmount,
        discount: discountAmount,
        paidAmount: totalAmount - discountAmount,
        paymentMode: payor ? null : paymentMode,
        visitAddress: visitAddress || null,
        transactionNumber: transactionNumber || null,
        remarks: remarks || null,
      }, { transaction: t });

      for (const p of prices) {
        const billItem = await BillItem.create({
          billId: bill.id, testId: p.testId, price: chargedPriceFor(p), originalPrice: Number(p.price),
        }, { transaction: t });

        const sample = await Sample.create({
          clientId, billItemId: billItem.id, barcode: generateBarcode(), status: 'PENDING_COLLECTION',
        }, { transaction: t });

        await Report.create({ sampleId: sample.id, status: 'PENDING' }, { transaction: t });
      }

      return bill;
    });

    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to create bill' });
  }
}

// GET /api/billing/bills/:id  (receipt/invoice view)
async function getBill(req, res) {
  const { clientId } = req.user;
  const bill = await Bill.findOne({ where: { id: req.params.id, clientId }, include: [...billIncludes, Client] });
  if (!bill) return res.status(404).json({ message: 'Bill not found' });
  return res.json(bill);
}

// GET /api/billing/bills  (grid view - includes per-test status for each order)
async function listBills(req, res) {
  const { clientId } = req.user;
  const bills = await Bill.findAll({
    where: { clientId },
    include: billIncludes,
    order: [['createdAt', 'DESC']],
    limit: 200,
  });

  const data = bills.map((b) => ({
    id: b.id,
    billNo: b.billNo,
    walkInDate: b.walkInDate,
    totalAmount: b.totalAmount,
    discount: b.discount,
    paidAmount: b.paidAmount,
    paymentMode: b.paymentMode,
    createdAt: b.createdAt,
    patient: b.Patient ? { id: b.Patient.id, umr: b.Patient.umr, name: b.Patient.name, mobile: b.Patient.mobile } : null,
    referredDoctor: b.ReferralDoctor?.name || null,
    payor: b.Payor?.name || null,
    tests: b.BillItems.map((item) => ({
      testName: item.TestMaster?.testName,
      status: item.Sample?.status,
      reportStatus: item.Sample?.Report?.status,
    })),
  }));

  return res.json(data);
}

// GET /api/billing/test-prices  (read-only, so Front Office can pick tests when
// billing - each row carries this client's own short name too, if they've set
// one, so searching by that shortcut name at billing time also finds the test)
async function listTestPrices(req, res) {
  const { clientId } = req.user;
  const [prices, shortNames] = await Promise.all([
    ClientTestPrice.findAll({ where: { clientId }, include: [TestMaster] }),
    ClientTestShortName.findAll({ where: { clientId } }),
  ]);
  const shortNameByTestId = new Map(shortNames.map((s) => [s.testId, s.shortName]));
  const data = prices.map((p) => ({ ...p.toJSON(), shortName: shortNameByTestId.get(p.testId) || null }));
  return res.json(data);
}

// GET /api/billing/payors  (read-only, so Front Office can attribute a bill to a payor)
async function listPayors(req, res) {
  const { clientId } = req.user;
  const payors = await Payor.findAll({ where: { clientId, active: true }, order: [['name', 'ASC']] });
  return res.json(payors);
}

// GET /api/billing/payors/:id/test-prices  (read-only, for live pricing while billing)
async function listPayorTestPrices(req, res) {
  const { clientId } = req.user;
  const payor = await Payor.findOne({ where: { id: req.params.id, clientId } });
  if (!payor) return res.status(404).json({ message: 'Payor not found' });
  const prices = await PayorTestPrice.findAll({ where: { payorId: payor.id } });
  return res.json(prices);
}

module.exports = {
  createBill, getBill, listBills, listTestPrices, listPayors, listPayorTestPrices,
};
