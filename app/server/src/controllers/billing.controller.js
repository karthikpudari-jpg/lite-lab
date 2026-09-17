const crypto = require('crypto');
const {
  sequelize, Bill, BillItem, Refund, BillDiscount, ClientTestPrice, TestMaster, Sample, Report, Patient, ReferralDoctor,
  Client, Payor, PayorTestPrice, ClientTestShortName,
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
  { model: BillItem, include: [TestMaster, { model: Sample, include: [Report] }, Refund] },
  BillDiscount,
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

// PUT /api/billing/bills/:billId/items/:itemId/cancel
// Body: { amount, mode, reason }  -- cancels one test within a bill and
// records a refund payout against it. Test-wise, not whole-bill: the rest of
// the bill's tests are untouched. `amount` can be less than the test's price
// (a partial refund), and further partial refunds can be recorded later up
// to whatever's left of the price.
async function cancelBillItem(req, res) {
  const { clientId } = req.user;
  const { billId, itemId } = req.params;
  const { amount, mode, reason } = req.body;

  const client = await Client.findByPk(clientId);
  if (!client?.allowBillCancellationRefund) {
    return res.status(403).json({ message: 'Cancellation & refund is not enabled for this clinic. Contact your administrator.' });
  }

  const refundAmount = Number(amount);
  if (!refundAmount || refundAmount <= 0) {
    return res.status(400).json({ message: 'A refund amount greater than 0 is required' });
  }
  if (!mode?.trim()) {
    return res.status(400).json({ message: 'Refund payment mode is required' });
  }

  const bill = await Bill.findOne({ where: { id: billId, clientId } });
  if (!bill) return res.status(404).json({ message: 'Bill not found' });

  if (client.refundAllowedDays > 0 && bill.walkInDate) {
    const daysSinceBilling = Math.floor((Date.now() - new Date(bill.walkInDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceBilling > client.refundAllowedDays) {
      return res.status(400).json({
        message: `Cancellation & refund is only allowed within ${client.refundAllowedDays} day(s) of billing. This bill was made ${daysSinceBilling} day(s) ago.`,
      });
    }
  }

  const billItem = await BillItem.findOne({
    where: { id: itemId, billId: bill.id },
    include: [{ model: Sample, include: [Report] }, Refund, TestMaster],
  });
  if (!billItem) return res.status(404).json({ message: 'Test not found on this bill' });
  if (billItem.status === 'CANCELLED') return res.status(400).json({ message: 'This test is already cancelled' });
  if (billItem.Sample?.status === 'RELEASED') {
    return res.status(400).json({ message: 'Cannot cancel a test whose report has already been released' });
  }

  const alreadyRefunded = (billItem.Refunds || []).reduce((sum, r) => sum + Number(r.amount), 0);
  const maxRefundable = Number(billItem.price) - alreadyRefunded;
  if (refundAmount > maxRefundable) {
    return res.status(400).json({ message: `Refund amount cannot exceed ₹${maxRefundable.toFixed(2)} remaining on this test` });
  }

  const result = await sequelize.transaction(async (t) => {
    const refund = await Refund.create({
      billId: bill.id, billItemId: billItem.id, amount: refundAmount, mode, reason: reason || null,
    }, { transaction: t });

    billItem.status = 'CANCELLED';
    await billItem.save({ transaction: t });

    if (billItem.Sample) {
      billItem.Sample.status = 'CANCELLED';
      await billItem.Sample.save({ transaction: t });
    }

    // paidAmount reflects net revenue actually retained, so it drops by the refund.
    bill.paidAmount = Math.max(0, Number(bill.paidAmount) - refundAmount);
    await bill.save({ transaction: t });

    return refund;
  });

  const full = await Bill.findOne({ where: { id: bill.id, clientId }, include: [...billIncludes, Client] });
  return res.status(201).json({ refund: result, bill: full });
}

// PUT /api/billing/bills/:billId/discount
// Body: { amount, mode, reason } -- applies an extra discount to a bill after
// it's already been created, separate from any discount given at billing
// time. No test is cancelled; it just reduces what's still payable, and
// (since bills are collected in full up front) that amount is handed back,
// so it's tracked with a payment mode exactly like a Refund.
async function applyPostBillingDiscount(req, res) {
  const { clientId } = req.user;
  const { billId } = req.params;
  const { amount, mode, reason } = req.body;

  const client = await Client.findByPk(clientId);
  if (!client?.allowPostBillingDiscount) {
    return res.status(403).json({ message: 'Post-billing discount is not enabled for this clinic. Contact your administrator.' });
  }

  const discountAmount = Number(amount);
  if (!discountAmount || discountAmount <= 0) {
    return res.status(400).json({ message: 'A discount amount greater than 0 is required' });
  }
  if (!mode?.trim()) {
    return res.status(400).json({ message: 'Payment mode is required' });
  }
  if (!reason?.trim()) {
    return res.status(400).json({ message: 'A reason is required for a post-billing discount' });
  }

  const bill = await Bill.findOne({ where: { id: billId, clientId } });
  if (!bill) return res.status(404).json({ message: 'Bill not found' });

  if (discountAmount > Number(bill.paidAmount)) {
    return res.status(400).json({ message: `Discount cannot exceed ₹${Number(bill.paidAmount).toFixed(2)} remaining on this bill` });
  }

  const result = await sequelize.transaction(async (t) => {
    const billDiscount = await BillDiscount.create({ billId: bill.id, amount: discountAmount, mode, reason }, { transaction: t });

    bill.discount = Number(bill.discount) + discountAmount;
    bill.paidAmount = Math.max(0, Number(bill.paidAmount) - discountAmount);
    await bill.save({ transaction: t });

    return billDiscount;
  });

  const full = await Bill.findOne({ where: { id: bill.id, clientId }, include: [...billIncludes, Client] });
  return res.status(201).json({ discount: result, bill: full });
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
    postBillingDiscount: (b.BillDiscounts || []).reduce((sum, d) => sum + Number(d.amount), 0),
    tests: b.BillItems.map((item) => ({
      id: item.id,
      testName: item.TestMaster?.testName,
      price: item.price,
      itemStatus: item.status,
      status: item.Sample?.status,
      reportStatus: item.Sample?.Report?.status,
      refundedAmount: (item.Refunds || []).reduce((sum, r) => sum + Number(r.amount), 0),
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

// GET /api/billing-settings  (current client's own cancellation/refund + post-discount toggles)
async function getBillingSettings(req, res) {
  const client = await Client.findByPk(req.user.clientId);
  return res.json({
    allowBillCancellationRefund: client.allowBillCancellationRefund,
    refundAllowedDays: client.refundAllowedDays,
    allowPostBillingDiscount: client.allowPostBillingDiscount,
  });
}

// PUT /api/billing-settings  (Admin/Manager self-service - no Chief Admin needed)
async function updateBillingSettings(req, res) {
  const client = await Client.findByPk(req.user.clientId);
  const { allowBillCancellationRefund, refundAllowedDays, allowPostBillingDiscount } = req.body;

  const updates = {};
  if (allowBillCancellationRefund !== undefined) {
    if (typeof allowBillCancellationRefund !== 'boolean') {
      return res.status(400).json({ message: 'allowBillCancellationRefund must be true or false' });
    }
    updates.allowBillCancellationRefund = allowBillCancellationRefund;
  }
  if (refundAllowedDays !== undefined) {
    const days = Number(refundAllowedDays);
    if (!Number.isInteger(days) || days < 0) {
      return res.status(400).json({ message: 'refundAllowedDays must be a whole number of 0 or more' });
    }
    updates.refundAllowedDays = days;
  }
  if (allowPostBillingDiscount !== undefined) {
    if (typeof allowPostBillingDiscount !== 'boolean') {
      return res.status(400).json({ message: 'allowPostBillingDiscount must be true or false' });
    }
    updates.allowPostBillingDiscount = allowPostBillingDiscount;
  }

  await client.update(updates);
  return res.json({
    allowBillCancellationRefund: client.allowBillCancellationRefund,
    refundAllowedDays: client.refundAllowedDays,
    allowPostBillingDiscount: client.allowPostBillingDiscount,
  });
}

module.exports = {
  createBill, getBill, listBills, listTestPrices, listPayors, listPayorTestPrices, cancelBillItem,
  applyPostBillingDiscount, getBillingSettings, updateBillingSettings,
};
