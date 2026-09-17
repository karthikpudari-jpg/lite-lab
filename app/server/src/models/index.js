const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { getCurrentActor } = require('../utils/auditContext');

// Added to every model below so each table carries who created/last modified
// a row, alongside Sequelize's own createdAt/updatedAt timestamps.
const AUDIT_FIELDS = {
  createdBy: { type: DataTypes.STRING },
  updatedBy: { type: DataTypes.STRING },
};

// ---- CHIEF ADMIN --------------------------------------------------------
const ChiefAdmin = sequelize.define('ChiefAdmin', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING, unique: true, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, { tableName: 'chief_admin' });

// ---- NOTIFICATION SETTINGS (single global row, managed by Chief Admin) ----
const NotificationSetting = sequelize.define('NotificationSetting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  smtpHost: { type: DataTypes.STRING },
  smtpPort: { type: DataTypes.INTEGER },
  smtpUser: { type: DataTypes.STRING },
  smtpPassword: { type: DataTypes.STRING },
  smtpFromEmail: { type: DataTypes.STRING },
  smtpSecure: { type: DataTypes.BOOLEAN, defaultValue: false },
  whatsappPhoneNumberId: { type: DataTypes.STRING },
  whatsappAccessToken: { type: DataTypes.STRING },
  gmailClientId: { type: DataTypes.STRING },
  gmailClientSecret: { type: DataTypes.STRING },
  gmailRefreshToken: { type: DataTypes.STRING },
  gmailSenderEmail: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'notification_setting' });

// ---- NOTIFICATION TEMPLATES (Chief Admin managed, used when sending mail/WhatsApp) ----
const NotificationTemplate = sequelize.define('NotificationTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false },
  channel: { type: DataTypes.ENUM('EMAIL', 'WHATSAPP', 'BOTH'), defaultValue: 'BOTH' },
  header: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, { tableName: 'notification_template' });

// ---- ROLE -> SCREEN ACCESS (which nav screens a client-side role can see) ----
// Platform-wide baseline, set by Chief Admin - the ceiling every client's own
// override is checked against (a client can narrow this, never widen it).
const RoleScreenDefault = sequelize.define('RoleScreenDefault', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  role: { type: DataTypes.STRING, unique: true, allowNull: false },
  screens: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  ...AUDIT_FIELDS,
}, { tableName: 'role_screen_default' });

// Per-client override - lets each client's own ADMIN restrict which screens
// their FRONT_OFFICE/LAB_USER/MANAGER/MASTER_MANAGER staff can see.
const ClientRoleScreen = sequelize.define('ClientRoleScreen', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clientId: { type: DataTypes.INTEGER, allowNull: false },
  role: { type: DataTypes.STRING, allowNull: false },
  screens: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  ...AUDIT_FIELDS,
}, {
  tableName: 'client_role_screen',
  indexes: [{ unique: true, fields: ['clientId', 'role'] }],
});

