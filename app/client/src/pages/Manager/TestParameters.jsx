import { useEffect, useState } from 'react';
import api from '../../api/client';
import SearchSelect from '../../components/SearchSelect';
import { downloadFile } from '../../utils/download';

const GENDER_OPTIONS = ['Any', 'Male', 'Female', 'Other'];
const emptyRangeRow = () => ({ gender: 'Any', ageMin: '', ageMax: '', normalRangeLow: '', normalRangeHigh: '' });

export default function TestParameters() {
  const [tests, setTests] = useState([]);
  const [shortNames, setShortNames] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [paramForm, setParamForm] = useState({ parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
  const [rangeRows, setRangeRows] = useState([]); // extra age/gender-specific rules for the parameter being created
  const [paramError, setParamError] = useState('');
  const [shortNameForm, setShortNameForm] = useState({ testId: '', shortName: '' });

  const [manageParam, setManageParam] = useState(null); // parameter row whose ranges are being managed
  const [newRange, setNewRange] = useState(emptyRangeRow());
  const [rangeError, setRangeError] = useState('');

  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkMessage, setBulkMessage] = useState('');

  async function loadAll() {
    const [testsRes, shortNamesRes] = await Promise.all([
      api.get('/test-config/tests'),
      api.get('/test-config/test-shortname'),
    ]);
    setTests(testsRes.data);
    setShortNames(shortNamesRes.data);
    return { tests: testsRes.data };
  }
  useEffect(() => { loadAll(); }, []);

  const selectedTest = tests.find((t) => t.id === Number(selectedTestId));

  async function handleAddParameter(e) {
    e.preventDefault();
    setParamError('');
    if (!selectedTestId) { setParamError('Pick a test first.'); return; }
    const normalRanges = rangeRows.filter((r) => r.normalRangeLow || r.normalRangeHigh);
    try {
      await api.post(`/test-config/tests/${selectedTestId}/parameters`, { ...paramForm, normalRanges });
      setParamForm({ parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
      setRangeRows([]);
      loadAll();
    } catch (err) {
      setParamError(err.response?.data?.message || 'Failed to add parameter');
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
    setRangeError('');
    try {
      await api.post(`/test-config/parameters/${manageParam.id}/ranges`, newRange);
      setNewRange(emptyRangeRow());
      const data = await loadAll();
      const freshTest = data.tests.find((t) => t.id === Number(selectedTestId));
      setManageParam((prev) => freshTest?.ParameterMasters?.find((p) => p.id === prev.id) || prev);
    } catch (err) {
      setRangeError(err.response?.data?.message || 'Failed to add normal range');
    }
  }

  async function handleDeleteRange(rangeId) {
    await api.delete(`/test-config/parameters/${manageParam.id}/ranges/${rangeId}`);
    const data = await loadAll();
    const freshTest = data.tests.find((t) => t.id === Number(selectedTestId));
    setManageParam((prev) => freshTest?.ParameterMasters?.find((p) => p.id === prev.id) || prev);
  }

  async function handleSetShortName(e) {
    e.preventDefault();
    await api.put('/test-config/test-shortname', {
      testId: Number(shortNameForm.testId), shortName: shortNameForm.shortName,
    });
    setShortNameForm({ testId: '', shortName: '' });
    loadAll();
  }

  async function handleBulkPreview(e) {
    e.preventDefault();
    if (!bulkFile) return;
    setBulkMessage('');
    const formData = new FormData();
    formData.append('file', bulkFile);
    const { data } = await api.post('/test-config/test-shortname/upload/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setBulkPreview(data);
  }

  async function handleBulkCommit() {
    const rows = bulkPreview.preview.filter((r) => r.valid).map((r) => ({ testCode: r.testCode, shortName: r.shortName }));
    const { data } = await api.post('/test-config/test-shortname/upload/commit', { rows });
    setBulkMessage(`Uploaded: ${data.success.length} succeeded, ${data.errors.length} failed.`);
    setBulkPreview(null);
    setBulkFile(null);
    loadAll();
  }

  return (
    <div>
      <div className="card">
        <h3>Test Parameters</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Add your own parameters for a test. A parameter you add here is private to your lab — it never shows up
          for, or gets added to, any other client. Universal parameters (set up centrally) still appear below
          alongside your own.
        </p>
        <div style={{ maxWidth: 340, marginBottom: 14 }}>
          <span style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>Test</span>
          <SearchSelect
            options={tests.map((t) => ({ value: t.id, label: `${t.testCode} — ${t.testName}` }))}
            value={selectedTestId}
            onChange={setSelectedTestId}
            placeholder="Search by test code or name…"
          />
        </div>

        {selectedTestId && (
          <>
            <form onSubmit={handleAddParameter} className="form-grid" style={{ alignItems: 'end' }}>
              <label><span>Parameter Name</span>
                <input value={paramForm.parameterName} onChange={(e) => setParamForm((f) => ({ ...f, parameterName: e.target.value }))} required />
              </label>
              <label><span>Unit</span>
                <input value={paramForm.unit} onChange={(e) => setParamForm((f) => ({ ...f, unit: e.target.value }))} />
              </label>
              <label><span>Default Normal Range Low</span>
                <input value={paramForm.normalRangeLow} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeLow: e.target.value }))} />
              </label>
              <label><span>Default Normal Range High</span>
                <input value={paramForm.normalRangeHigh} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeHigh: e.target.value }))} />
              </label>
              <button type="submit">Add Parameter</button>
            </form>

            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
                Optional age/gender-specific ranges (e.g. Male 18-60, Female 18-60). The default range above is used
                whenever a patient doesn't match any of these.
              </p>
              {rangeRows.map((r, idx) => (
                <div key={idx} className="form-grid" style={{ alignItems: 'end', marginBottom: 6 }}>
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

            {paramError && <p className="error-text">{paramError}</p>}
            <table style={{ marginTop: 14 }}>
              <thead><tr><th>Code</th><th>Parameter</th><th>Unit</th><th>Default Range</th><th>Age/Gender Ranges</th><th>Source</th><th></th></tr></thead>
              <tbody>
                {(selectedTest?.ParameterMasters || []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.parameterCode || '—'}</td>
                    <td>{p.parameterName}</td>
                    <td>{p.unit || '—'}</td>
                    <td>{p.normalRangeLow || '—'} - {p.normalRangeHigh || '—'}</td>
                    <td>{(p.ParameterNormalRanges || []).length}</td>
                    <td>{p.clientId ? <span className="badge PENDING_COLLECTION">Your Parameter</span> : <span className="badge PAID">Universal</span>}</td>
                    <td><button type="button" onClick={() => openManageRanges(p)}>Manage Ranges</button></td>
                  </tr>
                ))}
                {(selectedTest?.ParameterMasters || []).length === 0 && <tr><td colSpan={7}>No parameters yet for this test.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

      {manageParam && (
        <div className="modal-overlay" onClick={() => setManageParam(null)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2>Normal Ranges — {manageParam.parameterName}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Default range: {manageParam.normalRangeLow || '—'} - {manageParam.normalRangeHigh || '—'} (used when no rule below matches).
            </p>
            <table>
              <thead><tr><th>Gender</th><th>Age From</th><th>Age To</th><th>Range</th><th></th></tr></thead>
              <tbody>
                {(manageParam.ParameterNormalRanges || []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.gender}</td>
                    <td>{r.ageMin ?? '—'}</td>
                    <td>{r.ageMax ?? '—'}</td>
                    <td>{r.normalRangeLow || '—'} - {r.normalRangeHigh || '—'}</td>
                    <td><button type="button" className="secondary" onClick={() => handleDeleteRange(r.id)}>Remove</button></td>
                  </tr>
                ))}
                {(manageParam.ParameterNormalRanges || []).length === 0 && <tr><td colSpan={5}>No age/gender rules yet — the default range applies to everyone.</td></tr>}
              </tbody>
            </table>

            <form onSubmit={handleAddExistingRange} className="form-grid" style={{ alignItems: 'end', marginTop: 12 }}>
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
              <label><span>Range Low</span>
                <input value={newRange.normalRangeLow} onChange={(e) => setNewRange((f) => ({ ...f, normalRangeLow: e.target.value }))} />
              </label>
              <label><span>Range High</span>
                <input value={newRange.normalRangeHigh} onChange={(e) => setNewRange((f) => ({ ...f, normalRangeHigh: e.target.value }))} />
              </label>
              <button type="submit">Add Range</button>
            </form>
            {rangeError && <p className="error-text">{rangeError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setManageParam(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Test Short Name</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Set your own shortcut/abbreviated name for a test — for quick search or a compact report layout. Only
          your lab sees this, just like your test prices.
        </p>
        <form onSubmit={handleSetShortName} className="form-grid" style={{ alignItems: 'end' }}>
          <div><span>Test</span>
            <SearchSelect
              options={tests.map((t) => ({ value: t.id, label: `${t.testCode} — ${t.testName}` }))}
              value={shortNameForm.testId}
              onChange={(testId) => setShortNameForm((f) => ({ ...f, testId }))}
              placeholder="Search by test code or name…"
            />
          </div>
          <label><span>Short Name</span>
            <input value={shortNameForm.shortName} onChange={(e) => setShortNameForm((f) => ({ ...f, shortName: e.target.value }))} required />
          </label>
          <button type="submit" disabled={!shortNameForm.testId}>Set Short Name</button>
        </form>
        <table>
          <thead><tr><th>Test Code</th><th>Test Name</th><th>Short Name</th></tr></thead>
          <tbody>
            {shortNames.map((s) => (
              <tr key={s.id}><td>{s.TestMaster?.testCode}</td><td>{s.TestMaster?.testName}</td><td>{s.shortName}</td></tr>
            ))}
            {shortNames.length === 0 && <tr><td colSpan={3}>No short names set yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Bulk Update — Test Short Names</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>Columns: TEST_CODE, TEST_NAME, SHORT_NAME</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className="secondary" onClick={() => downloadFile('/test-config/test-shortname/template', 'test-shortname-template.xlsx')}>
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
              <thead><tr><th>Row</th><th>Test Code</th><th>Short Name</th><th>Status</th></tr></thead>
              <tbody>
                {bulkPreview.preview.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td><td>{r.testCode}</td><td>{r.shortName}</td>
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
        {bulkMessage && <p>{bulkMessage}</p>}
      </div>
    </div>
  );
}
