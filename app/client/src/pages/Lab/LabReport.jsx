import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

export default function LabReport() {
  const { billId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [includeHeader, setIncludeHeader] = useState(true);

  useEffect(() => {
    api.get(`/report-view/bills/${billId}/report`)
      .then((r) => setReport(r.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load report'));
  }, [billId]);

  if (error) return <div className="card"><p className="error-text">{error}</p></div>;
  if (!report) return <p>Loading…</p>;

  const { patient, client, tests } = report;
  const collectedAt = tests.map((t) => t.collectedAt).filter(Boolean).sort()[0];
  const releasedAt = tests.map((t) => t.releasedAt).filter(Boolean).sort().slice(-1)[0];

  return (
    <div>
      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <Link to="/app/orders">&larr; Back to Orders</Link>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, fontWeight: 'normal' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={includeHeader} onChange={(e) => setIncludeHeader(e.target.checked)} />
          Include letterhead/logo header
        </label>
        <button onClick={() => window.print()} style={{ marginLeft: 'auto' }}>Print Report</button>
      </div>

      <div className="report-sheet">
        {includeHeader && (client.letterheadUrl ? (
          <img src={client.letterheadUrl} alt="Letterhead" className="report-letterhead" />
        ) : (
          <div className="report-header">
            {client.logoUrl && <img src={client.logoUrl} alt="Logo" className="report-logo" />}
            <div>
              <h2 style={{ margin: 0 }}>{client.clientName}</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                {[client.address, client.mobile, client.email].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        ))}

        <h3 style={{ marginTop: 24 }}>Laboratory Report</h3>
        <div className="report-patient-grid">
          <div><span>UMR</span><strong>{patient?.umr}</strong></div>
          <div><span>Patient Name</span><strong>{patient?.name}</strong></div>
          <div><span>Age / Gender</span><strong>{patient?.age ? `${patient.age} Yrs` : '—'} / {patient?.gender || '—'}</strong></div>
          <div><span>Order ID</span><strong>{report.bill.billNo}</strong></div>
          <div><span>Mobile</span><strong>{patient?.mobile || '—'}</strong></div>
          <div><span>Referred By</span><strong>{report.bill.referredDoctor ? `Dr. ${report.bill.referredDoctor}` : 'Self'}</strong></div>
          <div><span>Collected On</span><strong>{formatDateTime(collectedAt)}</strong></div>
          <div><span>Report Date</span><strong>{formatDateTime(releasedAt)}</strong></div>
        </div>

        {tests.map((t) => (
          <div key={t.barcode} style={{ marginTop: 24 }}>
            <h4 style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: 6 }}>{t.testName}</h4>
            <table>
              <thead>
                <tr><th>Parameter</th><th>Result</th><th>Unit</th><th>Bio. Ref. Interval</th></tr>
              </thead>
              <tbody>
                {t.parameters.map((p) => (
                  <tr key={p.parameterName}>
                    <td>{p.parameterName}</td>
                    <td style={p.isAbnormal ? { color: '#b91c1c', fontWeight: 700 } : undefined}>{p.value}</td>
                    <td>{p.unit || '—'}</td>
                    <td>{p.normalRangeLow} - {p.normalRangeHigh}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <p style={{ marginTop: 32, fontSize: 12, color: '#64748b' }}>
          This is a system-generated report. Values in <span style={{ color: '#b91c1c', fontWeight: 700 }}>red</span> are
          outside the normal reference range. Please correlate clinically.
        </p>
      </div>
    </div>
  );
}
