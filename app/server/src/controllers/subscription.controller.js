const { ClientSubscription, Client } = require('../models');
const { Op } = require('sequelize');
const { createInitialSubscription, currentMonthRange } = require('./client.controller');

// GET /api/clients/:clientId/subscriptions
async function listSubscriptions(req, res) {
  const subs = await ClientSubscription.findAll({
    where: { clientId: req.params.clientId },
    order: [['fromDate', 'DESC']],
  });
  return res.json(subs);
}

/** The subscription cycle (Start Date/End Date range) that covers today, if any. */
async function findCurrentCycle(clientId) {
  const today = new Date();
  return ClientSubscription.findOne({
    where: { clientId, fromDate: { [Op.lte]: today }, toDate: { [Op.gte]: today } },
    order: [['toDate', 'DESC']],
  });
}

/** Returns the subscription cycle covering today, creating a calendar-month one if none exists. */
async function getOrCreateCurrentSubscription(clientId) {
  let sub = await findCurrentCycle(clientId);
  if (!sub) {
    const client = await Client.findByPk(clientId);
    sub = await createInitialSubscription(client);
  }
  return sub;
}

// GET /api/clients/:clientId/subscriptions/current
async function getCurrentSubscription(req, res) {
  const sub = await getOrCreateCurrentSubscription(req.params.clientId);
  return res.json(sub);
}

/**
 * Recomputes a client's paymentStatus from its subscription date ranges:
 * PAID while today falls within a PAID cycle, EXPIRED once that cycle's End
 * Date has passed (or a PENDING cycle's due date passed), PENDING while
 * inside a not-yet-due unpaid cycle. This is the single source of truth for
 * whether a client login should be granted access, so it is re-checked on
 * every protected request as well as on login and by the daily job below.
 */
async function syncClientPaymentStatus(clientId) {
  const cycle = await findCurrentCycle(clientId);
  const today = new Date();

  let status;
  if (!cycle) {
    status = 'EXPIRED'; // no subscription cycle (Start Date-End Date) covers today
  } else if (cycle.status === 'PAID') {
    status = 'PAID';
  } else if (cycle.status === 'PENDING' && today > new Date(cycle.dueDate)) {
    await cycle.update({ status: 'EXPIRED' });
    status = 'EXPIRED';
  } else {
    status = cycle.status;
  }

  await Client.update({ paymentStatus: status }, { where: { id: clientId } });
  return status;
}

/**
 * Re-syncs every active client's paymentStatus against its subscription date
 * ranges. Run once at server boot and on a daily interval so clients whose
 * End Date/due date lapses get blocked even without an incoming request.
 */
async function expireOverdueSubscriptions() {
  const clients = await Client.findAll({ where: { active: true }, attributes: ['id'] });
  for (const client of clients) {
    await syncClientPaymentStatus(client.id);
  }
}

/** Creates `count` consecutive monthly cycles immediately after `afterSubscription`, in the given status. */
async function createChainedCycles(afterSubscription, count, status = 'PAID') {
  let prevTo = new Date(afterSubscription.toDate);
  const created = [];
  for (let i = 0; i < count; i++) {
    const from = new Date(prevTo);
    from.setDate(from.getDate() + 1);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    to.setDate(to.getDate() - 1);
    const month = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;

    const cycle = await ClientSubscription.create({
      clientId: afterSubscription.clientId,
      month,
      fromDate: from,
      toDate: to,
      dueDate: to,
      amount: afterSubscription.amount,
      status,
    });
    created.push(cycle);
    prevTo = to;
  }
  return created;
}

/**
 * For an advance/bulk payment covering more than one month, creates the
 * extra consecutive cycles immediately after `subscription`, pre-marked
 * PAID, so the client's access runs uninterrupted through all of them.
 */
async function createAdvanceCycles(subscription, extraMonths) {
  return createChainedCycles(subscription, extraMonths, 'PAID');
}

/**
 * Resolves the subscription cycle a new payment should apply to. Usually
 * that's the cycle covering today when it isn't paid yet. But a client who
 * is already paid through some date can also choose to top up / pay in
 * advance proactively — in that case there's no due cycle to attach to, so
 * this opens a fresh PENDING cycle chained right after their latest paid
 * one (or after whatever their latest cycle is, if none is paid at all).
 */
async function getOrCreatePayableSubscription(clientId) {
  const todayCycle = await findCurrentCycle(clientId);
  if (todayCycle && todayCycle.status !== 'PAID') return todayCycle;

  const latest = await ClientSubscription.findOne({ where: { clientId }, order: [['toDate', 'DESC']] });
  if (!latest) {
    const client = await Client.findByPk(clientId);
    return createInitialSubscription(client);
  }
  if (latest.status !== 'PAID') return latest; // unpaid and not covering today either (a lapsed gap) - reuse it

  const [nextCycle] = await createChainedCycles(latest, 1, 'PENDING');
  return nextCycle;
}

/** The furthest date a client is currently paid through, so an advance payment visibly reflects on their record. */
async function getPaidThroughDate(clientId) {
  const latestPaid = await ClientSubscription.findOne({
    where: { clientId, status: 'PAID' },
    order: [['toDate', 'DESC']],
  });
  return latestPaid ? latestPaid.toDate : null;
}

module.exports = {
  listSubscriptions,
  getCurrentSubscription,
  getOrCreateCurrentSubscription,
  getOrCreatePayableSubscription,
  syncClientPaymentStatus,
  expireOverdueSubscriptions,
  createAdvanceCycles,
  getPaidThroughDate,
};
