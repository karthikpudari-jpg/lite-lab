const bcrypt = require('bcryptjs');
const { Client, ClientSubscription, ClientUser, Role, ChiefAdmin, sequelize } = require('../models');
const { Op } = require('sequelize');
const { calculatePlanAmount } = require('../utils/pricing');

/** Generates the next available Client Code, e.g. CLI0001, retrying past any collision. */
async function generateClientCode() {
  const count = await Client.count();
  let n = count + 1;
  let code = `CLI${String(n).padStart(4, '0')}`;
  while (await Client.findOne({ where: { clientCode: code } })) {
    n += 1;
    code = `CLI${String(n).padStart(4, '0')}`;
  }
  return code;
}

function currentMonthRange(date = new Date()) {
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const due = new Date(date.getFullYear(), date.getMonth(), 10);
  const month = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
  return { month, from, to, due };
}

/**
 * Creates a subscription cycle for a client. When `range` ({ from, to }) is
 * given (e.g. the Start Date / End Date chosen at client creation) it is used
 * as-is, with the due date equal to the end date; otherwise the cycle
 * defaults to the current calendar month (used for auto-renewals).
 */
async function createInitialSubscription(client, t, range) {
  let month, from, to, due;
  if (range?.from && range?.to) {
    from = new Date(range.from);
    to = new Date(range.to);
    due = to;
    month = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
  } else {
    ({ month, from, to, due } = currentMonthRange(new Date(client.createdAt || Date.now())));
  }

  return ClientSubscription.create({
    clientId: client.id,
    month,
    fromDate: from,
    toDate: to,
    dueDate: due,
    amount: client.monthlyAmount,
    status: 'PENDING',
  }, { transaction: t });
}

// POST /api/clients  (Chief Admin)
// Body: { clientCode, clientName, ..., startDate, endDate, users: [{ username, password, name, roleName }] }
// monthlyAmount defaults to the plan (₹2000/month covers 2 users, +₹500/month
// for each user beyond that) plus marketingPersonPrice, but Chief Admin can
// override it with an explicit monthlyAmount in the request (e.g. a custom
// negotiated rate) - if given, that figure is used as-is instead.
async function createClient(req, res) {
  const {
    clientCode, clientName, mobile, email, address, salesPerson, marketingPersonPrice, monthlyAmount: monthlyAmountOverride,
    startDate, endDate, users,
  } = req.body;

  if (!clientCode || !clientName || !startDate || !endDate) {
    return res.status(400).json({
      message: 'clientCode, clientName, startDate and endDate are required',
    });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ message: 'endDate cannot be before startDate' });
  }

  const existing = await Client.findOne({ where: { clientCode } });
  if (existing) return res.status(409).json({ message: 'Client Code already exists' });

  const userList = Array.isArray(users) ? users : [];
  for (const u of userList) {
    const roleNames = Array.isArray(u.roleNames) ? u.roleNames : (u.roleName ? [u.roleName] : []);
    u.roleNames = roleNames;
    if (!u.username || !u.password || roleNames.length === 0) {
      return res.status(400).json({ message: 'Each user needs a username, password and at least one role' });
    }
  }

  const marketingFee = Number(marketingPersonPrice) || 0;
  if (marketingFee < 0) return res.status(400).json({ message: 'marketingPersonPrice cannot be negative' });

  let monthlyAmount;
  if (monthlyAmountOverride != null && monthlyAmountOverride !== '') {
    monthlyAmount = Number(monthlyAmountOverride);
    if (Number.isNaN(monthlyAmount) || monthlyAmount < 0) {
      return res.status(400).json({ message: 'monthlyAmount must be a non-negative number' });
    }
  } else {
    monthlyAmount = calculatePlanAmount(userList.length) + marketingFee;
  }

  try {
    const result = await sequelize.transaction(async (t) => {
      const client = await Client.create({
        clientCode, clientName, mobile, email, address, salesPerson,
        marketingPersonPrice: marketingFee, monthlyAmount, paymentStatus: 'PENDING',
      }, { transaction: t });

      await createInitialSubscription(client, t, { from: startDate, to: endDate });

      const createdUsers = [];
      for (const u of userList) {
        const roles = await Role.findAll({ where: { name: u.roleNames }, transaction: t });
        if (roles.length !== u.roleNames.length) {
          const found = new Set(roles.map((r) => r.name));
          const missing = u.roleNames.filter((n) => !found.has(n));
          throw new Error(`Unknown role(s): ${missing.join(', ')}`);
        }
        const passwordHash = await bcrypt.hash(u.password, 10);
        const created = await ClientUser.create({
          clientId: client.id, username: u.username, passwordHash, name: u.name,
        }, { transaction: t });
        await created.setRoles(roles, { transaction: t });
        createdUsers.push({ id: created.id, username: created.username, roles: roles.map((r) => r.name) });
      }

      return { client, users: createdUsers };
    });

    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to create client' });
  }
}

