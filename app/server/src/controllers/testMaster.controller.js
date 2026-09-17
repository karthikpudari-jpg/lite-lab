const { Op } = require('sequelize');
const XLSX = require('xlsx');
const { TestMaster, ParameterMaster } = require('../models');

// Chief Admin adds to the shared/universal catalog (clientId null, seen by
// everyone) exactly as before; a client-side user's own parameter is scoped
// to their client only and never shows up for anyone else.
function requesterClientId(req) {
  return req.user?.type === 'CLIENT_USER' ? req.user.clientId : null;
}

// POST /api/masters/tests
async function createTest(req, res) {
  const { testCode, testName, parameters } = req.body;
  if (!testCode || !testName) {
    return res.status(400).json({ message: 'testCode and testName are required' });
  }

  const existing = await TestMaster.findOne({ where: { testCode } });
  if (existing) return res.status(409).json({ message: 'Test Code already exists' });

  const test = await TestMaster.create({ testCode, testName });

  if (Array.isArray(parameters)) {
    const clientId = requesterClientId(req);
    for (const p of parameters) {
      await ParameterMaster.create({
        testId: test.id,
        clientId,
        parameterName: p.parameterName,
        unit: p.unit,
        normalRangeLow: p.normalRangeLow,
        normalRangeHigh: p.normalRangeHigh,
      });
    }
  }

  return res.status(201).json(test);
}

// GET /api/masters/tests
// A client sees every universal parameter plus whatever parameters they've
// added for themselves; Chief Admin (no client context) sees only the
// universal catalog - matching what it managed before this feature existed.
async function listTests(req, res) {
  const clientId = requesterClientId(req);
  const paramWhere = clientId ? { [Op.or]: [{ clientId: null }, { clientId }] } : { clientId: null };

  const tests = await TestMaster.findAll({
    include: [{ model: ParameterMaster, where: paramWhere, required: false }],
    order: [['testCode', 'ASC']],
  });
  return res.json(tests);
}

// PUT /api/masters/tests/:id
async function updateTest(req, res) {
  const test = await TestMaster.findByPk(req.params.id);
  if (!test) return res.status(404).json({ message: 'Test not found' });
  const { testName, active } = req.body;
  await test.update({ testName: testName ?? test.testName, active: active ?? test.active });
  return res.json(test);
}

// POST /api/masters/tests/:testId/parameters
async function addParameter(req, res) {
  const test = await TestMaster.findByPk(req.params.testId);
  if (!test) return res.status(404).json({ message: 'Test not found' });

  const { parameterName, unit, normalRangeLow, normalRangeHigh } = req.body;
  if (!parameterName) return res.status(400).json({ message: 'parameterName is required' });

  const parameter = await ParameterMaster.create({
    testId: test.id, clientId: requesterClientId(req), parameterName, unit, normalRangeLow, normalRangeHigh,
  });
  return res.status(201).json(parameter);
}

// GET /api/admin/masters/tests/template  - a ready-to-fill Excel sheet, one row
// per parameter (or one blank-parameter row for a test that has none yet), so
// re-downloading it after edits doubles as an up-to-date export.
async function downloadTemplate(req, res) {
  // Chief-Admin-only endpoint - the export covers just the universal catalog,
  // never a client's own private parameters.
  const tests = await TestMaster.findAll({
    include: [{ model: ParameterMaster, where: { clientId: null }, required: false }],
    order: [['testCode', 'ASC']],
  });

  const rows = [];
  for (const t of tests) {
    const params = t.ParameterMasters || [];
    if (params.length === 0) {
      rows.push({ TEST_CODE: t.testCode, TEST_NAME: t.testName, PARAMETER_NAME: '', UNIT: '', NORMAL_RANGE_LOW: '', NORMAL_RANGE_HIGH: '' });
    } else {
      for (const p of params) {
        rows.push({
          TEST_CODE: t.testCode, TEST_NAME: t.testName, PARAMETER_NAME: p.parameterName,
          UNIT: p.unit || '', NORMAL_RANGE_LOW: p.normalRangeLow || '', NORMAL_RANGE_HIGH: p.normalRangeHigh || '',
        });
      }
    }
  }
  if (rows.length === 0) {
    rows.push({ TEST_CODE: 'CBC001', TEST_NAME: 'Complete Blood Count', PARAMETER_NAME: 'Hemoglobin', UNIT: 'g/dL', NORMAL_RANGE_LOW: '13', NORMAL_RANGE_HIGH: '17' });
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tests & Parameters');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="test-parameter-template.xlsx"');
  return res.send(buffer);
}

