import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';

export default function BillPrint() {
  const { billId } = useParams();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/billing/bills/${billId}`)
      .then((r) => setBill(r.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load bill'));
  }, [billId]);

  if (error) return <div className="card"><p className="error-text">{error}</p></div>;
  if (!bill) return <p>Loading…</p>;

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Link to="/app/orders">&larr; Back to Orders</Link>
        <button onClick={() => window.print()} style={{ marginLeft: 'auto' }}>Print Bill</button>
      </div>

      <div className="report-sheet">
        {bill.Client?.reportLogoPath && (
          <div className="report-header">
            <img src={bill.Client.reportLogoPath} alt="Logo" className="report-logo" />
            <div>
              <h2 style={{ margin: 0 }}>{bill.Client.clientName}</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                {[bill.Client.address, bill.Client.mobile, bill.Client.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        )}

        <h3 style={{ marginTop: bill.Client?.reportLogoPath ? 24 : 0 }}>Bill / Receipt — Order {bill.billNo}</h3>
        <div className="report-patient-grid">
          <div><span>UMR</span><strong>{bill.Patient?.umr}</strong></div>
          <div><span>Patient Name</span><strong>{bill.Patient?.name}</strong></div>
          <div><span>Age / Gender</span><strong>{bill.Patient?.age || '—'} / {bill.Patient?.gender || '—'}</strong></div>
          <div><span>Mobile</span><strong>{bill.Patient?.mobile || '—'}</strong></div>
          <div><span>Referred By</span><strong>{bill.ReferralDoctor?.name ? `Dr. ${bill.ReferralDoctor.name}` : 'Self'}</strong></div>
          <div><span>Billed To</span><strong>{bill.Payor?.name || 'Self / Direct'}</strong></div>
          <div><span>Walk-in Date</span><strong>{bill.walkInDate}</strong></div>
          <div><span>Payment Mode</span><strong>{bill.paymentMode || (bill.Payor ? 'Credit (billed to payor)' : '—')}</strong></div>
          {bill.transactionNumber && <div><span>Transaction Number</span><strong>{bill.transactionNumber}</strong></div>}
        </div>

        <table style={{ marginTop: 24 }}>
          <thead><tr><th>Test</th><th>Barcode</th><th>Price</th><th>Status</th><th>Refunded</th></tr></thead>
          <tbody>
            {bill.BillItems.map((item) => {
              const refunded = (item.Refunds || []).reduce((sum, r) => sum + Number(r.amount), 0);
              return (
                <tr key={item.id}>
                  <td style={item.status === 'CANCELLED' ? { textDecoration: 'line-through', color: '#94a3b8' } : undefined}>
                    {item.TestMaster?.testName}
                  </td>
                  <td>{item.Sample?.barcode}</td>
                  <td>₹{item.price}</td>
                  <td>{item.status === 'CANCELLED' ? 'Cancelled' : 'Active'}</td>
                  <td>{refunded > 0 ? `₹${refunded.toFixed(2)}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="report-patient-grid" style={{ marginTop: 16 }}>
          <div><span>Gross</span><strong>₹{bill.totalAmount}</strong></div>
          <div><span>Discount</span><strong>₹{bill.discount}</strong></div>
          {(() => {
            const totalRefunded = bill.BillItems.reduce(
              (sum, item) => sum + (item.Refunds || []).reduce((s, r) => s + Number(r.amount), 0), 0,
            );
            return totalRefunded > 0 ? (
              <div><span>Cancelled / Refunded</span><strong>₹{totalRefunded.toFixed(2)}</strong></div>
            ) : null;
          })()}
          {(() => {
            const totalPostDiscount = (bill.BillDiscounts || []).reduce((sum, d) => sum + Number(d.amount), 0);
            return totalPostDiscount > 0 ? (
              <div><span>Post-Billing Discount</span><strong>₹{totalPostDiscount.toFixed(2)}</strong></div>
            ) : null;
          })()}
          <div><span>Net Payable</span><strong>₹{bill.paidAmount}</strong></div>
        </div>
        {bill.remarks && <p style={{ marginTop: 16 }}><strong>Remarks:</strong> {bill.remarks}</p>}
      </div>
    </div>
  );
}
