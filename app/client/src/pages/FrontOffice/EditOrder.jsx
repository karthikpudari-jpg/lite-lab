import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';

const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Insurance'];

// Everything needed to amend an already-billed order in one place: add a
// test, cancel a test (with refund), and record a payment against whatever
// is still due - the three actions #8/#9/#10/#13 all boiled down to.
export default function EditOrder() {
  const { billId } = useParams();
  const [bill, setBill] = useState(null);
  const [prices, setPrices] = useState([]);
  const [testQuery, setTestQuery] = useState('');
  const [error, setError] = useState('');
  const [addingTestId, setAddingTestId] = useState(null);

  const [dueForm, setDueForm] = useState({ amount: '', mode: 'Cash', reference: '' });
  const [dueError, setDueError] = useState('');
  const [dueSaving, setDueSaving] = useState(false);

  const [cancelItem, setCancelItem] = useState(null);
  const [cancelForm, setCancelForm] = useState({ amount: '', mode: 'Cash', reason: '' });
  const [cancelError, setCancelError] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);

  async function load() {
    const { data } = await api.get(`/billing/bills/${billId}`);
    setBill(data);
    setDueForm((f) => ({ ...f, amount: String(data.dueAmount || '') }));
  }
  useEffect(() => {
    load();
    api.get('/billing/test-prices').then((r) => setPrices(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId]);

  if (!bill) return <p>Loading…</p>;

  const activeTestIds = new Set(bill.BillItems.filter((i) => i.status === 'ACTIVE').map((i) => i.testId));
  const q = testQuery.trim().toLowerCase();
  const suggestions = q
    ? prices.filter((p) => !activeTestIds.has(p.testId) && (
      p.TestMaster?.testName?.toLowerCase().includes(q) || p.TestMaster?.testCode?.toLowerCase().includes(q)
    )).slice(0, 20)
    : [];

  async function handleAddTest(testId) {
    if (addingTestId) return; // guard against rapid double-click adding the test twice
    setError('');
    setAddingTestId(testId);
    try {
      await api.post(`/billing/bills/${billId}/items`, { testId });
      setTestQuery('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add test');
    } finally {
      setAddingTestId(null);
    }
  }

  async function handleRecordDue(e) {
    e.preventDefault();
    if (dueSaving) return;
    setDueError('');
    setDueSaving(true);
    try {
      await api.post(`/billing/bills/${billId}/due-payments`, {
        amount: Number(dueForm.amount), mode: dueForm.mode, reference: dueForm.reference || undefined,
      });
      await load();
    } catch (err) {
      setDueError(err.response?.data?.message || 'Failed to record payment');
    } finally {
      setDueSaving(false);
    }
  }

  function openCancel(item) {
    const refunded = (item.Refunds || []).reduce((s, r) => s + Number(r.amount), 0);
    setCancelItem(item);
    setCancelForm({ amount: String(Number(item.price) - refunded), mode: 'Cash', reason: '' });
    setCancelError('');
  }

  async function handleCancelTest(e) {
    e.preventDefault();
    if (cancelSaving) return;
    setCancelError('');
    setCancelSaving(true);
    try {
      await api.put(`/billing/bills/${billId}/items/${cancelItem.id}/cancel`, {
        amount: Number(cancelForm.amount), mode: cancelForm.mode, reason: cancelForm.reason || undefined,
      });
      setCancelItem(null);
      await load();
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Failed to cancel test');
    } finally {
      setCancelSaving(false);
    }
  }

  return (
    <div>
      <p><Link to="/app/orders">&larr; Back to Orders</Link></p>

      <div className="card">
        <h3>Edit Order — {bill.billNo}</h3>
        <div className="review-box">
          <div className="review-box-row"><span>Patient</span><span>{bill.Patient?.name} ({bill.Patient?.umr})</span></div>
          <div className="review-box-row"><span>Total</span><span>₹{bill.totalAmount}</span></div>
          <div className="review-box-row"><span>Discount</span><span>₹{bill.discount}</span></div>
          <div className="review-box-row"><span>Paid</span><span>₹{bill.paidAmount}</span></div>
          <div className="review-box-row">
            <span>Due</span>
            <span style={{ color: Number(bill.dueAmount) > 0 ? '#dc2626' : undefined, fontWeight: 700 }}>₹{bill.dueAmount}</span>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}

        <table style={{ marginTop: 14 }}>
          <thead><tr><th>Test</th><th>Price</th><th>Status</th><th>Refunded</th><th></th></tr></thead>
          <tbody>
            {bill.BillItems.map((item) => {
              const refunded = (item.Refunds || []).reduce((s, r) => s + Number(r.amount), 0);
              return (
                <tr key={item.id}>
                  <td>{item.TestMaster?.testName}</td>
                  <td>₹{item.price}</td>
                  <td><span className={`badge ${item.status === 'CANCELLED' ? 'CANCELLED' : 'PAID'}`}>{item.status}</span></td>
                  <td>{refunded > 0 ? `₹${refunded.toFixed(2)}` : '—'}</td>
                  <td>
                    {item.status === 'ACTIVE' && item.Sample?.status !== 'RELEASED' && (
                      <button type="button" className="secondary" onClick={() => openCancel(item)}>Cancel</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Add Test</h3>
        <input
          placeholder="Search test to add…"
          value={testQuery}
          onChange={(e) => setTestQuery(e.target.value)}
          style={{ maxWidth: 340 }}
        />
        {suggestions.length > 0 && (
          <div className="search-select-results" style={{ maxWidth: 340, position: 'relative' }}>
            {suggestions.map((p) => (
              <div key={p.id} className="search-select-item" onClick={() => handleAddTest(p.testId)}>
                {p.TestMaster?.testName} <span style={{ color: '#64748b' }}>· ₹{p.price}</span>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Adding a test adds its price to this bill's due amount - collect it below once paid.
        </p>
      </div>

      {Number(bill.dueAmount) > 0 && (
        <div className="card">
          <h3>Record Due Payment</h3>
          <form onSubmit={handleRecordDue} className="form-grid" style={{ alignItems: 'end' }}>
            <label><span>Amount (max ₹{bill.dueAmount})</span>
              <input
                type="number" min="0" max={bill.dueAmount}
                value={dueForm.amount}
                onChange={(e) => setDueForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label><span>Mode</span>
              <select value={dueForm.mode} onChange={(e) => setDueForm((f) => ({ ...f, mode: e.target.value }))}>
                {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label><span>Reference (optional)</span>
              <input value={dueForm.reference} onChange={(e) => setDueForm((f) => ({ ...f, reference: e.target.value }))} />
            </label>
            <button type="submit" disabled={dueSaving}>{dueSaving ? 'Recording…' : 'Record Payment'}</button>
          </form>
          {dueError && <p className="error-text">{dueError}</p>}
        </div>
      )}

      {cancelItem && (
        <div className="modal-overlay" onClick={() => setCancelItem(null)}>
          <div className="modal-card" style={{ maxWidth: 420, textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
            <h2>Cancel — {cancelItem.TestMaster?.testName}</h2>
            <form onSubmit={handleCancelTest}>
              <label><span>Refund Amount</span>
                <input type="number" min="0" value={cancelForm.amount} onChange={(e) => setCancelForm((f) => ({ ...f, amount: e.target.value }))} />
              </label>
              <label><span>Mode</span>
                <select value={cancelForm.mode} onChange={(e) => setCancelForm((f) => ({ ...f, mode: e.target.value }))}>
                  {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label><span>Reason</span>
                <input value={cancelForm.reason} onChange={(e) => setCancelForm((f) => ({ ...f, reason: e.target.value }))} />
              </label>
              {cancelError && <p className="error-text">{cancelError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" disabled={cancelSaving}>{cancelSaving ? 'Cancelling…' : 'Cancel Test'}</button>
                <button type="button" className="secondary" onClick={() => setCancelItem(null)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
