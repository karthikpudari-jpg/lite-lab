import { useEffect, useState } from 'react';
import api from '../../api/client';
import SearchSelect from '../../components/SearchSelect';
import { downloadFile } from '../../utils/download';

export default function Masters() {
  const [tests, setTests] = useState([]);
  const [newTest, setNewTest] = useState({ testCode: '', testName: '' });
  const [paramForm, setParamForm] = useState({ testId: '', parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
  const [error, setError] = useState('');

  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkMessage, setBulkMessage] = useState('');

  async function load() {
    const { data } = await api.get('/admin/masters/tests');
    setTests(data);
  }
  useEffect(() => { load(); }, []);

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
    setError('');
    try {
      await api.post(`/admin/masters/tests/${paramForm.testId}/parameters`, paramForm);
      setParamForm({ testId: paramForm.testId, parameterName: '', unit: '', normalRangeLow: '', normalRangeHigh: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add parameter');
    }
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
      unit: r.unit, normalRangeLow: r.normalRangeLow, normalRangeHigh: r.normalRangeHigh,
    }));
    const { data } = await api.post('/admin/masters/tests/upload/commit', { rows });
    setBulkMessage(`${data.testsCreated} test(s) created, ${data.parametersAdded} parameter(s) added, ${data.skipped} already existed, ${data.errors.length} failed.`);
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
                <td>{(t.ParameterMasters || []).map((p) => `${p.parameterName} (${p.normalRangeLow}-${p.normalRangeHigh} ${p.unit || ''})`).join(', ') || '—'}</td>
              </tr>
            ))}
            {tests.length === 0 && <tr><td colSpan={3}>No tests configured yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Add Parameter to a Test</h3>
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
          <label><span>Normal Range Low</span><input value={paramForm.normalRangeLow} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeLow: e.target.value }))} /></label>
          <label><span>Normal Range High</span><input value={paramForm.normalRangeHigh} onChange={(e) => setParamForm((f) => ({ ...f, normalRangeHigh: e.target.value }))} /></label>
          <button type="submit" disabled={!paramForm.testId}>Add Parameter</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>Bulk Upload — Tests &amp; Parameters</h3>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Columns: TEST_CODE, TEST_NAME, PARAMETER_NAME, UNIT, NORMAL_RANGE_LOW, NORMAL_RANGE_HIGH.
          One row per parameter — repeat TEST_CODE/TEST_NAME across rows for a test with multiple
          parameters, or leave PARAMETER_NAME blank to just create the test.
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
              <thead><tr><th>Row</th><th>Test Code</th><th>Test Name</th><th>Parameter</th><th>Action</th><th>Status</th></tr></thead>
              <tbody>
                {bulkPreview.preview.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td><td>{r.testCode}</td><td>{r.testName}</td><td>{r.parameterName || '—'}</td>
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
