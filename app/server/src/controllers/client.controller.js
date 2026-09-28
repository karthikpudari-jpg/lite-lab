const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client, ClientSubscription, ClientUser, Role, ChiefAdmin, sequelize } = require('../models');
const { Op } = require('sequelize');
const { calculatePlanAmount } = require('../utils/pricing');

/**
 * Generates the next available Client Code, e.g. SG0001 (self-signup) or
 * CLI0002 (Chief-Admin-created). Both client-creation paths share one
 * sequence number - only the leading prefix marks which one created it,
 * there's no separate suffix and no per-source counter.
 */
async function generateClientCode(source) {
  const prefix = source === 'CHIEF_ADMIN' ? 'CLI' : 'SG';

  // The shared sequence number is the highest one already in use across every
  // existing client code, regardless of its prefix - not a row count, which
  // would collide with a manually-typed code from before this scheme.
  const clients = await Client.findAll({ attributes: ['clientCode'] });
  let maxN = 0;
  for (const c of clients) {
    const match = c.clientCode.match(/(\d+)/);
    if (match) maxN = Math.max(maxN, parseInt(match[1], 10));
  }

  let n = maxN + 1;
  let code = `${prefix}${String(n).padStart(4, '0')}`;
  while (await Client.findOne({ where: { clientCode: code } })) {
    n += 1;
    code = `${prefix}${String(n).padStart(4, '0')}`;
  }
  return code;
}

// A readable random password for the auto-created chiefadmin support login -
// short hex (like crypto.randomBytes(24).toString('hex')) is secure but
// impossible to read/type back; this trades a little entropy for something
// a person can actually copy and use right after client creation.
function generateReadablePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i += 1) pw += chars[crypto.randomInt(chars.length)];
  return pw;
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
// Body: { clientName, ..., startDate, endDate, users: [{ username, password, name, roleName }] }
// The Client Code is always generated here, never chosen by the caller - see
// generateClientCode's -CA suffix, shared sequence with self-signup's -SU.
// monthlyAmount defaults to the plan (₹2000/month covers 2 users, +₹500/month
// for each user beyond that) plus marketingPersonPrice, but Chief Admin can
// override it with an explicit monthlyAmount in the request (e.g. a custom
// negotiated rate) - if given, that figure is used as-is instead.
async function createClient(req, res) {
  const {
    clientName, mobile, email, address, salesPerson, marketingPersonPrice, monthlyAmount: monthlyAmountOverride,
    startDate, endDate, users,
  } = req.body;

  if (!clientName || !startDate || !endDate) {
    return res.status(400).json({
      message: 'clientName, startDate and endDate are required',
    });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ message: 'endDate cannot be before startDate' });
  }

  const clientCode = await generateClientCode('CHIEF_ADMIN');

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
          department: u.department, designation: u.designation,
        }, { transaction: t });
        await created.setRoles(roles, { transaction: t });
        createdUsers.push({ id: created.id, username: created.username, roles: roles.map((r) => r.name) });
      }

      // One Chief-Admin support login per client, auto-created here - lets
      // Chief Admin log in (client code + "chiefadmin" + the password
      // returned below, once, same as the client's own staff passwords
      // Chief Admin already knows because they typed them) to help
      // troubleshoot, without ever touching the client's own credentials.
      // Never counted as one of the client's own billable users. The
      // password can always be changed later too (Client Detail > Reset
      // Password), this is just what it's created with.
      const adminRole = await Role.findOne({ where: { name: 'ADMIN' }, transaction: t });
      let systemUserCredentials = null;
      if (adminRole) {
        const systemPassword = generateReadablePassword();
        const systemUser = await ClientUser.create({
          clientId: client.id, username: 'chiefadmin',
          passwordHash: await bcrypt.hash(systemPassword, 10),
          name: 'Chief Admin Support', isSystemUser: true,
        }, { transaction: t });
        await systemUser.setRoles([adminRole], { transaction: t });
        systemUserCredentials = { username: 'chiefadmin', password: systemPassword };
      }

      return { client, users: createdUsers, systemUser: systemUserCredentials };
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
    include: [{ model: ClientUser, attributes: ['id'], where: { isSystemUser: false }, required: false }],
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

  const { clientName, mobile, email, address, salesPerson, marketingPersonPrice, active, allowBillCancellationRefund } = req.body;

  let monthlyAmount = client.monthlyAmount;
  let marketingFee = client.marketingPersonPrice;
  if (marketingPersonPrice != null) {
    marketingFee = Number(marketingPersonPrice) || 0;
    if (marketingFee < 0) return res.status(400).json({ message: 'marketingPersonPrice cannot be negative' });
    const userCount = await ClientUser.count({ where: { clientId: client.id, isSystemUser: false } });
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
    allowBillCancellationRefund: allowBillCancellationRefund ?? client.allowBillCancellationRefund,
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

// GET /api/clients/next-code  - lets the Create Client form show the code it
// will get before the client actually exists. Just a preview, not a
// reservation: the real one is (re)computed at creation time, so this can go
// briefly stale if another client is created in between, without causing a
// collision - createClient always generates its own code independently.
async function previewNextClientCode(req, res) {
  const clientCode = await generateClientCode('CHIEF_ADMIN');
  return res.json({ clientCode });
}

// Called once at server startup (see index.js) - createClient only auto-adds
// the "chiefadmin" support login for clients created from now on, so every
// client that already existed before this feature needs it added too.
// Idempotent: skips any client that already has one.
async function backfillSystemUsers() {
  const adminRole = await Role.findOne({ where: { name: 'ADMIN' } });
  if (!adminRole) return;

  const clients = await Client.findAll({
    include: [{ model: ClientUser, where: { isSystemUser: true }, required: false }],
  });
  const missing = clients.filter((c) => (c.ClientUsers || []).length === 0);
  if (missing.length === 0) return;

  for (const client of missing) {
    const existingUsername = await ClientUser.findOne({ where: { clientId: client.id, username: 'chiefadmin' } });
    if (existingUsername) continue; // a real staff user already happens to be named "chiefadmin" - don't collide
    const systemPassword = generateReadablePassword();
    const systemUser = await ClientUser.create({
      clientId: client.id, username: 'chiefadmin',
      passwordHash: await bcrypt.hash(systemPassword, 10),
      name: 'Chief Admin Support', isSystemUser: true,
    });
    await systemUser.setRoles([adminRole]);
    // Only place this password is ever visible - logged once here so it can
    // be read off the server logs, same idea as returning it from
    // createClient for a client made from now on (see there for why).
    console.log(`Chief Admin support login for ${client.clientCode}: chiefadmin / ${systemPassword}`);
  }
  console.log(`Backfilled a Chief Admin support login for ${missing.length} existing client(s).`);
}

module.exports = {
  createClient, listClients, getClient, updateClient, listMarketingPersons, createInitialSubscription, currentMonthRange,
  generateClientCode, previewNextClientCode, backfillSystemUsers,
};
