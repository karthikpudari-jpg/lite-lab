import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

export default function Dashboard() {
  const [data, setData] = useState({ summary: {}, clients: [] });
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await api.get('/clients', { params: statusFilter ? { status: statusFilter } : {} });
    setData(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  const { summary, clients } = data;

  return (
    <div>
      <div className="stat-row">
        <div className="stat-tile"><div className="value">{summary.total || 0}</div><div className="label">Total Clients</div></div>
        <div className="stat-tile"><div className="value">{summary.paid || 0}</div><div className="label">Paid</div></div>
        <div className="stat-tile"><div className="value">{summary.pending || 0}</div><div className="label">Pending</div></div>
        <div className="stat-tile"><div className="value">{summary.expired || 0}</div><div className="label">Expired</div></div>
        <div className="stat-tile"><div className="value">₹{summary.monthlyRevenueCollected || 0}</div><div className="label">Collected this cycle</div></div>
        <div className="stat-tile"><div className="value">₹{summary.monthlyRevenueBooked || 0}</div><div className="label">Booked this cycle</div></div>
      </div>

      <div className="card">
        <div className="topbar">
          <h3 style={{ margin: 0 }}>Clients</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 180 }}>
            <option value="">All statuses</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        {loading ? <p>Loading…</p> : (
          <table>
            <thead>
              <tr>
                <th>Client Code</th><th>Name</th><th>Mobile</th><th>Sales Person</th>
                <th>Monthly Amount</th><th>Users</th><th>Status</th><th>Paid Through</th><th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.clientCode}</td>
                  <td>{c.clientName}</td>
                  <td>{c.mobile}</td>
                  <td>{c.salesPerson}</td>
                  <td>₹{c.monthlyAmount}</td>
                  <td>{c.userCount}</td>
                  <td><span className={`badge ${c.paymentStatus}`}>{c.paymentStatus}</span></td>
                  <td>{c.paidThrough ? new Date(c.paidThrough).toLocaleDateString() : '—'}</td>
                  <td><Link to={`/chief-admin/clients/${c.id}`}>Edit</Link></td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan={9}>No clients found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
