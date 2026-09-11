import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

export default function Orders() {
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [search, setSearch] = useState('');

  async function load() {
    const { data } = await api.get('/billing/bills');
    setBills(data);
  }
  useEffect(() => { load(); }, []);

  const filtered = bills.filter((b) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return b.billNo.toLowerCase().includes(q)
      || b.patient?.name?.toLowerCase().includes(q)
      || b.patient?.umr?.toLowerCase().includes(q)
      || b.patient?.mobile?.includes(q);
  });

  return (
    <div className="card">
      <div className="topbar">
        <h3 style={{ margin: 0 }}>Orders</h3>
        <input placeholder="Search by Order ID, UMR, name or mobile…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 280 }} />
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
                      <span key={i} className={`badge ${t.status}`} title={t.testName}>{t.testName}</span>
                    ))}
                  </div>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => navigate(`/app/billing/print/${b.id}`)}>Print Bill</button>
                  <button disabled={!anyReleased} onClick={() => navigate(`/app/report/${b.id}`)}>Print Report</button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && <tr><td colSpan={8}>No orders found.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
