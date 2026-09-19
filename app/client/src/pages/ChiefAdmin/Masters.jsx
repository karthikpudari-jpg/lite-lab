import { useEffect, useMemo, useState } from 'react';
import api from '../../api/client';
import { Icon } from '../../components/Icons';
import { downloadFile } from '../../utils/download';

const GENDER_OPTIONS = ['Any', 'Male', 'Female', 'Other'];
const AGE_UNIT_OPTIONS = ['Years', 'Months', 'Days'];
const AGE_UNIT_ABBR = { Years: 'y', Months: 'm', Days: 'd' };
const emptyRangeRow = () => ({ gender: 'Any', ageMin: '', ageMax: '', ageUnit: 'Years', normalRangeLow: '', normalRangeHigh: '' });
const blankTestForm = () => ({ testCode: '', testName: '', category: '', sampleType: '' });
const blankParamForm = () => ({ parameterName: '', unit: '', method: '' });
// Narrower than the app-wide .form-grid default (minmax 200px) so Gender/Age/Unit/Range fields
// wrap two-three to a row instead of stacking one-per-row on a narrow/mobile screen.
const rangeGridStyle = { alignItems: 'end', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' };

function pillClass(gender) {
  if (gender === 'Male') return 'range-pill male';
  if (gender === 'Female') return 'range-pill female';
  return 'range-pill neutral';
}

/** Every age/gender-specific rule shown as its own pill, or the parameter's flat default range if it has none. */
function RangeMatrix({ param }) {
  const ranges = param.ParameterNormalRanges || [];
  if (ranges.length === 0) {
    return <span className="range-pill neutral">{param.normalRangeLow || '—'}–{param.normalRangeHigh || '—'} {param.unit || ''}</span>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      {ranges.map((r) => (
        <span key={r.id} className={pillClass(r.gender)}>
          {r.gender} · {r.ageMin ?? '0'}-{r.ageMax ?? '∞'}{AGE_UNIT_ABBR[r.ageUnit] || 'y'} · {r.normalRangeLow || '—'}-{r.normalRangeHigh || '—'} {param.unit || ''}
        </span>
      ))}
    </div>
  );
}

export default function Masters() {
  const [tests, setTests] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [error, setError] = useState('');

  const [showTestModal, setShowTestModal] = useState(false);
  const [testForm, setTestForm] = useState(blankTestForm());
  const [savingTest, setSavingTest] = useState(false);

  const [showParamModal, setShowParamModal] = useState(false);
  const [paramForm, setParamForm] = useState(blankParamForm());
  const [rangeRows, setRangeRows] = useState([]); // extra age/gender-specific rules for the parameter being created
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

  const selectedTest = tests.find((t) => t.id === selectedTestId);

  const categories = useMemo(() => {
    const set = new Set(tests.map((t) => t.category).filter(Boolean));
    return [...set].sort();
  }, [tests]);

  const filteredTests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tests.filter((t) => {
      if (categoryFilter !== 'All' && (t.category || 'Uncategorized') !== categoryFilter) return false;
      if (!q) return true;
      return t.testName.toLowerCase().includes(q) || t.testCode.toLowerCase().includes(q);
    });
  }, [tests, search, categoryFilter]);

  function openNewTest() {
    setError('');
    setTestForm(blankTestForm());
    setShowTestModal(true);
  }

  async function handleSaveTest(e) {
    e.preventDefault();
    if (savingTest) return;
    setError('');
    setSavingTest(true);
    try {
      const { data } = await api.post('/admin/masters/tests', testForm);
      setShowTestModal(false);
      await load();
      setSelectedTestId(data.id);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create test');
    } finally {
      setSavingTest(false);
    }
  }

  function openAddParameter() {
    setError('');
    setParamForm(blankParamForm());
    setRangeRows([emptyRangeRow()]);
    setShowParamModal(true);
  }

  async function handleAddParameter(e) {
    e.preventDefault();
    if (savingParam) return; // guard against rapid double-submit creating a duplicate parameter
    setError('');
    const normalRanges = rangeRows.filter((r) => r.normalRangeLow || r.normalRangeHigh);
    if (normalRanges.length === 0) {
      setError('At least one age/gender range (with a Range Low or Range High value) is required.');
      return;
    }
    setSavingParam(true);
    try {
      await api.post(`/admin/masters/tests/${selectedTestId}/parameters`, { ...paramForm, normalRanges });
      setShowParamModal(false);
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
      const freshTest = data.tests.find((t) => t.id === selectedTestId);
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
    const freshTest = data.tests.find((t) => t.id === selectedTestId);
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
      testCode: r.testCode, testName: r.testName, testCategory: r.testCategory, sampleType: r.sampleType,
      parameterName: r.parameterName, unit: r.unit, method: r.method, normalRangeLow: r.normalRangeLow, normalRangeHigh: r.normalRangeHigh,
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
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="icon-badge" style={{ width: 40, height: 40 }}><Icon name="masters" size={20} /></span>
        <div>
          <h3 style={{ margin: 0 }}>Test Parameters</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Reference ranges by gender &amp; age</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="masters-layout">
        <div className="card masters-sidebar">
          <div className="masters-sidebar-head">
            <span>TESTS</span>
            <button type="button" onClick={openNewTest}>+ New</button>
          </div>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="All">All groups ({tests.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c} ({tests.filter((t) => t.category === c).length})</option>
            ))}
          </select>
          <input placeholder="Search tests…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="test-pick-list">
            {filteredTests.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`test-pick-card${t.id === selectedTestId ? ' active' : ''}`}
                onClick={() => setSelectedTestId(t.id)}
              >
                <strong>{t.testName}</strong>
                <span className="meta">{t.category || 'Uncategorized'} · {(t.ParameterMasters || []).length} param(s)</span>
              </button>
            ))}
            {filteredTests.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8' }}>No tests found.</p>}
          </div>
        </div>

        <div className="card masters-detail">
          {!selectedTest && <p className="masters-empty">Select a test on the left, or create a new one.</p>}
          {selectedTest && (
            <>
              <div className="masters-detail-head">
                <div>
                  <h2>{selectedTest.testName}</h2>
                  <p className="meta">
                    {selectedTest.category || 'Uncategorized'} · {selectedTest.sampleType || 'Sample type not set'} ·{' '}
                    {(selectedTest.ParameterMasters || []).length} parameter(s) configured
                  </p>
                </div>
                <button type="button" onClick={openAddParameter}>+ Add Parameter</button>
              </div>
              <table>
                <thead><tr><th>Code</th><th>Parameter</th><th>Unit</th><th>Range Matrix</th><th></th></tr></thead>
                <tbody>
                  {(selectedTest.ParameterMasters || []).map((p) => (
                    <tr key={p.id}>
                      <td>{p.parameterCode || '—'}</td>
                      <td>
                        {p.parameterName}
                        {p.method && <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.method}</div>}
                      </td>
                      <td>{p.unit || '—'}</td>
                      <td><RangeMatrix param={p} /></td>
                      <td>
                        <button type="button" className="secondary icon-btn" title="Manage ranges" onClick={() => openManageRanges(p)}>
                          <Icon name="edit" size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(selectedTest.ParameterMasters || []).length === 0 && <tr><td colSpan={5}>No parameters yet for this test.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {showTestModal && (
        <div className="modal-overlay" onClick={() => setShowTestModal(false)}>
          <div className="modal-card" style={{ textAlign: 'left', width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2>New Test</h2>
            <form onSubmit={handleSaveTest}>
              <label><span>Test Code</span>
                <input value={testForm.testCode} onChange={(e) => setTestForm((f) => ({ ...f, testCode: e.target.value }))} required />
              </label>
              <label><span>Test Name</span>
                <input value={testForm.testName} onChange={(e) => setTestForm((f) => ({ ...f, testName: e.target.value }))} required />
              </label>
              <label><span>Test Group</span>
                <input
                  value={testForm.category}
                  onChange={(e) => setTestForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Pick an existing group or type a new one"
                  list="test-group-options"
                />
                <datalist id="test-group-options">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <label><span>Sample Type</span>
                <input value={testForm.sampleType} onChange={(e) => setTestForm((f) => ({ ...f, sampleType: e.target.value }))} placeholder="e.g. Blood" />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" disabled={savingTest}>{savingTest ? 'Creating…' : 'Create Test'}</button>
                <button type="button" className="secondary" onClick={() => setShowTestModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showParamModal && selectedTest && (
        <div className="modal-overlay" onClick={() => setShowParamModal(false)}>
          <div className="modal-card" style={{ textAlign: 'left', width: 620, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2>Add Parameter — {selectedTest.testName}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>The parameter code is generated automatically - no need to type one.</p>
            <form onSubmit={handleAddParameter}>
              <div className="form-grid" style={{ alignItems: 'end' }}>
                <label><span>Parameter Name</span>
                  <input value={paramForm.parameterName} onChange={(e) => setParamForm((f) => ({ ...f, parameterName: e.target.value }))} required />
                </label>
                <label><span>Unit</span>
                  <input value={paramForm.unit} onChange={(e) => setParamForm((f) => ({ ...f, unit: e.target.value }))} />
                </label>
                <label><span>Method</span>
                  <input value={paramForm.method} onChange={(e) => setParamForm((f) => ({ ...f, method: e.target.value }))} placeholder="e.g. Photometry" />
                </label>
              </div>

              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
                  Age/gender-specific ranges (e.g. Male 18-60, Female 18-60) - at least one is required, since this is
                  the only way a normal range is set for this parameter.
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

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="submit" disabled={savingParam}>{savingParam ? 'Adding…' : 'Add Parameter'}</button>
                <button type="button" className="secondary" onClick={() => setShowParamModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          Columns: TEST_CODE, TEST_NAME, TEST_CATEGORY, SAMPLE_TYPE, PARAMETER_NAME, UNIT, METHOD, NORMAL_RANGE_LOW,
          NORMAL_RANGE_HIGH, GENDER, AGE_MIN, AGE_MAX, AGE_UNIT, RANGE_LOW, RANGE_HIGH. One row per parameter (or per
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
