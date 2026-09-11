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

// ---- CLIENT --------------------------------------------------------------
const Client = sequelize.define('Client', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  clientCode: { type: DataTypes.STRING, unique: true, allowNull: false },
  clientName: { type: DataTypes.STRING, allowNull: false },
  mobile: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  salesPerson: { type: DataTypes.STRING },
  monthlyAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  paymentStatus: {
    type: DataTypes.ENUM('PAID', 'PENDING', 'EXPIRED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  reportLogoPath: { type: DataTypes.STRING },
  reportLetterheadPath: { type: DataTypes.STRING },
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

const ParameterMaster = sequelize.define('ParameterMaster', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  parameterName: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING },
  normalRangeLow: { type: DataTypes.STRING },
  normalRangeHigh: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'parameter_master' });

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
  remarks: { type: DataTypes.STRING },
  ...AUDIT_FIELDS,
}, { tableName: 'bill' });

const BillItem = sequelize.define('BillItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  ...AUDIT_FIELDS,
}, { tableName: 'bill_item' });

// ---- LAB ------------------------------------------------------------------
const Sample = sequelize.define('Sample', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  barcode: { type: DataTypes.STRING, unique: true, allowNull: false },
  status: {
    type: DataTypes.ENUM('PENDING_COLLECTION', 'COLLECTED', 'RESULT_ENTERED', 'VERIFIED', 'RELEASED'),
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

Client.hasMany(Bill, { foreignKey: 'clientId', onDelete: 'CASCADE' });
Bill.belongsTo(Client, { foreignKey: 'clientId' });

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
  Client,
  ClientSubscription,
  ClientPayment,
  Role,
  RolePermission,
  ClientUser,
  TestMaster,
  ParameterMaster,
  ClientTestPrice,
  Package,
  Patient,
  ReferralDoctor,
  Bill,
  BillItem,
  Sample,
  Result,
  Report,
  Ticket,
};
