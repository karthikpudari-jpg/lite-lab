import { useEffect, useState } from 'react';
import api from '../../api/client';
import SearchSelect from '../../components/SearchSelect';
import { downloadFile } from '../../utils/download';

export default function TestParameters() {
  const [tests, setTests] = useState([]);
  const [shortNames, setShortNames] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [paramForm, setParamForm] = useState({ parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
  const [paramError, setParamError] = useState('');
  const [shortNameForm, setShortNameForm] = useState({ testId: '', shortName: '' });

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
  }
  useEffect(() => { loadAll(); }, []);

  const selectedTest = tests.find((t) => t.id === Number(selectedTestId));

  async function handleAddParameter(e) {
    e.preventDefault();
    setParamError('');
    if (!selectedTestId) { setParamError('Pick a test first.'); return; }
    try {
      await api.post(`/test-config/tests/${selectedTestId}/parameters`, paramForm);
      setParamForm({ parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
      loadAll();
    } catch (err) {
      setParamError(err.response?.data?.message || 'Failed to add parameter');
    }
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
              <label><span>Normal Range Low</span>
                <input value={paramForm.normalRangeLow} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeLow: e.target.value }))} />
              </label>
              <label><span>Normal Range High</span>
                <input value={paramForm.normalRangeHigh} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeHigh: e.target.value }))} />
              </label>
              <button type="submit">Add Parameter</button>
            </form>
            {paramError && <p className="error-text">{paramError}</p>}
            <table>
              <thead><tr><th>Parameter</th><th>Unit</th><th>Normal Range</th><th>Source</th></tr></thead>
              <tbody>
                {(selectedTest?.ParameterMasters || []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.parameterName}</td>
                    <td>{p.unit || '—'}</td>
                    <td>{p.normalRangeLow || '—'} - {p.normalRangeHigh || '—'}</td>
                    <td>{p.clientId ? <span className="badge PENDING_COLLECTION">Your Parameter</span> : <span className="badge PAID">Universal</span>}</td>
                  </tr>
                ))}
                {(selectedTest?.ParameterMasters || []).length === 0 && <tr><td colSpan={4}>No parameters yet for this test.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

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
