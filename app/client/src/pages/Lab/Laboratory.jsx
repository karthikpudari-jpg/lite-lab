import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { Icon } from '../../components/Icons';
import ReviewResults from './ReviewResults';

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
  const [reviewGroup, setReviewGroup] = useState(null); // bill group open in the full-screen Review Results panel
  const [reviewFocusId, setReviewFocusId] = useState(null); // which test within it starts focused
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
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  // Results entry AND verify both open the same Review Results screen - "enter
  // a value" and "confirm a value" are really the same review, just at a
  // different point, so one screen (checkbox-select which tests, edit inline,
  // then Save/Mark Reviewed) covers both instead of two different modals.
  function openReview(group, focusSampleId = null) {
    setReviewGroup(group);
    setReviewFocusId(focusSampleId);
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
                  {g.samples.length > 1 && resultEntryCount > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <button onClick={() => openReview(g)} disabled={busy}>
                        Review Results ({resultEntryCount})
                      </button>
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
                              <button onClick={() => openReview(g, s.id)} disabled={busy}>
                                {s.status === 'RESULT_ENTERED' ? 'Verify' : 'Results'}
                              </button>
                            )}
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

      {reviewGroup && (
        <ReviewResults
          group={reviewGroup}
          focusSampleId={reviewFocusId}
          onClose={() => setReviewGroup(null)}
          onSaved={() => { setReviewGroup(null); load(); }}
        />
      )}
    </div>
  );
}