// ---- CLIENT --------------------------------------------------------------
const Client = sequelize.define('Client', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clientCode: { type: DataTypes.STRING, unique: true, allowNull: false },
  clientName: { type: DataTypes.STRING, allowNull: false },
  mobile: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  salesPerson: { type: DataTypes.STRING },
  // Extra monthly amount for the marketing person's involvement in this client
  // (e.g. an onboarding/referral fee), added on top of the plan price
  // (calculatePlanAmount) to make up monthlyAmount - so it's billed to the
  // client every cycle and multiplies correctly for 3/6/12-month payments.
  marketingPersonPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  monthlyAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paymentStatus: {
    type: DataTypes.ENUM('PAID', 'PENDING', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  reportLogoPath: { type: DataTypes.STRING },
  reportLetterheadPath: { type: DataTypes.STRING },
  // Chief-Admin-controlled: whether this clinic's Front Office can cancel a
  // billed test and record a refund against it. Off by default since it
  // touches money - a clinic has to be explicitly opted in.
  allowBillCancellationRefund: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // How many days after the bill's walk-in date cancellation & refund stays
  // allowed. 0 means no limit. Only meaningful when allowBillCancellationRefund is on.
  refundAllowedDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Whether Front Office/Manager can apply an extra discount to a bill after
  // it's already been created ("post-billing"), separate from the discount
  // that can be given at the time of billing itself. Off by default, like
  // allowBillCancellationRefund - it also touches money already collected.
  allowPostBillingDiscount: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ...AUDIT_FIELDS,
}, { tableName: 'client' });

// ---- CLIENT SUBSCRIPTION ---------------------------------------------------
const ClientSubscription = sequelize.define('ClientSubscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  month: { type: DataTypes.STRING, allowNull: false }, // e.g. "2026-09"
  fromDate: { type: DataTypes.DATEONLY, allowNull: false },
  toDate: { type: DataTypes.DATEONLY, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  dueDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: {
    type: DataTypes.ENUM('PAID', 'PENDING', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  ...AUDIT_FIELDS,
}, { tableName: 'client_subscription' });

// ---- CLIENT PAYMENT --------------------------------------------------------
const ClientPayment = sequelize.define('ClientPayment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.STRING },
  transactionId: { type: DataTypes.STRING },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  // Number of monthly cycles this single payment covers (1 = just the
  // current due cycle; >1 = an advance/bulk payment covering future cycles).
  monthsCovered: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  paymentMode: { type: DataTypes.STRING },
  status: {
    type: DataTypes.ENUM('CREATED', 'PAID', 'FAILED'),
    allowNull: false,
    defaultValue: 'CREATED',
  },
  gatewayResponse: { type: DataTypes.JSONB },
  paymentDate: { type: DataTypes.DATE },
  ...AUDIT_FIELDS,
}, { tableName: 'client_payment' });

// ---- ROLE / PERMISSION -----------------------------------------------------
const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, unique: true, allowNull: false },
  // FRONT_OFFICE | LAB_USER | MANAGER | MASTER_MANAGER | ADMIN
  ...AUDIT_FIELDS,
}, { tableName: 'role_master' });

const RolePermission = sequelize.define('RolePermission', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  screen: { type: DataTypes.STRING, allowNull: false },
  action: { type: DataTypes.STRING, allowNull: false, defaultValue: 'access' },
  ...AUDIT_FIELDS,
}, { tableName: 'role_permission' });

// ---- CLIENT USER ------------------------------------------------------------
const ClientUser = sequelize.define('ClientUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING, allowNull: false },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  mobile: { type: DataTypes.STRING },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, {
  tableName: 'client_user',
  indexes: [{ unique: true, fields: ['clientId', 'username'] }],
});

// ---- MASTERS ------------------------------------------------------------
const TestMaster = sequelize.define('TestMaster', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  testCode: { type: DataTypes.STRING, unique: true, allowNull: false },
  testName: { type: DataTypes.STRING, allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, { tableName: 'test_master' });

// clientId is null for a universal parameter (created by Chief Admin, shared
// across every client) and set for a parameter a client added for themselves
// - which only that client ever sees, exactly like their own test prices.
const ParameterMaster = sequelize.define('ParameterMaster', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  parameterName: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING },
  normalRangeLow: { type: DataTypes.STRING },
  normalRangeHigh: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'parameter_master' });

// A client's own shortcut/abbreviated name for a test (e.g. for quick search
// or a compact report layout), set per client just like ClientTestPrice.
const ClientTestShortName = sequelize.define('ClientTestShortName', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  shortName: { type: DataTypes.STRING, allowNull: false },
  ...AUDIT_FIELDS,
}, {
  tableName: 'client_test_short_name',
  indexes: [{ unique: true, fields: ['clientId', 'testId'] }],
});

const ClientTestPrice = sequelize.define('ClientTestPrice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  ...AUDIT_FIELDS,
}, {
  tableName: 'client_test_price',
  indexes: [{ unique: true, fields: ['clientId', 'testId'] }],
});

// A package (e.g. "Full Body Checkup") bundles several global tests under one
// price. Packages are defined per client, unlike the shared Test Master.
const Package = sequelize.define('Package', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  packageCode: { type: DataTypes.STRING, allowNull: false },
  packageName: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, {
  tableName: 'package',
  indexes: [{ unique: true, fields: ['clientId', 'packageCode'] }],
});

