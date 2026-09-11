import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import RoleCheckboxes from '../../components/RoleCheckboxes';
import SearchSelect from '../../components/SearchSelect';
import { calculatePlanAmount, BASE_USER_COUNT, BASE_MONTHLY_AMOUNT, EXTRA_USER_AMOUNT } from '../../utils/pricing';

function blankUser() {
  return { username: '', password: '', name: '', roleNames: ['FRONT_OFFICE'] };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ClientCreate() {
  const [form, setForm] = useState({
    clientCode: '', clientName: '', mobile: '', email: '', address: '', salesPerson: '',
    startDate: todayISO(), endDate: '',
  });
  const [userCount, setUserCount] = useState(1);
  const [userRows, setUserRows] = useState([blankUser()]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [marketingPersons, setMarketingPersons] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/clients/marketing-persons').then((r) => setMarketingPersons(r.data));
  }, []);

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  function handleUserCountChange(value) {
    const count = Math.max(1, Math.min(20, Number(value) || 1));
    setUserCount(count);
    setUserRows((rows) => {
      const next = rows.slice(0, count);
      while (next.length < count) next.push(blankUser());
      return next;
    });
  }

  function updateUserRow(index, field, value) {
    setUserRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.startDate || !form.endDate) {
      setError('Start Date and End Date are required');
      return;
    }
    if (form.endDate < form.startDate) {
      setError('End Date cannot be before Start Date');
      return;
    }
    for (const u of userRows) {
      if (!u.username || !u.password) {
        setError('Every user needs a username and password');
        return;
      }
      if (u.roleNames.length === 0) {
        setError('Every user needs at least one role');
        return;
      }
    }

    setLoading(true);
    try {
      const { data } = await api.post('/clients', { ...form, users: userRows });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="card">
        <h3>Client "{result.client.clientName}" created (Code: {result.client.clientCode})</h3>
        <p>Subscription: {form.startDate} to {form.endDate} · ₹{calculatePlanAmount(result.users.length)}/month</p>
        <table>
          <thead><tr><th>Username</th><th>Roles</th></tr></thead>
          <tbody>
            {result.users.map((u) => <tr key={u.id}><td>{u.username}</td><td>{u.roles.join(', ')}</td></tr>)}
          </tbody>
        </table>
        <button style={{ marginTop: 16 }} onClick={() => navigate('/chief-admin')}>
          Done — Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Create Client</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label><span>Client Code</span><input value={form.clientCode} onChange={(e) => update('clientCode', e.target.value)} required /></label>
          <label><span>Client Name</span><input value={form.clientName} onChange={(e) => update('clientName', e.target.value)} required /></label>
          <label><span>Mobile</span><input value={form.mobile} onChange={(e) => update('mobile', e.target.value)} /></label>
          <label><span>Email</span><input value={form.email} onChange={(e) => update('email', e.target.value)} /></label>
          <label><span>Address</span><input value={form.address} onChange={(e) => update('address', e.target.value)} /></label>
          <div><span>Sales Person</span>
            <SearchSelect
              options={marketingPersons.map((m) => ({ value: m.username, label: `${m.name || m.username} (${m.username})` }))}
              value={form.salesPerson}
              onChange={(v) => update('salesPerson', v)}
              placeholder="Search marketing person…"
            />
          </div>
          <label><span>Subscription Start Date</span>
            <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
          </label>
          <label><span>Subscription End Date</span>
            <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} required />
          </label>
          <label><span>Number of Users</span>
            <input type="number" min={1} max={20} value={userCount} onChange={(e) => handleUserCountChange(e.target.value)} />
          </label>
          <label><span>Monthly Subscription Amount</span>
            <input value={`₹${calculatePlanAmount(userCount)}`} disabled />
          </label>
        </div>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: -8 }}>
          Plan: ₹{BASE_MONTHLY_AMOUNT}/month covers {BASE_USER_COUNT} users, +₹{EXTRA_USER_AMOUNT}/month per additional user.
        </p>

        <h4>Users</h4>
        {userRows.map((u, i) => (
          <div className="form-grid" key={i} style={{ borderTop: '1px solid #eee', paddingTop: 10 }}>
            <label><span>Username</span>
              <input value={u.username} onChange={(e) => updateUserRow(i, 'username', e.target.value)} required />
            </label>
            <label><span>Name</span>
              <input value={u.name} onChange={(e) => updateUserRow(i, 'name', e.target.value)} />
            </label>
            <label><span>Password</span>
              <input type="password" value={u.password} onChange={(e) => updateUserRow(i, 'password', e.target.value)} required />
            </label>
            <div><span>Roles</span>
              <RoleCheckboxes value={u.roleNames} onChange={(roleNames) => updateUserRow(i, 'roleNames', roleNames)} />
            </div>
          </div>
        ))}

        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading} style={{ marginTop: 16 }}>
          {loading ? 'Creating…' : 'Create Client & Users'}
        </button>
      </form>
    </div>
  );
}
