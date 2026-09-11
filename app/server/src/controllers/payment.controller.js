const { ClientPayment, ClientSubscription, Client } = require('../models');
const { createOrder, verifyPaymentSignature, verifyWebhookSignature, isMock } = require('../utils/razorpay');
const { getOrCreateCurrentSubscription, getOrCreatePayableSubscription, createAdvanceCycles, getPaidThroughDate } = require('./subscription.controller');

const MAX_ADVANCE_MONTHS = 24;

/** Marks a subscription + payment + client as PAID, extending extra advance cycles if paid for. Idempotent. */
async function markPaid({ payment, subscription, gatewayResponse, transactionId, paymentMode }) {
  const alreadyPaid = payment.status === 'PAID';

  if (!alreadyPaid) {
    await payment.update({
      status: 'PAID',
      transactionId: transactionId || payment.transactionId,
      paymentMode: paymentMode || 'RAZORPAY',
      paymentDate: new Date(),
      gatewayResponse: gatewayResponse || payment.gatewayResponse,
    });
  }
  if (subscription.status !== 'PAID') {
    await subscription.update({ status: 'PAID' });
  }
  if (!alreadyPaid && payment.monthsCovered > 1) {
    await createAdvanceCycles(subscription, payment.monthsCovered - 1);
  }
  await Client.update({ paymentStatus: 'PAID' }, { where: { id: subscription.clientId } });
}

// POST /api/payments/create-order  (authenticated client user)
// Body: { months?: number } -- pay the due cycle, or (even if already paid) top up / pay in advance.
async function createPaymentOrder(req, res) {
  const { clientId } = req.user;
  const subscription = await getOrCreatePayableSubscription(clientId);

  const monthsCovered = Math.max(1, Math.min(MAX_ADVANCE_MONTHS, Number(req.body.months) || 1));
  const totalAmount = Number(subscription.amount) * monthsCovered;

  const order = await createOrder({
    amount: totalAmount,
    receipt: `sub_${subscription.id}_x${monthsCovered}`,
    notes: { clientId: String(clientId), subscriptionId: String(subscription.id), monthsCovered: String(monthsCovered) },
  });

  const payment = await ClientPayment.create({
    clientId,
    subscriptionId: subscription.id,
    orderId: order.id,
    amount: totalAmount,
    monthsCovered,
    status: 'CREATED',
  });

  return res.status(201).json({
    paymentId: payment.id,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || 'INR',
    mock: isMock,
    keyId: process.env.RAZORPAY_KEY_ID || null,
    subscriptionMonth: subscription.month,
    monthsCovered,
    monthlyAmount: subscription.amount,
  });
}

// POST /api/payments/verify  (frontend callback after Razorpay checkout closes)
// Body: { orderId, paymentId, signature }  -- or, in MOCK mode, just { orderId }
async function verifyPayment(req, res) {
  const { orderId, paymentId, signature } = req.body;
  if (!orderId) return res.status(400).json({ message: 'orderId is required' });

  const payment = await ClientPayment.findOne({ where: { orderId } });
  if (!payment) return res.status(404).json({ message: 'Payment order not found' });

  const validSignature = verifyPaymentSignature({ orderId, paymentId, signature });
  if (!validSignature) return res.status(400).json({ message: 'Payment signature verification failed' });

  const subscription = await ClientSubscription.findByPk(payment.subscriptionId);
  await markPaid({
    payment,
    subscription,
    transactionId: paymentId,
    gatewayResponse: { orderId, paymentId, signature, verifiedVia: 'frontend-callback' },
  });

  const paidThrough = await getPaidThroughDate(payment.clientId);
  return res.json({ message: 'Payment verified. Access enabled.', status: 'PAID', monthsCovered: payment.monthsCovered, paidThrough });
}

// POST /api/payments/webhook  (server-to-server callback from Razorpay - source of truth)
async function razorpayWebhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  const event = req.body;
  const orderId = event?.payload?.payment?.entity?.order_id || event?.orderId;
  const paymentEntityId = event?.payload?.payment?.entity?.id || event?.paymentId;
  const eventType = event?.event || 'payment.captured';

  if (!orderId) return res.status(400).json({ message: 'orderId missing in webhook payload' });
  if (!['payment.captured', 'order.paid'].includes(eventType) && eventType !== 'payment.captured') {
    return res.status(200).json({ message: 'Event ignored' });
  }

  const payment = await ClientPayment.findOne({ where: { orderId } });
  if (!payment) return res.status(404).json({ message: 'Payment order not found' });

  const subscription = await ClientSubscription.findByPk(payment.subscriptionId);
  await markPaid({
    payment,
    subscription,
    transactionId: paymentEntityId,
    gatewayResponse: event,
  });

  return res.status(200).json({ message: 'Webhook processed' });
}

// GET /api/payments/status  (frontend polling fallback, and feeds the Home page expiry countdown)
async function paymentStatus(req, res) {
  const { clientId } = req.user;
  const subscription = await getOrCreateCurrentSubscription(clientId);
  return res.json({
    status: subscription.status,
    month: subscription.month,
    toDate: subscription.toDate,
    dueDate: subscription.dueDate,
  });
}

module.exports = { createPaymentOrder, verifyPayment, razorpayWebhook, paymentStatus };
