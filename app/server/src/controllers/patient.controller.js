const { Op } = require('sequelize');
const { Patient } = require('../models');

/** Generates the next UMR for a client - e.g. UMR000123. Reused for every future visit of that patient. */
async function generateUmr(clientId) {
  const count = await Patient.count({ where: { clientId } });
  return `UMR${String(count + 1).padStart(6, '0')}`;
}

/**
 * Finds an existing patient by UMR or mobile number for this client, or
 * registers a new one (with a freshly generated UMR) if none matches.
 * Shared by the standalone patient-registration endpoint and by billing,
 * so a patient is only ever registered once no matter which screen is used.
 */
async function findOrCreatePatient(clientId, { umr, name, age, ageUnit, gender, mobile, email, address }) {
  if (mobile && mobile.length > 10) {
    throw new Error('Mobile number cannot be more than 10 digits');
  }
  if (umr) {
    const byUmr = await Patient.findOne({ where: { clientId, umr } });
    if (byUmr) return byUmr;
  }
  if (mobile) {
    const byMobile = await Patient.findOne({ where: { clientId, mobile } });
    if (byMobile) return byMobile;
  }
  if (!name) throw new Error('Patient name is required to register a new patient');

  const newUmr = await generateUmr(clientId);
  return Patient.create({ clientId, umr: newUmr, name, age, ageUnit: ageUnit || 'Years', gender, mobile, email, address });
}

// POST /api/patients
async function createPatient(req, res) {
  const { clientId } = req.user;
  const { name, age, ageUnit, gender, mobile, email, address } = req.body;
  if (!name) return res.status(400).json({ message: 'Patient name is required' });

  try {
    const patient = await findOrCreatePatient(clientId, { name, age, ageUnit, gender, mobile, email, address });
    return res.status(201).json(patient);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}

// GET /api/patients
async function listPatients(req, res) {
  const { clientId } = req.user;
  const { search } = req.query;
  const where = { clientId };
  if (search) where.name = { [Op.iLike]: `%${search}%` };

  const patients = await Patient.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
  return res.json(patients);
}

// GET /api/patients/lookup?umr=...  or  ?mobile=...
async function lookupPatient(req, res) {
  const { clientId } = req.user;
  const { umr, mobile } = req.query;
  if (!umr && !mobile) return res.status(400).json({ message: 'Provide umr or mobile to look up' });

  const where = { clientId };
  if (umr) where.umr = umr;
  else where.mobile = mobile;

  const patient = await Patient.findOne({ where });
  if (!patient) return res.status(404).json({ message: 'No patient found' });
  return res.json(patient);
}

module.exports = { createPatient, listPatients, lookupPatient, findOrCreatePatient };