/** The furthest date a client is paid through, so an advance payment visibly reflects on their record. */
async function getPaidThroughDate(clientId) {
  const latestPaid = await ClientSubscription.findOne({
    where: { clientId, status: 'PAID' },
    order: [['toDate', 'DESC']],
  });
  return latestPaid ? latestPaid.toDate : null;
}

// GET /api/clients  (Chief Admin) - client-wise payment dashboard
async function listClients(req, res) {
  const { status } = req.query;
  const where = status ? { paymentStatus: status } : {};
  const clients = await Client.findAll({
    where,
    include: [{ model: ClientUser, attributes: ['id'] }],
    order: [['createdAt', 'DESC']],
  });

  const paidThroughByClient = {};
  for (const c of clients) {
    paidThroughByClient[c.id] = await getPaidThroughDate(c.id);
  }

  const summary = {
    total: clients.length,
    paid: clients.filter((c) => c.paymentStatus === 'PAID').length,
    pending: clients.filter((c) => c.paymentStatus === 'PENDING').length,
    expired: clients.filter((c) => c.paymentStatus === 'EXPIRED').length,
    monthlyRevenueBooked: clients.reduce((sum, c) => sum + Number(c.monthlyAmount), 0),
    monthlyRevenueCollected: clients
      .filter((c) => c.paymentStatus === 'PAID')
      .reduce((sum, c) => sum + Number(c.monthlyAmount), 0),
  };

  const data = clients.map((c) => ({
    id: c.id,
    clientCode: c.clientCode,
    clientName: c.clientName,
    mobile: c.mobile,
    email: c.email,
    salesPerson: c.salesPerson,
    marketingPersonPrice: c.marketingPersonPrice,
    monthlyAmount: c.monthlyAmount,
    paymentStatus: c.paymentStatus,
    active: c.active,
    userCount: c.ClientUsers?.length || 0,
    createdAt: c.createdAt,
    paidThrough: paidThroughByClient[c.id],
  }));

  return res.json({ summary, clients: data });
}

// GET /api/clients/:id
async function getClient(req, res) {
  const client = await Client.findByPk(req.params.id, {
    include: [ClientSubscription, { model: ClientUser, include: [Role] }],
  });
  if (!client) return res.status(404).json({ message: 'Client not found' });

  const paidThrough = await getPaidThroughDate(client.id);
  return res.json({ ...client.toJSON(), paidThrough });
}

// PUT /api/clients/:id
// monthlyAmount itself is intentionally not directly editable here - it's
// always derived from the plan (see calculatePlanAmount) plus
// marketingPersonPrice, recomputed here whenever marketingPersonPrice changes
// so a later adjustment still bills correctly from the next cycle.
async function updateClient(req, res) {
  const client = await Client.findByPk(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });

  const { clientName, mobile, email, address, salesPerson, marketingPersonPrice, active } = req.body;

  let monthlyAmount = client.monthlyAmount;
  let marketingFee = client.marketingPersonPrice;
  if (marketingPersonPrice != null) {
    marketingFee = Number(marketingPersonPrice) || 0;
    if (marketingFee < 0) return res.status(400).json({ message: 'marketingPersonPrice cannot be negative' });
    const userCount = await ClientUser.count({ where: { clientId: client.id } });
    monthlyAmount = calculatePlanAmount(userCount) + marketingFee;
  }

  await client.update({
    clientName: clientName ?? client.clientName,
    mobile: mobile ?? client.mobile,
    email: email ?? client.email,
    address: address ?? client.address,
    salesPerson: salesPerson ?? client.salesPerson,
    marketingPersonPrice: marketingFee,
    monthlyAmount,
    active: active ?? client.active,
  });
  return res.json(client);
}

// GET /api/clients/marketing-persons  (any Chief-Admin type - used by the Sales Person picker)
async function listMarketingPersons(req, res) {
  const marketingRole = await Role.findOne({ where: { name: 'MARKETING' } });
  if (!marketingRole) return res.json([]);

  const users = await ChiefAdmin.findAll({
    include: [{ model: Role, where: { id: marketingRole.id }, through: { attributes: [] } }],
    attributes: ['id', 'username', 'name'],
    where: { active: true },
  });
  return res.json(users.map((u) => ({ id: u.id, username: u.username, name: u.name })));
}

module.exports = {
  createClient, listClients, getClient, updateClient, listMarketingPersons, createInitialSubscription, currentMonthRange,
  generateClientCode,
};
