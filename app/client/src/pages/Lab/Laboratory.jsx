import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Icon } from '../../components/Icons';

const RESULT_ENTRY_STATUSES = ['COLLECTED', 'RESULT_ENTERED', 'VERIFIED'];

function overallStatusClass(samples) {
  if (samples.every((s) => s.status === 'RELEASED')) return 'status-released';
  if (samples.some((s) => s.status !== 'PENDING_COLLECTION')) return 'status-inprogress';
  return 'status-pending';
}

const STATUS_FILTERS = ['', 'PENDING_COLLECTION', 'COLLECTED', 'RESULT_ENTERED', 'VERIFIED', 'RELEASED'];

function groupByBill(samples) {
  const groups = new Map();
  for (const s of samples) {
    const bill = s.BillItem?.Bill;
    if (!bill) continue;
    if (!groups.has(bill.id)) {
      groups.set(bill.id, { billId: bill.id, billNo: bill.billNo, patient: bill.Patient, samples: [] });
    }
    groups.get(bill.id).samples.push(s);
  }
  return [...groups.values()].sort((a, b) => b.billId - a.billId);
}

export default function Laboratory() {
  const navigate = useNavigate();
  const [samples, setSamples] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedBillId, setExpandedBillId] = useState(null);
  const [activeSample, setActiveSample] = useState(null);
  const [resultValues, setResultValues] = useState({});
  const [bulkSamples, setBulkSamples] = useState(null); // array of samples being entered together
  const [bulkValues, setBulkValues] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await api.get('/lab/samples', { params: statusFilter ? { status: statusFilter } : {} });
    setSamples(data);
  }
  useEffect(() => { load(); }, [statusFilter]);

  const groups = useMemo(() => groupByBill(samples), [samples]);

  async function doAction(sample, action) {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await api.post(`/lab/samples/${sample.id}/${action}`);
      if (activeSample?.id === sample.id) setActiveSample(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function openResultEntry(sample) {
    setActiveSample(sample);
    const initial = {};
    for (const r of sample.Results || []) initial[r.parameterId] = r.value;
    setResultValues(initial);
  }

  async function submitResults(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const parameters = activeSample.BillItem?.TestMaster?.ParameterMasters || [];
    const results = parameters.map((p) => ({ parameterId: p.id, value: resultValues[p.id] || '' }));
    try {
      await api.post(`/lab/samples/${activeSample.id}/results`, { results });
      setActiveSample(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save results');
    } finally {
      setBusy(false);
    }
  }

  // --- Bulk entry: enter results for every eligible test on a patient's bill in one screen. ---
  function openBulkResultEntry(group) {
    const eligible = group.samples.filter((s) => RESULT_ENTRY_STATUSES.includes(s.status));
    setBulkSamples(eligible);
    const initial = {};
    for (const s of eligible) {
      initial[s.id] = {};
      for (const r of s.Results || []) initial[s.id][r.parameterId] = r.value;
    }
    setBulkValues(initial);
  }

  async function submitBulkResults(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      for (const s of bulkSamples) {
        const parameters = s.BillItem?.TestMaster?.ParameterMasters || [];
        const results = parameters.map((p) => ({ parameterId: p.id, value: bulkValues[s.id]?.[p.id] || '' }));
        await api.post(`/lab/samples/${s.id}/results`, { results });
      }
      setBulkSamples(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save one or more results');
    } finally {
      setBusy(false);
    }
  }

  // --- Bulk verify: verify every RESULT_ENTERED test on a patient's bill in one click. ---
  async function verifyAll(group) {
    if (busy) return;
    setError('');
    setBusy(true);
    const eligible = group.samples.filter((s) => s.status === 'RESULT_ENTERED');
    try {
      for (const s of eligible) {
        await api.post(`/lab/samples/${s.id}/verify`);
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to verify one or more tests');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <h3 className="section-heading" style={{ margin: 0 }}>
          <span className="icon-badge"><Icon name="lab" size={17} /></span> Patients
        </h3>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 220 }}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
      </div>
      {error && <p className="error-text">{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {groups.map((g) => {
          const expanded = expandedBillId === g.billId;
          const releasedCount = g.samples.filter((s) => s.status === 'RELEASED').length;
          const resultEntryCount = g.samples.filter((s) => RESULT_ENTRY_STATUSES.includes(s.status)).length;
          const verifyCount = g.samples.filter((s) => s.status === 'RESULT_ENTERED').length;
          return (
            <div className={`card lab-card ${overallStatusClass(g.samples)}`} key={g.billId} style={{ marginBottom: 0 }}>
              <div
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setExpandedBillId(expanded ? null : g.billId)}
              >
                <div>
                  <strong>{g.patient?.name}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Bill {g.billNo} · {g.samples.length} test(s)</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {releasedCount > 0 && (
                    <button
                      title="View consolidated report"
                      onClick={(e) => { e.stopPropagation(); navigate(`/app/report/${g.billId}`); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Icon name="orders" size={15} /> Report
                    </button>
                  )}
                  <span>{expanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded && (
                <>
                  {g.samples.length > 1 && (resultEntryCount > 0 || verifyCount > 0) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {resultEntryCount > 0 && (
                        <button onClick={() => openBulkResultEntry(g)} disabled={busy}>
                          Enter All Results ({resultEntryCount})
                        </button>
                      )}
                      {verifyCount > 0 && (
                        <button className="secondary" onClick={() => verifyAll(g)} disabled={busy}>
                          {busy ? 'Verifying…' : `Verify All (${verifyCount})`}
                        </button>
                      )}
                    </div>
                  )}
                  <table style={{ marginTop: 12 }}>
                    <thead><tr><th>Test</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {g.samples.map((s) => (
                        <tr key={s.id}>
                          <td>{s.BillItem?.TestMaster?.testName}</td>
                          <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                          <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {s.status === 'PENDING_COLLECTION' && <button onClick={() => doAction(s, 'collect')} disabled={busy}>Collect</button>}
                            {RESULT_ENTRY_STATUSES.includes(s.status) && (
                              <button onClick={() => openResultEntry(s)} disabled={busy}>Results</button>
                            )}
                            {s.status === 'RESULT_ENTERED' && <button onClick={() => doAction(s, 'verify')} disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>}
                            {s.status === 'VERIFIED' && <button onClick={() => doAction(s, 'release')} disabled={busy}>Release</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <p>No samples.</p>}
      </div>

      {activeSample && (
        <div className="modal-overlay" onClick={() => setActiveSample(null)}>
          <div className="modal-card" style={{ textAlign: 'left', width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3>Result Entry — {activeSample.BillItem?.TestMaster?.testName}</h3>
            <form onSubmit={submitResults}>
              {(activeSample.BillItem?.TestMaster?.ParameterMasters || []).map((p) => (
                <label key={p.id}>
                  <span>{p.parameterCode ? `[${p.parameterCode}] ` : ''}{p.parameterName} ({p.unit}) — Normal: {p.normalRangeLow}-{p.normalRangeHigh}</span>
                  <input
                    value={resultValues[p.id] || ''}
                    onChange={(e) => setResultValues((v) => ({ ...v, [p.id]: e.target.value }))}
                    required
                  />
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save Results'}</button>
                {activeSample.status === 'RESULT_ENTERED' && (
                  <button type="button" onClick={() => doAction(activeSample, 'verify')} disabled={busy}>
                    {busy ? 'Verifying…' : 'Verify'}
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => setActiveSample(null)} disabled={busy}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {bulkSamples && (
        <div className="modal-overlay" onClick={() => setBulkSamples(null)}>
          <div className="modal-card" style={{ textAlign: 'left', width: 480, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h3>Enter All Results ({bulkSamples.length} test{bulkSamples.length > 1 ? 's' : ''})</h3>
            <form onSubmit={submitBulkResults}>
              {bulkSamples.map((s) => (
                <div key={s.id} style={{ marginBottom: 16 }}>
                  <h4 style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
                    {s.BillItem?.TestMaster?.testName}
                  </h4>
                  {(s.BillItem?.TestMaster?.ParameterMasters || []).map((p) => (
                    <label key={p.id}>
                      <span>{p.parameterCode ? `[${p.parameterCode}] ` : ''}{p.parameterName} ({p.unit}) — Normal: {p.normalRangeLow}-{p.normalRangeHigh}</span>
                      <input
                        value={bulkValues[s.id]?.[p.id] || ''}
                        onChange={(e) => setBulkValues((v) => ({ ...v, [s.id]: { ...v[s.id], [p.id]: e.target.value } }))}
                        required
                      />
                    </label>
                  ))}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save All Results'}</button>
                <button type="button" className="secondary" onClick={() => setBulkSamples(null)} disabled={busy}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
