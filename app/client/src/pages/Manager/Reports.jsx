import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function Reports() {
  const [collection, setCollection] = useState(null);
  const [outstanding, setOutstanding] = useState([]);
  const [labSummary, setLabSummary] = useState(null);
  const [testRevenue, setTestRevenue] = useState([]);
  const [reportStatus, setReportStatus] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [groupBy, setGroupBy] = useState('day');

  useEffect(() => {
    api.get('/reports/collection-summary').then((r) => setCollection(r.data));
    api.get('/reports/outstanding').then((r) => setOutstanding(r.data));
    api.get('/reports/lab-summary').then((r) => setLabSummary(r.data));
    api.get('/reports/test-wise-revenue').then((r) => setTestRevenue(r.data));
    api.get('/reports/report-status').then((r) => setReportStatus(r.data));
  }, []);

  useEffect(() => {
    api.get('/reports/transactions', { params: { groupBy } }).then((r) => setTransactions(r.data));
  }, [groupBy]);

  return (
    <div>
      <div className="stat-row">
        <div className="stat-tile"><div className="value">{collection?.billCount ?? '—'}</div><div className="label">Bills</div></div>
        <div className="stat-tile"><div className="value">₹{collection?.totalBilled ?? 0}</div><div className="label">Total Billed</div></div>
        <div className="stat-tile"><div className="value">₹{collection?.totalCollected ?? 0}</div><div className="label">Total Collected</div></div>
        <div className="stat-tile"><div className="value">₹{collection?.outstanding ?? 0}</div><div className="label">Outstanding</div></div>
      </div>

      <div className="card">
        <div className="topbar">
          <h3 style={{ margin: 0 }}>Transactions</h3>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ width: 160 }}>
            <option value="day">Day-wise</option>
            <option value="month">Month-wise</option>
          </select>
        </div>
        <table>
          <thead><tr><th>Period</th><th>Bill Count</th><th>Total Amount</th></tr></thead>
          <tbody>
            {transactions.map((t) => <tr key={t.period}><td>{t.period}</td><td>{t.billCount}</td><td>₹{t.totalAmount}</td></tr>)}
            {transactions.length === 0 && <tr><td colSpan={3}>No transactions.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Lab Summary</h3>
        <div className="stat-row">
          {labSummary && Object.entries(labSummary.byStatus).map(([status, count]) => (
            <div className="stat-tile" key={status}><div className="value">{count}</div><div className="label">{status}</div></div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Report Status (Pending / Verified / Released)</h3>
        <div className="stat-row">
          <div className="stat-tile"><div className="value">{reportStatus?.PENDING ?? 0}</div><div className="label">Pending</div></div>
          <div className="stat-tile"><div className="value">{reportStatus?.VERIFIED ?? 0}</div><div className="label">Verified</div></div>
          <div className="stat-tile"><div className="value">{reportStatus?.RELEASED ?? 0}</div><div className="label">Released</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Test-wise Counts & Revenue</h3>
        <table>
          <thead><tr><th>Test Code</th><th>Test Name</th><th>Count</th><th>Revenue</th></tr></thead>
          <tbody>
            {testRevenue.map((t) => <tr key={t.testCode}><td>{t.testCode}</td><td>{t.testName}</td><td>{t.count}</td><td>₹{t.revenue}</td></tr>)}
            {testRevenue.length === 0 && <tr><td colSpan={4}>No data.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Outstanding Amounts</h3>
        <table>
          <thead><tr><th>Bill No</th><th>Patient</th><th>Total</th><th>Paid</th><th>Outstanding</th></tr></thead>
          <tbody>
            {outstanding.map((o) => (
              <tr key={o.billNo}><td>{o.billNo}</td><td>{o.patient}</td><td>₹{o.totalAmount}</td><td>₹{o.paidAmount}</td><td>₹{o.outstanding}</td></tr>
            ))}
            {outstanding.length === 0 && <tr><td colSpan={5}>No outstanding bills.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
