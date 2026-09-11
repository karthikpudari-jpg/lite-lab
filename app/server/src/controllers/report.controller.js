const { Op } = require('sequelize');
const { Bill, BillItem, TestMaster, Sample, Report, Patient } = require('../models');

function dateKey(date, groupBy) {
  const d = new Date(date);
  if (groupBy === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return d.toISOString().slice(0, 10);
}

// GET /api/reports/transactions?from=&to=&groupBy=day|month
async function transactions(req, res) {
  const { clientId } = req.user;
  const { from, to, groupBy = 'day' } = req.query;

  const where = { clientId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = new Date(from);
    if (to) where.createdAt[Op.lte] = new Date(to);
  }

  const bills = await Bill.findAll({ where, order: [['createdAt', 'ASC']] });
  const grouped = {};
  for (const bill of bills) {
    const key = dateKey(bill.createdAt, groupBy);
    if (!grouped[key]) grouped[key] = { period: key, billCount: 0, totalAmount: 0 };
    grouped[key].billCount += 1;
    grouped[key].totalAmount += Number(bill.totalAmount);
  }

  return res.json(Object.values(grouped));
}

// GET /api/reports/collection-summary
async function collectionSummary(req, res) {
  const { clientId } = req.user;
  const bills = await Bill.findAll({ where: { clientId } });
  const totalBilled = bills.reduce((s, b) => s + Number(b.totalAmount), 0);
  const totalCollected = bills.reduce((s, b) => s + Number(b.paidAmount), 0);

  return res.json({
    billCount: bills.length,
    totalBilled,
    totalCollected,
    outstanding: totalBilled - totalCollected,
  });
}

// GET /api/reports/outstanding
async function outstanding(req, res) {
  const { clientId } = req.user;
  const bills = await Bill.findAll({
    where: { clientId },
    include: [Patient],
    order: [['createdAt', 'DESC']],
  });
  const unpaid = bills
    .filter((b) => Number(b.paidAmount) < Number(b.totalAmount))
    .map((b) => ({
      billNo: b.billNo,
      patient: b.Patient?.name,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      outstanding: Number(b.totalAmount) - Number(b.paidAmount),
      createdAt: b.createdAt,
    }));
  return res.json(unpaid);
}

// GET /api/reports/lab-summary  (samples by status)
async function labSummary(req, res) {
  const { clientId } = req.user;
  const samples = await Sample.findAll({ where: { clientId } });
  const summary = samples.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});
  return res.json({ total: samples.length, byStatus: summary });
}

// GET /api/reports/lab-details
async function labDetails(req, res) {
  const { clientId } = req.user;
  const samples = await Sample.findAll({
    where: { clientId },
    include: [
      { model: BillItem, include: [TestMaster] },
      Report,
    ],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });

  return res.json(samples.map((s) => ({
    barcode: s.barcode,
    testCode: s.BillItem?.TestMaster?.testCode,
    testName: s.BillItem?.TestMaster?.testName,
    status: s.status,
    reportStatus: s.Report?.status,
    collectedAt: s.collectedAt,
  })));
}

// GET /api/reports/test-wise-revenue
async function testWiseRevenue(req, res) {
  const { clientId } = req.user;
  const items = await BillItem.findAll({
    include: [
      { model: TestMaster },
      { model: Bill, where: { clientId }, attributes: [] },
    ],
  });

  const grouped = {};
  for (const item of items) {
    const code = item.TestMaster.testCode;
    if (!grouped[code]) {
      grouped[code] = { testCode: code, testName: item.TestMaster.testName, count: 0, revenue: 0 };
    }
    grouped[code].count += 1;
    grouped[code].revenue += Number(item.price);
  }

  return res.json(Object.values(grouped));
}

// GET /api/reports/report-status
async function reportStatusCounts(req, res) {
  const { clientId } = req.user;
  const samples = await Sample.findAll({ where: { clientId }, include: [Report] });
  const counts = { PENDING: 0, VERIFIED: 0, RELEASED: 0 };
  for (const s of samples) {
    if (s.Report) counts[s.Report.status] = (counts[s.Report.status] || 0) + 1;
  }
  return res.json(counts);
}

module.exports = {
  transactions, collectionSummary, outstanding, labSummary, labDetails, testWiseRevenue, reportStatusCounts,
};