// A Payor is a third party (corporate, TPA, insurer) that a client bills in
// bulk each month instead of the patient paying at the counter - it gets its
// own negotiated price per test, separate from the client's standard price.
const Payor = sequelize.define('Payor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  contactPerson: { type: DataTypes.STRING },
  mobile: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  // How often this credit client is invoiced for the patients billed to it.
  billingCycle: { type: DataTypes.ENUM('MONTHLY', 'WEEKLY'), allowNull: false, defaultValue: 'MONTHLY' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  ...AUDIT_FIELDS,
}, {
  tableName: 'payor',
  indexes: [{ unique: true, fields: ['clientId', 'name'] }],
});

const PayorTestPrice = sequelize.define('PayorTestPrice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  ...AUDIT_FIELDS,
}, {
  tableName: 'payor_test_price',
  indexes: [{ unique: true, fields: ['payorId', 'testId'] }],
});

// A monthly bill sent to one Payor, covering every test done under its name
// that month. Line items snapshot both the client's standard price and the
// payor's negotiated price at generation time, so the invoice stays accurate
// even if prices change later.
const PayorInvoice = sequelize.define('PayorInvoice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  invoiceNo: { type: DataTypes.STRING, allowNull: false, unique: true },
  month: { type: DataTypes.STRING, allowNull: false }, // YYYY-MM
  fromDate: { type: DataTypes.DATEONLY, allowNull: false },
  toDate: { type: DataTypes.DATEONLY, allowNull: false },
  totalOriginal: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  totalAssigned: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  totalDifference: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  totalCollected: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  totalDeduction: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  status: {
    type: DataTypes.ENUM('PENDING', 'PARTIALLY_COLLECTED', 'COLLECTED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  ...AUDIT_FIELDS,
}, {
  tableName: 'payor_invoice',
  indexes: [{ unique: true, fields: ['payorId', 'month'] }],
});

const PayorInvoiceItem = sequelize.define('PayorInvoiceItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  testName: { type: DataTypes.STRING, allowNull: false },
  // Snapshotted at generation time (like testName/originalPrice/assignedPrice)
  // so the invoice's detail/summary views keep showing the right patient and
  // order number even if the patient record changes later.
  patientName: { type: DataTypes.STRING },
  billNo: { type: DataTypes.STRING },
  originalPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  assignedPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  difference: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  ...AUDIT_FIELDS,
}, { tableName: 'payor_invoice_item' });

const PayorInvoiceCollection = sequelize.define('PayorInvoiceCollection', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  paymentType: { type: DataTypes.ENUM('CASH', 'CARD', 'UPI'), allowNull: false },
  discount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  collectedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  remarks: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'payor_invoice_collection' });

// ---- PATIENT / BILLING -----------------------------------------------------
const Patient = sequelize.define('Patient', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  // Unique Medical Record number - generated once per patient, per client,
  // and reused across every future visit/order for that same patient.
  umr: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  age: { type: DataTypes.INTEGER },
  gender: { type: DataTypes.STRING },
  mobile: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, {
  tableName: 'patient',
  indexes: [{ unique: true, fields: ['clientId', 'umr'] }],
});

// Referring doctors, maintained per client so a name typed once can be
// searched and reused (most-recently-used first) on every future order.
const ReferralDoctor = sequelize.define('ReferralDoctor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  mobile: { type: DataTypes.STRING },
  lastUsedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  ...AUDIT_FIELDS,
}, {
  tableName: 'referral_doctor',
  indexes: [{ unique: true, fields: ['clientId', 'name'] }],
});

const Bill = sequelize.define('Bill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  billNo: { type: DataTypes.STRING, allowNull: false },
  walkInDate: { type: DataTypes.DATEONLY },
  totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  discount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paidAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paymentMode: { type: DataTypes.STRING },
  visitAddress: { type: DataTypes.STRING },
  transactionNumber: { type: DataTypes.STRING },
  remarks: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'bill' });

