import { useEffect, useState } from 'react';
import api from '../../api/client';
import SearchSelect from '../../components/SearchSelect';
import { downloadFile } from '../../utils/download';

const GENDER_OPTIONS = ['Any', 'Male', 'Female', 'Other'];
const AGE_UNIT_OPTIONS = ['Years', 'Months', 'Days'];
const emptyRangeRow = () => ({ gender: 'Any', ageMin: '', ageMax: '', ageUnit: 'Years', normalRangeLow: '', normalRangeHigh: '' });
// Narrower than the app-wide .form-grid default (minmax 200px) so Gender/Age/Unit/Range fields
// wrap two-three to a row instead of stacking one-per-row on a narrow/mobile screen.
const rangeGridStyle = { alignItems: 'end', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' };

export default function Masters() {
  const [tests, setTests] = useState([]);
  const [newTest, setNewTest] = useState({ testCode: '', testName: '' });
  const [paramForm, setParamForm] = useState({ testId: '', parameterName: '', unit: '', method: '', normalRangeLow: '', normalRangeHigh: '' });
  const [rangeRows, setRangeRows] = useState([]); // extra age/gender-specific rules for the parameter being created
  const [error, setError] = useState('');
  const [savingParam, setSavingParam] = useState(false);

  const [manageParam, setManageParam] = useState(null); // parameter row whose ranges are being managed
  const [newRange, setNewRange] = useState(emptyRangeRow());
  const [rangeError, setRangeError] = useState('');
  const [savingRange, setSavingRange] = useState(false);

  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkMessage, setBulkMessage] = useState('');

  async function load() {
    const { data } = await api.get('/admin/masters/tests');
    setTests(data);
    return { tests: data };
  }
  useEffect(() => { load(); }, []);

  const selectedTest = tests.find((t) => t.id === Number(paramForm.testId));

  async function handleCreateTest(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/admin/masters/tests', newTest);
      setNewTest({ testCode: '', testName: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create test');
    }
  }

  async function handleAddParameter(e) {
    e.preventDefault();
    if (savingParam) return; // guard against rapid double-submit creating a duplicate parameter
    setError('');
    const normalRanges = rangeRows.filter((r) => r.normalRangeLow || r.normalRangeHigh);
    setSavingParam(true);
    try {
      await api.post(`/admin/masters/tests/${paramForm.testId}/parameters`, { ...paramForm, normalRanges });
      setParamForm({ testId: paramForm.testId, parameterName: '', unit: '', method: '', normalRangeLow: '', normalRangeHigh: '' });
      setRangeRows([]);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add parameter');
    } finally {
      setSavingParam(false);
    }
  }

  function addRangeRow() {
    setRangeRows((rows) => [...rows, emptyRangeRow()]);
  }
  function updateRangeRow(idx, field, value) {
    setRangeRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function removeRangeRow(idx) {
    setRangeRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function openManageRanges(param) {
    setManageParam(param);
    setNewRange(emptyRangeRow());
    setRangeError('');
  }

  async function handleAddExistingRange(e) {
    e.preventDefault();
    if (savingRange) return; // guard against rapid double-submit creating a duplicate range rule
    setRangeError('');
    setSavingRange(true);
    try {
      await api.post(`/admin/masters/parameters/${manageParam.id}/ranges`, newRange);
      setNewRange(emptyRangeRow());
      const data = await load();
      const freshTest = data.tests.find((t) => t.id === Number(paramForm.testId));
      setManageParam((prev) => freshTest?.ParameterMasters?.find((p) => p.id === prev.id) || prev);
    } catch (err) {
      setRangeError(err.response?.data?.message || 'Failed to add normal range');
    } finally {
      setSavingRange(false);
    }
  }

  async function handleDeleteRange(rangeId) {
    await api.delete(`/admin/masters/parameters/${manageParam.id}/ranges/${rangeId}`);
    const data = await load();
    const freshTest = data.tests.find((t) => t.id === Number(paramForm.testId));
    setManageParam((prev) => freshTest?.ParameterMasters?.find((p) => p.id === prev.id) || prev);
  }

  async function handleBulkPreview(e) {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkMessage('');
    const formData = new FormData();
    formData.append('file', bulkFile);
    const { data } = await api.post('/admin/masters/tests/upload/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setBulkPreview(data);
  }

  async function handleBulkCommit() {
    const rows = bulkPreview.preview.filter((r) => r.valid).map((r) => ({
      testCode: r.testCode, testName: r.testName, parameterName: r.parameterName,
      unit: r.unit, method: r.method, normalRangeLow: r.normalRangeLow, normalRangeHigh: r.normalRangeHigh,
      gender: r.gender, ageMin: r.ageMin, ageMax: r.ageMax, ageUnit: r.ageUnit, rangeLow: r.rangeLow, rangeHigh: r.rangeHigh,
    }));
    const { data } = await api.post('/admin/masters/tests/upload/commit', { rows });
    setBulkMessage(
      `${data.testsCreated} test(s) created, ${data.parametersAdded} parameter(s) added, `
      + `${data.rangesAdded} age/gender range(s) added, ${data.skipped} already existed, ${data.errors.length} failed.`,
    );
    setBulkPreview(null);
    setBulkFile(null);
    load();
  }

  return (
    <div>
      <div className="card">
        <h3>Test Master</h3>
        <form onSubmit={handleCreateTest} className="form-grid" style={{ alignItems: 'end' }}>
          <label><span>Test Code</span><input value={newTest.testCode} onChange={(e) => setNewTest((f) => ({ ...f, testCode: e.target.value }))} required /></label>
          <label><span>Test Name</span><input value={newTest.testName} onChange={(e) => setNewTest((f) => ({ ...f, testName: e.target.value }))} required /></label>
          <button type="submit">Add Test</button>
        </form>

        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Parameters</th></tr></thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id}>
                <td>{t.testCode}</td>
                <td>{t.testName}</td>
                <td>{(t.ParameterMasters || []).map((p) => `[${p.parameterCode || '—'}] ${p.parameterName} (${p.normalRangeLow}-${p.normalRangeHigh} ${p.unit || ''})`).join(', ') || '—'}</td>
              </tr>
            ))}
            {tests.length === 0 && <tr><td colSpan={3}>No tests configured yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Add Parameter to a Test</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          The parameter code is generated automatically - no need to type one.
        </p>
        <form onSubmit={handleAddParameter} className="form-grid" style={{ alignItems: 'end' }}>
          <div><span>Test</span>
            <SearchSelect
              options={tests.map((t) => ({ value: t.id, label: `${t.testCode} — ${t.testName}` }))}
              value={paramForm.testId}
              onChange={(testId) => setParamForm((f) => ({ ...f, testId }))}
              placeholder="Search by test code or name…"
            />
          </div>
          <label><span>Parameter Name</span><input value={paramForm.parameterName} onChange={(e) => setParamForm((f) => ({ ...f, parameterName: e.target.value }))} required /></label>
          <label><span>Unit</span><input value={paramForm.unit} onChange={(e) => setParamForm((f) => ({ ...f, unit: e.target.value }))} /></label>
          <label><span>Method</span><input value={paramForm.method} onChange={(e) => setParamForm((f) => ({ ...f, method: e.target.value }))} placeholder="e.g. Photometry" /></label>
          <label><span>Default Normal Range Low</span><input value={paramForm.normalRangeLow} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeLow: e.target.value }))} /></label>
          <label><span>Default Normal Range High</span><input value={paramForm.normalRangeHigh} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeHigh: e.target.value }))} /></label>
          <button type="submit" disabled={!paramForm.testId || savingParam}>{savingParam ? 'Adding…' : 'Add Parameter'}</button>
        </form>

        {paramForm.testId && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
              Optional age/gender-specific ranges (e.g. Male 18-60, Female 18-60). The default range above is used
              whenever a patient doesn't match any of these.
            </p>
            {rangeRows.map((r, idx) => (
              <div key={idx} className="form-grid" style={rangeGridStyle}>
                <label><span>Gender</span>
                  <select value={r.gender} onChange={(e) => updateRangeRow(idx, 'gender', e.target.value)}>
                    {GENDER_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                  </select>
                </label>
                <label><span>Age From</span>
                  <input type="number" min="0" value={r.ageMin} onChange={(e) => updateRangeRow(idx, 'ageMin', e.target.value)} />
                </label>
                <label><span>Age To</span>
                  <input type="number" min="0" value={r.ageMax} onChange={(e) => updateRangeRow(idx, 'ageMax', e.target.value)} />
                </label>
                <label><span>Age Unit</span>
                  <select value={r.ageUnit} onChange={(e) => updateRangeRow(idx, 'ageUnit', e.target.value)}>
                    {AGE_UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
                <label><span>Range Low</span>
                  <input value={r.normalRangeLow} onChange={(e) => updateRangeRow(idx, 'normalRangeLow', e.target.value)} />
                </label>
                <label><span>Range High</span>
                  <input value={r.normalRangeHigh} onChange={(e) => updateRangeRow(idx, 'normalRangeHigh', e.target.value)} />
                </label>
                <button type="button" className="secondary" onClick={() => removeRangeRow(idx)}>Remove</button>
              </div>
            ))}
            <button type="button" className="secondary" onClick={addRangeRow}>+ Add Age/Gender Range</button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}

        {paramForm.testId && (
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Code</th><th>Parameter</th><th>Unit</th><th>Method</th><th>Default Range</th><th>Age/Gender Ranges</th><th></th></tr></thead>
            <tbody>
              {(selectedTest?.ParameterMasters || []).map((p) => (
                <tr key={p.id}>
                  <td>{p.parameterCode || '—'}</td>
                  <td>{p.parameterName}</td>
                  <td>{p.unit || '—'}</td>
                  <td>{p.method || '—'}</td>
                  <td>{p.normalRangeLow || '—'} - {p.normalRangeHigh || '—'}</td>
                  <td>{(p.ParameterNormalRanges || []).length}</td>
                  <td><button type="button" onClick={() => openManageRanges(p)}>Manage Ranges</button></td>
                </tr>
              ))}
              {(selectedTest?.ParameterMasters || []).length === 0 && <tr><td colSpan={7}>No parameters yet for this test.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {manageParam && (
        <div className="modal-overlay" onClick={() => setManageParam(null)}>
          <div className="modal-card" style={{ width: 680, maxWidth: 'calc(100vw - 32px)', textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
            <h2>Normal Ranges — {manageParam.parameterName}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Default range: {manageParam.normalRangeLow || '—'} - {manageParam.normalRangeHigh || '—'} (used when no rule below matches).
            </p>
            <table>
              <thead><tr><th>Gender</th><th>Age From</th><th>Age To</th><th>Unit</th><th>Range</th><th></th></tr></thead>
              <tbody>
                {(manageParam.ParameterNormalRanges || []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.gender}</td>
                    <td>{r.ageMin ?? '—'}</td>
                    <td>{r.ageMax ?? '—'}</td>
                    <td>{r.ageUnit || 'Years'}</td>
                    <td>{r.normalRangeLow || '—'} - {r.normalRangeHigh || '—'}</td>
                    <td><button type="button" className="secondary" onClick={() => handleDeleteRange(r.id)}>Remove</button></td>
                  </tr>
                ))}
                {(manageParam.ParameterNormalRanges || []).length === 0 && <tr><td colSpan={6}>No age/gender rules yet — the default range applies to everyone.</td></tr>}
              </tbody>
            </table>

            <form onSubmit={handleAddExistingRange} className="form-grid" style={{ ...rangeGridStyle, marginTop: 12 }}>
              <label><span>Gender</span>
                <select value={newRange.gender} onChange={(e) => setNewRange((f) => ({ ...f, gender: e.target.value }))}>
                  {GENDER_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                </select>
              </label>
              <label><span>Age From</span>
                <input type="number" min="0" value={newRange.ageMin} onChange={(e) => setNewRange((f) => ({ ...f, ageMin: e.target.value }))} />
              </label>
              <label><span>Age To</span>
                <input type="number" min="0" value={newRange.ageMax} onChange={(e) => setNewRange((f) => ({ ...f, ageMax: e.target.value }))} />
              </label>
              <label><span>Age Unit</span>
                <select value={newRange.ageUnit} onChange={(e) => setNewRange((f) => ({ ...f, ageUnit: e.target.value }))}>
                  {AGE_UNIT_OPTIONS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </label>
              <label><span>Range Low</span>
                <input value={newRange.normalRangeLow} onChange={(e) => setNewRange((f) => ({ ...f, normalRangeLow: e.target.value }))} />
              </label>
              <label><span>Range High</span>
                <input value={newRange.normalRangeHigh} onChange={(e) => setNewRange((f) => ({ ...f, normalRangeHigh: e.target.value }))} />
              </label>
              <button type="submit" disabled={savingRange}>{savingRange ? 'Adding…' : 'Add Range'}</button>
            </form>
            {rangeError && <p className="error-text">{rangeError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setManageParam(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Bulk Upload — Tests &amp; Parameters</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Columns: TEST_CODE, TEST_NAME, PARAMETER_NAME, UNIT, METHOD, NORMAL_RANGE_LOW, NORMAL_RANGE_HIGH,
          GENDER, AGE_MIN, AGE_MAX, AGE_UNIT, RANGE_LOW, RANGE_HIGH. One row per parameter (or per
          age/gender-specific range rule, if RANGE_LOW/RANGE_HIGH are filled in — repeat the same
          TEST_CODE/PARAMETER_NAME on extra rows to add several rules, e.g. Male 18-60 and Female 18-60).
          Leave PARAMETER_NAME blank to just create the test.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className="secondary" onClick={() => downloadFile('/admin/masters/tests/template', 'test-parameter-template.xlsx')}>
            Download Template
          </button>
        </div>
        <form onSubmit={handleBulkPreview} className="form-grid" style={{ alignItems: 'end' }}>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setBulkFile(e.target.files[0])} />
          <button type="submit" disabled={!bulkFile}>Preview</button>
        </form>

        {bulkPreview && (
          <>
            <p>{bulkPreview.validRows} valid, {bulkPreview.invalidRows} invalid of {bulkPreview.totalRows} rows.</p>
            <table>
              <thead><tr><th>Row</th><th>Test Code</th><th>Test Name</th><th>Parameter</th><th>Unit</th><th>Method</th><th>Default Range</th><th>Age/Gender Range</th><th>Action</th><th>Status</th></tr></thead>
              <tbody>
                {bulkPreview.preview.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td><td>{r.testCode}</td><td>{r.testName}</td><td>{r.parameterName || '—'}</td>
                    <td>{r.unit || '—'}</td><td>{r.method || '—'}</td>
                    <td>{r.normalRangeLow || r.normalRangeHigh ? `${r.normalRangeLow}-${r.normalRangeHigh}` : '—'}</td>
                    <td>{r.rangeLow || r.rangeHigh ? `${r.gender || 'Any'} ${r.ageMin || '0'}-${r.ageMax || '∞'} ${r.ageUnit || 'Years'}: ${r.rangeLow}-${r.rangeHigh}` : '—'}</td>
                    <td>{r.action}</td>
                    <td>{r.valid ? <span className="badge PAID">Valid</span> : <span className="badge EXPIRED">{r.errors.join('; ')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={handleBulkCommit} disabled={bulkPreview.validRows === 0} style={{ marginTop: 12 }}>
              Upload {bulkPreview.validRows} Valid Rows
            </button>
          </>
        )}
        {bulkMessage && <p style={{ color: '#166534' }}>{bulkMessage}</p>}
      </div>
    </div>
  );
}