/**
 * Parses an uploaded Excel/CSV of TEST_CODE, TEST_NAME, PARAMETER_NAME, UNIT,
 * NORMAL_RANGE_LOW, NORMAL_RANGE_HIGH rows and validates each, without writing
 * anything yet. One row per parameter; a row with no PARAMETER_NAME just
 * ensures the test itself exists. Step 1 of Preview -> Validate -> Commit.
 */
async function previewUpload(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Excel/CSV file is required' });

  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const existingTests = await TestMaster.findAll({
    include: [{ model: ParameterMaster, where: { clientId: null }, required: false }],
  });
  const testByCode = new Map(existingTests.map((t) => [t.testCode, t]));

  const preview = rows.map((r, idx) => {
    const testCode = String(r.TEST_CODE || '').trim();
    const testName = String(r.TEST_NAME || '').trim();
    const parameterName = String(r.PARAMETER_NAME || '').trim();
    const unit = String(r.UNIT || '').trim();
    const normalRangeLow = String(r.NORMAL_RANGE_LOW || '').trim();
    const normalRangeHigh = String(r.NORMAL_RANGE_HIGH || '').trim();

    const errors = [];
    if (!testCode) errors.push('TEST_CODE is missing');
    if (!testName) errors.push('TEST_NAME is missing');

    const existingTest = testByCode.get(testCode);
    const isNewTest = !existingTest;
    const paramAlreadyExists = !isNewTest && parameterName
      && existingTest.ParameterMasters.some((p) => p.parameterName.toLowerCase() === parameterName.toLowerCase());

    return {
      row: idx + 2, // account for header row
      testCode, testName, parameterName, unit, normalRangeLow, normalRangeHigh,
      isNewTest,
      action: parameterName
        ? (paramAlreadyExists ? 'Parameter already exists — skipped' : (isNewTest ? 'New test + parameter' : 'Add parameter'))
        : (isNewTest ? 'New test (no parameter)' : 'Test already exists'),
      valid: errors.length === 0,
      errors,
    };
  });

  return res.json({
    totalRows: preview.length,
    validRows: preview.filter((r) => r.valid).length,
    invalidRows: preview.filter((r) => !r.valid).length,
    preview,
  });
}

// POST /api/admin/masters/tests/upload/commit  { rows: [{ testCode, testName, parameterName, unit, normalRangeLow, normalRangeHigh }] }
async function commitUpload(req, res) {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'rows array is required' });
  }

  const results = { testsCreated: 0, parametersAdded: 0, skipped: 0, errors: [] };
  for (const row of rows) {
    const testCode = String(row.testCode || '').trim();
    const testName = String(row.testName || '').trim();
    if (!testCode || !testName) {
      results.errors.push({ testCode, reason: 'Missing TEST_CODE or TEST_NAME' });
      continue;
    }

    const [test, testCreated] = await TestMaster.findOrCreate({ where: { testCode }, defaults: { testName } });
    if (testCreated) results.testsCreated += 1;

    const parameterName = String(row.parameterName || '').trim();
    if (parameterName) {
      const [, paramCreated] = await ParameterMaster.findOrCreate({
        where: { testId: test.id, parameterName, clientId: null },
        defaults: { unit: row.unit, normalRangeLow: row.normalRangeLow, normalRangeHigh: row.normalRangeHigh },
      });
      if (paramCreated) results.parametersAdded += 1;
      else results.skipped += 1;
    }
  }

  return res.json(results);
}

module.exports = {
  createTest, listTests, updateTest, addParameter, downloadTemplate, previewUpload, commitUpload,
};