const BillItem = sequelize.define('BillItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  // The client's standard price at billing time - equal to `price` for a
  // normal walk-in, but kept separately so a Payor invoice can show the
  // discount given (originalPrice - price) even after prices change later.
  originalPrice: { type: DataTypes.DECIMAL(10, 2) },
  // A single test within a bill can be cancelled independently of the rest
  // of the bill ("test-wise" cancellation) - see Refund below for the money.
  status: { type: DataTypes.ENUM('ACTIVE', 'CANCELLED'), allowNull: false, defaultValue: 'ACTIVE' },
  ...AUDIT_FIELDS,
}, { tableName: 'bill_item' });

// One row per refund payout against a cancelled BillItem. Kept as its own
// table (rather than a single amount on BillItem) so a partial refund now
// and a further partial refund later both have their own record, and so the
// payment mode/reason of each payout is tracked individually.
const Refund = sequelize.define('Refund', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  mode: { type: DataTypes.STRING, allowNull: false },
  reason: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'refund' });

// One row per discount applied to a bill after it was already created
// ("post-billing"), separate from the discount that can be given at the
// time of billing (Bill.discount). Unlike a cancellation, no test is
// cancelled - it just reduces what the bill still owes, and (since the
// full amount is normally already collected at billing time) money is
// physically handed back, so a payment mode is recorded just like a Refund.
const BillDiscount = sequelize.define('BillDiscount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  mode: { type: DataTypes.STRING, allowNull: false },
  reason: { type: DataTypes.STRING, allowNull: false },
  ...AUDIT_FIELDS,
}, { tableName: 'bill_discount' });

// ---- LAB ------------------------------------------------------------------
const Sample = sequelize.define('Sample', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  barcode: { type: DataTypes.STRING, unique: true, allowNull: false },
  status: {
    type: DataTypes.ENUM('PENDING_COLLECTION', 'COLLECTED', 'RESULT_ENTERED', 'VERIFIED', 'RELEASED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING_COLLECTION',
  },
  collectedAt: { type: DataTypes.DATE },
  ...AUDIT_FIELDS,
}, { tableName: 'sample' });

const Result = sequelize.define('Result', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  value: { type: DataTypes.STRING },
  isAbnormal: { type: DataTypes.BOOLEAN, defaultValue: false },
  ...AUDIT_FIELDS,
}, { tableName: 'result' });

const Report = sequelize.define('Report', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  status: {
    type: DataTypes.ENUM('PENDING', 'VERIFIED', 'RELEASED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  verifiedAt: { type: DataTypes.DATE },
  releasedAt: { type: DataTypes.DATE },
  ...AUDIT_FIELDS,
}, { tableName: 'report' });

// ---- TICKET ----------------------------------------------------------------
const Ticket = sequelize.define('Ticket', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subject: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  status: {
    type: DataTypes.ENUM('OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED'),
    allowNull: false,
    defaultValue: 'OPEN',
  },
  assignedTo: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'ticket' });

