import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const REFUND_MODES = ['Cash', 'Card', 'UPI', 'Insurance'];

export default function Orders() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const canConfigure = auth?.user?.roles?.includes('ADMIN') || auth?.user?.roles?.includes('MANAGER');
  const [settings, setSettings] = useState(null); // { allowBillCancellationRefund, refundAllowedDays, allowPostBillingDiscount, postDiscountAllowedDays }
  const [settingsForm, setSettingsForm] = useState({ refundAllowedDays: '0', postDiscountAllowedDays: '0' });
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refundBill, setRefundBill] = useState(null); // the bill row being cancelled/refunded
  const [refundItem, setRefundItem] = useState(null); // which test within that bill
  const [refundForm, setRefundForm] = useState({ amount: '', mode: 'Cash', reason: '' });
  const [refundError, setRefundError] = useState('');
  const [refundSaving, setRefundSaving] = useState(false);

  const [discountBill, setDiscountBill] = useState(null); // the bill row getting a post-billing discount
  const [discountForm, setDiscountForm] = useState({ amount: '', mode: 'Cash', reason: '' });
  const [discountError, setDiscountError] = useState('');
  const [discountSaving, setDiscountSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/billing/bills');
    setBills(data);
    return data;
  }
  async function loadSettings() {
    const { data } = await api.get('/billing-settings');
    setSettings(data);
    setSettingsForm({
      refundAllowedDays: String(data.refundAllowedDays ?? 0),
      postDiscountAllowedDays: String(data.postDiscountAllowedDays ?? 0),
    });
  }
  useEffect(() => { load(); loadSettings(); }, []);

  const filtered = bills.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch = !q
      || b.billNo.toLowerCase().includes(q)
      || b.patient?.name?.toLowerCase().includes(q)
      || b.patient?.umr?.toLowerCase().includes(q)
      || b.patient?.mobile?.includes(q);
    const matchesFrom = !fromDate || b.walkInDate >= fromDate;
    const matchesTo = !toDate || b.walkInDate <= toDate;
    return matchesSearch && matchesFrom && matchesTo;
  });

  async function toggleSetting(key, label) {
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const { data } = await api.put('/billing-settings', { [key]: !settings[key] });
      setSettings(data);
      setSettingsMessage(`${label} is now ${data[key] ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setSettingsMessage(err.response?.data?.message || 'Failed to update setting');
    } finally {
      setSettingsSaving(false);
    }
  }

  async function saveDaysLimit(e, key, label) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage('');
    try {
      const { data } = await api.put('/billing-settings', { [key]: Number(settingsForm[key]) || 0 });
      setSettings(data);
      setSettingsMessage(
        data[key] > 0
          ? `${label} now allowed within ${data[key]} day(s) of billing.`
          : `${label} now allowed with no day limit.`,
      );
    } catch (err) {
      setSettingsMessage(err.response?.data?.message || 'Failed to update setting');
    } finally {
      setSettingsSaving(false);
    }
  }

  function openRefundModal(bill) {
    setRefundBill(bill);
    setRefundItem(null);
    setRefundError('');
  }

  function startRefundFor(item) {
    const remaining = Number(item.price) - Number(item.refundedAmount || 0);
    setRefundItem(item);
    setRefundForm({ amount: String(remaining), mode: 'Cash', reason: '' });
    setRefundError('');
  }

  async function submitRefund(e) {
    e.preventDefault();
    setRefundError('');
    setRefundSaving(true);
    try {
      await api.put(`/billing/bills/${refundBill.id}/items/${refundItem.id}/cancel`, {
        amount: Number(refundForm.amount),
        mode: refundForm.mode,
        reason: refundForm.reason || undefined,
      });
      setRefundItem(null);
      const freshBills = await load();
      // refresh the modal's own bill snapshot from the freshly reloaded list
      setRefundBill((prev) => freshBills.find((b) => b.id === prev?.id) || prev);
    } catch (err) {
      setRefundError(err.response?.data?.message || 'Failed to record cancellation/refund');
    } finally {
      setRefundSaving(false);
    }
  }

  function openDiscountModal(bill) {
    setDiscountBill(bill);
    setDiscountForm({ amount: '', mode: 'Cash', reason: '' });
    setDiscountError('');
  }

  async function submitDiscount(e) {
    e.preventDefault();
    setDiscountError('');
    setDiscountSaving(true);
    try {
      await api.put(`/billing/bills/${discountBill.id}/discount`, {
        amount: Number(discountForm.amount),
        mode: discountForm.mode,
        reason: discountForm.reason,
      });
      setDiscountBill(null);
      await load();
    } catch (err) {
      setDiscountError(err.response?.data?.message || 'Failed to apply discount');
    } finally {
      setDiscountSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="topbar">
        <h3 style={{ margin: 0 }}>Orders</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
            To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(''); setToDate(''); }}>Clear dates</button>}
          <input placeholder="Search by Order ID, UMR, name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 260, maxWidth: '100%' }} />
          {canConfigure && <button type="button" onClick={() => setShowSettings(true)}>⚙ Settings</button>}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Order ID</th><th>UMR</th><th>Patient</th><th>Ref. Doctor</th><th>Walk-in</th>
            <th>Net Payable</th><th>Tests</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((b) => {
            const anyReleased = b.tests.some((t) => t.status === 'RELEASED');
            return (
              <tr key={b.id}>
                <td>{b.billNo}</td>
                <td>{b.patient?.umr}</td>
                <td>{b.patient?.name}<br /><span style={{ fontSize: 12, color: '#64748b' }}>{b.patient?.mobile}</span></td>
                <td>{b.referredDoctor ? `Dr. ${b.referredDoctor}` : '—'}</td>
                <td>{b.walkInDate}</td>
                <td>₹{b.paidAmount}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {b.tests.map((t, i) => (
                      <span key={i} className={`badge ${t.itemStatus === 'CANCELLED' ? 'CANCELLED' : t.status}`} title={t.testName}>
                        {t.testName}{t.itemStatus === 'CANCELLED' ? ' (cancelled)' : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => navigate(`/app/billing/print/${b.id}`)}>Print Bill</button>
                  <button disabled={!anyReleased} onClick={() => navigate(`/app/report/${b.id}`)}>Print Report</button>
                  {settings?.allowBillCancellationRefund && <button onClick={() => openRefundModal(b)}>Cancel / Refund</button>}
                  {settings?.allowPostBillingDiscount && Number(b.paidAmount) > 0 && (
                    <button onClick={() => openDiscountModal(b)}>Discount</button>
                  )}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan={8}>No orders found.</td></tr>}
        </tbody>
      </table>

      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <h2>Orders Settings</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Available to Admin and Manager. Controls cancellation/refund and post-billing discount for
              Front Office, from this same Orders screen.
            </p>
            {settings ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  <div>
                    <strong>Bill Cancellation & Refund</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Currently {settings.allowBillCancellationRefund ? 'enabled' : 'disabled'} for this clinic.
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleSetting('allowBillCancellationRefund', 'Cancellation & Refund')} disabled={settingsSaving}>
                    {settingsSaving ? 'Saving…' : settings.allowBillCancellationRefund ? 'Disable' : 'Enable'}
                  </button>
                </div>

                <form
                  onSubmit={(e) => saveDaysLimit(e, 'refundAllowedDays', 'Cancellation & refund')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}
                >
                  <div>
                    <strong>Cancellation & Refund Allowed Days</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      How many days after billing a test can still be cancelled/refunded. 0 = no limit.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number" min="0" step="1" style={{ width: 70 }}
                      value={settingsForm.refundAllowedDays}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, refundAllowedDays: e.target.value }))}
                    />
                    <button type="submit" disabled={settingsSaving}>Save</button>
                  </div>
                </form>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                  <div>
                    <strong>Post-Billing Discount</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      Currently {settings.allowPostBillingDiscount ? 'enabled' : 'disabled'} for this clinic.
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleSetting('allowPostBillingDiscount', 'Post-Billing Discount')} disabled={settingsSaving}>
                    {settingsSaving ? 'Saving…' : settings.allowPostBillingDiscount ? 'Disable' : 'Enable'}
                  </button>
                </div>

                <form
                  onSubmit={(e) => saveDaysLimit(e, 'postDiscountAllowedDays', 'Post-billing discount')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}
                >
                  <div>
                    <strong>Post-Billing Discount Allowed Days</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      How many days after billing an extra discount can still be applied. 0 = no limit.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number" min="0" step="1" style={{ width: 70 }}
                      value={settingsForm.postDiscountAllowedDays}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, postDiscountAllowedDays: e.target.value }))}
                    />
                    <button type="submit" disabled={settingsSaving}>Save</button>
                  </div>
                </form>
              </div>
            ) : <p>Loading…</p>}
            {settingsMessage && <p style={{ fontSize: 13, color: '#166534' }}>{settingsMessage}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowSettings(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {refundBill && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <h2>Cancel / Refund — {refundBill.billNo}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Cancelling a test is per-test - the rest of the bill's tests are unaffected. A refund can be
              partial (e.g. bill amount ₹2000, refund only ₹100) and further partial refunds can be recorded
              later up to what's left of that test's price.
            </p>
            <table>
              <thead><tr><th>Test</th><th>Price</th><th>Refunded</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {refundBill.tests.map((t) => {
                  const remaining = Number(t.price) - Number(t.refundedAmount || 0);
                  return (
                    <tr key={t.id}>
                      <td>{t.testName}</td>
                      <td>₹{Number(t.price).toFixed(2)}</td>
                      <td>₹{Number(t.refundedAmount || 0).toFixed(2)}</td>
                      <td>{t.itemStatus === 'CANCELLED' ? <span className="badge CANCELLED">Cancelled</span> : <span className="badge">Active</span>}</td>
                      <td>
                        {t.itemStatus !== 'CANCELLED' && t.status !== 'RELEASED' && (
                          <button type="button" onClick={() => startRefundFor(t)}>Cancel & Refund</button>
                        )}
                        {t.status === 'RELEASED' && t.itemStatus !== 'CANCELLED' && (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>Report released</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {refundItem && (
              <form onSubmit={submitRefund} style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <h4 style={{ margin: '0 0 8px' }}>Refund for {refundItem.testName}</h4>
                <div className="form-grid">
                  <label><span>Refund Amount (max ₹{(Number(refundItem.price) - Number(refundItem.refundedAmount || 0)).toFixed(2)})</span>
                    <input
                      type="number" min="0.01" step="0.01"
                      max={Number(refundItem.price) - Number(refundItem.refundedAmount || 0)}
                      value={refundForm.amount}
                      onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))}
                      required
                    />
                  </label>
                  <label><span>Payment Mode</span>
                    <select value={refundForm.mode} onChange={(e) => setRefundForm((f) => ({ ...f, mode: e.target.value }))}>
                      {REFUND_MODES.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </label>
                  <label><span>Reason (optional)</span>
                    <input value={refundForm.reason} onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))} />
                  </label>
                </div>
                {refundError && <p className="error-text">{refundError}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => setRefundItem(null)}>Back</button>
                  <button type="submit" disabled={refundSaving}>{refundSaving ? 'Saving…' : 'Confirm Cancellation & Refund'}</button>
                </div>
              </form>
            )}

            {!refundItem && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" onClick={() => setRefundBill(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {discountBill && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <h2>Discount — {discountBill.billNo}</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Applies an extra discount to this bill after billing, on top of any discount already given.
              Since the bill was already collected in full, this amount is handed back to the patient.
            </p>
            <form onSubmit={submitDiscount}>
              <div className="form-grid">
                <label><span>Discount Amount (max ₹{Number(discountBill.paidAmount).toFixed(2)})</span>
                  <input
                    type="number" min="0.01" step="0.01"
                    max={Number(discountBill.paidAmount)}
                    value={discountForm.amount}
                    onChange={(e) => setDiscountForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </label>
                <label><span>Payment Mode</span>
                  <select value={discountForm.mode} onChange={(e) => setDiscountForm((f) => ({ ...f, mode: e.target.value }))}>
                    {REFUND_MODES.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label><span>Reason</span>
                  <input value={discountForm.reason} onChange={(e) => setDiscountForm((f) => ({ ...f, reason: e.target.value }))} required />
                </label>
              </div>
              {discountError && <p className="error-text">{discountError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setDiscountBill(null)}>Cancel</button>
                <button type="submit" disabled={discountSaving}>{discountSaving ? 'Saving…' : 'Apply Discount'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
