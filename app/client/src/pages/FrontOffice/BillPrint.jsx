import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import BillReceiptSheet from '../../components/BillReceiptSheet';

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

      <BillReceiptSheet bill={bill} />
    </div>
  );
}