// ===== ASSOCIATIONS =========================================================
Client.hasMany(ClientSubscription, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientSubscription.belongsTo(Client, { foreignKey: 'clientId' });

ClientSubscription.hasMany(ClientPayment, { foreignKey: 'subscriptionId' });
ClientPayment.belongsTo(ClientSubscription, { foreignKey: 'subscriptionId' });

Client.hasMany(ClientPayment, { foreignKey: 'clientId' });
ClientPayment.belongsTo(Client, { foreignKey: 'clientId' });

Role.hasMany(RolePermission, { foreignKey: 'roleId', onDelete: 'CASCADE' });
RolePermission.belongsTo(Role, { foreignKey: 'roleId' });

Client.hasMany(ClientUser, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientUser.belongsTo(Client, { foreignKey: 'clientId' });

// A user can hold more than one role (e.g. FRONT_OFFICE + LAB_USER).
ClientUser.belongsToMany(Role, { through: 'client_user_role', foreignKey: 'clientUserId', otherKey: 'roleId' });
Role.belongsToMany(ClientUser, { through: 'client_user_role', foreignKey: 'roleId', otherKey: 'clientUserId' });

// Chief-Admin-side staff accounts (e.g. Admin, Marketing) - same Role table, separate join table.
ChiefAdmin.belongsToMany(Role, { through: 'chief_admin_role', foreignKey: 'chiefAdminId', otherKey: 'roleId' });
Role.belongsToMany(ChiefAdmin, { through: 'chief_admin_role', foreignKey: 'roleId', otherKey: 'chiefAdminId' });

Client.hasMany(ClientTestPrice, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientTestPrice.belongsTo(Client, { foreignKey: 'clientId' });

TestMaster.hasMany(ClientTestPrice, { foreignKey: 'testId' });
ClientTestPrice.belongsTo(TestMaster, { foreignKey: 'testId' });

// Nullable - a universal parameter (clientId null) has no Client row to cascade from.
Client.hasMany(ParameterMaster, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ParameterMaster.belongsTo(Client, { foreignKey: 'clientId' });

Client.hasMany(ClientTestShortName, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ClientTestShortName.belongsTo(Client, { foreignKey: 'clientId' });

TestMaster.hasMany(ClientTestShortName, { foreignKey: 'testId' });
ClientTestShortName.belongsTo(TestMaster, { foreignKey: 'testId' });

Client.hasMany(Package, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Package.belongsTo(Client, { foreignKey: 'clientId' });

Package.belongsToMany(TestMaster, { through: 'package_test', foreignKey: 'packageId', otherKey: 'testId' });
TestMaster.belongsToMany(Package, { through: 'package_test', foreignKey: 'testId', otherKey: 'packageId' });

TestMaster.hasMany(ParameterMaster, { foreignKey: 'testId', onDelete: 'CASCADE' });
ParameterMaster.belongsTo(TestMaster, { foreignKey: 'testId' });

Client.hasMany(Patient, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Patient.belongsTo(Client, { foreignKey: 'clientId' });

Client.hasMany(ReferralDoctor, { foreignKey: 'clientId', onDelete: 'CASCADE' });
ReferralDoctor.belongsTo(Client, { foreignKey: 'clientId' });

Client.hasMany(Payor, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Payor.belongsTo(Client, { foreignKey: 'clientId' });

Payor.hasMany(PayorTestPrice, { foreignKey: 'payorId', onDelete: 'CASCADE' });
PayorTestPrice.belongsTo(Payor, { foreignKey: 'payorId' });
TestMaster.hasMany(PayorTestPrice, { foreignKey: 'testId' });
PayorTestPrice.belongsTo(TestMaster, { foreignKey: 'testId' });

Client.hasMany(PayorInvoice, { foreignKey: 'clientId', onDelete: 'CASCADE' });
PayorInvoice.belongsTo(Client, { foreignKey: 'clientId' });
Payor.hasMany(PayorInvoice, { foreignKey: 'payorId', onDelete: 'CASCADE' });
PayorInvoice.belongsTo(Payor, { foreignKey: 'payorId' });

PayorInvoice.hasMany(PayorInvoiceItem, { foreignKey: 'payorInvoiceId', onDelete: 'CASCADE' });
PayorInvoiceItem.belongsTo(PayorInvoice, { foreignKey: 'payorInvoiceId' });
PayorInvoiceItem.belongsTo(Bill, { foreignKey: 'billId' });
PayorInvoiceItem.belongsTo(BillItem, { foreignKey: 'billItemId' });

PayorInvoice.hasMany(PayorInvoiceCollection, { foreignKey: 'payorInvoiceId', onDelete: 'CASCADE' });
PayorInvoiceCollection.belongsTo(PayorInvoice, { foreignKey: 'payorInvoiceId' });

Client.hasMany(Bill, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Bill.belongsTo(Client, { foreignKey: 'clientId' });

Payor.hasMany(Bill, { foreignKey: 'payorId' });
Bill.belongsTo(Payor, { foreignKey: 'payorId' });

Patient.hasMany(Bill, { foreignKey: 'patientId' });
Bill.belongsTo(Patient, { foreignKey: 'patientId' });

ReferralDoctor.hasMany(Bill, { foreignKey: 'referredDoctorId' });
Bill.belongsTo(ReferralDoctor, { foreignKey: 'referredDoctorId' });

ClientUser.hasMany(Bill, { foreignKey: 'createdByUserId' });
Bill.belongsTo(ClientUser, { foreignKey: 'createdByUserId', as: 'creator' });

Bill.hasMany(BillItem, { foreignKey: 'billId', onDelete: 'CASCADE' });
BillItem.belongsTo(Bill, { foreignKey: 'billId' });

TestMaster.hasMany(BillItem, { foreignKey: 'testId' });
BillItem.belongsTo(TestMaster, { foreignKey: 'testId' });

BillItem.hasOne(Sample, { foreignKey: 'billItemId' });
Sample.belongsTo(BillItem, { foreignKey: 'billItemId' });

Bill.hasMany(Refund, { foreignKey: 'billId', onDelete: 'CASCADE' });
Refund.belongsTo(Bill, { foreignKey: 'billId' });
BillItem.hasMany(Refund, { foreignKey: 'billItemId', onDelete: 'CASCADE' });
Refund.belongsTo(BillItem, { foreignKey: 'billItemId' });

Bill.hasMany(BillDiscount, { foreignKey: 'billId', onDelete: 'CASCADE' });
BillDiscount.belongsTo(Bill, { foreignKey: 'billId' });

Client.hasMany(Sample, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Sample.belongsTo(Client, { foreignKey: 'clientId' });

Sample.hasMany(Result, { foreignKey: 'sampleId', onDelete: 'CASCADE' });
Result.belongsTo(Sample, { foreignKey: 'sampleId' });

ParameterMaster.hasMany(Result, { foreignKey: 'parameterId' });
Result.belongsTo(ParameterMaster, { foreignKey: 'parameterId' });

Sample.hasOne(Report, { foreignKey: 'sampleId', onDelete: 'CASCADE' });
Report.belongsTo(Sample, { foreignKey: 'sampleId' });

Client.hasMany(Ticket, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Ticket.belongsTo(Client, { foreignKey: 'clientId' });

// ===== AUDIT HOOKS ===========================================================
// Applied globally so createdBy/updatedBy are stamped on every model above
// without every controller having to remember to set them.
function hasAuditFields(model) {
  return !!(model?.rawAttributes?.createdBy && model?.rawAttributes?.updatedBy);
}

sequelize.addHook('beforeCreate', (instance) => {
  if (hasAuditFields(instance.constructor)) {
    const actor = getCurrentActor();
    instance.createdBy = actor;
    instance.updatedBy = actor;
  }
});

sequelize.addHook('beforeBulkCreate', (instances) => {
  const actor = getCurrentActor();
  for (const instance of instances) {
    if (hasAuditFields(instance.constructor)) {
      instance.createdBy = actor;
      instance.updatedBy = actor;
    }
  }
});

sequelize.addHook('beforeUpdate', (instance) => {
  if (hasAuditFields(instance.constructor)) {
    instance.updatedBy = getCurrentActor();
  }
});

// Static `Model.update({...}, { where })` calls bypass instance hooks, so
// they need their own hook to still get stamped.
sequelize.addHook('beforeBulkUpdate', (options) => {
  if (hasAuditFields(options.model) && options.attributes) {
    options.attributes.updatedBy = getCurrentActor();
    // Sequelize computes which columns to actually write (options.fields)
    // before hooks run, so a key only added here would otherwise be
    // silently dropped from the generated SQL - it has to be added here too.
    if (Array.isArray(options.fields) && !options.fields.includes('updatedBy')) {
      options.fields.push('updatedBy');
    }
  }
});

module.exports = {
  sequelize,
  ChiefAdmin,
  NotificationSetting,
  NotificationTemplate,
  RoleScreenDefault,
  ClientRoleScreen,
  Client,
  ClientSubscription,
  ClientPayment,
  Role,
  RolePermission,
  ClientUser,
  TestMaster,
  ParameterMaster,
  ClientTestShortName,
  ClientTestPrice,
  Package,
  Patient,
  ReferralDoctor,
  Payor,
  PayorTestPrice,
  PayorInvoice,
  PayorInvoiceItem,
  PayorInvoiceCollection,
  Bill,
  BillItem,
  Refund,
  BillDiscount,
  Sample,
  Result,
  Report,
  Ticket,
};
