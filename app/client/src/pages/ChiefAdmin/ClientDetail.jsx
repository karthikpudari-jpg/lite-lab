import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import RoleCheckboxes from '../../components/RoleCheckboxes';
import SearchSelect from '../../components/SearchSelect';

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [form, setForm] = useState(null);
  const [users, setUsers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [tests, setTests] = useState([]);
  const [prices, setPrices] = useState([]);
  const [marketingPersons, setMarketingPersons] = useState([]);
  const [priceForm, setPriceForm] = useState({ testId: '', price: '' });
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', roleNames: ['FRONT_OFFICE'] });
  const [userRoleEdits, setUserRoleEdits] = useState({});
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [clientRes, testsRes, pricesRes, marketingRes] = await Promise.all([
      api.get(`/clients/${id}`),
      api.get('/admin/masters/tests'),
      api.get(`/clients/${id}/test-prices`),
      api.get('/clients/marketing-persons'),
    ]);
    setMarketingPersons(marketingRes.data);
    setClient(clientRes.data);
    setForm({
      clientName: clientRes.data.clientName,
      mobile: clientRes.data.mobile || '',
      email: clientRes.data.email || '',
      address: clientRes.data.address || '',
      salesPerson: clientRes.data.salesPerson || '',
      monthlyAmount: clientRes.data.monthlyAmount,
      active: clientRes.data.active,
    });
    setUsers(clientRes.data.ClientUsers || []);
    setUserRoleEdits({});
    setSubscriptions(clientRes.data.ClientSubscriptions || []);
    setTests(testsRes.data);
    setPrices(pricesRes.data);
  }

  useEffect(() => { load(); }, [id]);

  async function handleSaveClient(e) {
    e.preventDefault();
    setError('');
    setSaveMessage('');
    try {
      const { monthlyAmount, ...editable } = form;
      await api.put(`/clients/${id}`, editable);
      setSaveMessage('Client details updated.');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update client');
    }
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setError('');
    if (newUser.roleNames.length === 0) {
      setError('Select at least one role for the new user');
      return;
    }
    try {
      await api.post(`/clients/${id}/users`, newUser);
      setNewUser({ username: '', password: '', name: '', roleNames: ['FRONT_OFFICE'] });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create user');
    }
  }

  function rolesForUser(u) {
    return userRoleEdits[u.id] ?? u.Roles?.map((r) => r.name) ?? [];
  }

  async function handleSaveUserRoles(userId) {
    setError('');
    const roleNames = userRoleEdits[userId];
    if (!roleNames || roleNames.length === 0) {
      setError('A user must have at least one role');
      return;
    }
    try {
      await api.put(`/clients/${id}/users/${userId}`, { roleNames });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update roles');
    }
  }

  async function handleSetPrice(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/clients/${id}/test-prices`, { testId: Number(priceForm.testId), price: Number(priceForm.price) });
      setPriceForm({ testId: '', price: '' });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set price');
    }
  }

  if (!client || !form) return <p>Loading…</p>;

  return (
    <div>
      <p><Link to="/chief-admin">&larr; Back to Dashboard</Link></p>

      <div className="card">
        <h3>Edit Client — {client.clientCode}</h3>
        <form onSubmit={handleSaveClient} className="form-grid" style={{ alignItems: 'end' }}>
          <label><span>Client Name</span><input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} required /></label>
          <label><span>Mobile</span><input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} /></label>
          <label><span>Email</span><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
          <label><span>Address</span><input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></label>
          <div><span>Sales Person</span>
            <SearchSelect
              options={marketingPersons.map((m) => ({ value: m.username, label: `${m.name || m.username} (${m.username})` }))}
              value={form.salesPerson}
              onChange={(v) => setForm((f) => ({ ...f, salesPerson: v }))}
              placeholder="Search marketing person…"
            />
          </div>
          <label><span>Monthly Amount</span><input value={`₹${form.monthlyAmount} (${users.length} user${users.length === 1 ? '' : 's'})`} disabled /></label>
          <label><span>Active</span>
            <select value={form.active ? 'yes' : 'no'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'yes' }))}>
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
          </label>
          <button type="submit">Save Changes</button>
        </form>
        {saveMessage && <p style={{ color: '#166534' }}>{saveMessage}</p>}
        {error && <p className="error-text">{error}</p>}
        <p>Current payment status: <span className={`badge ${client.paymentStatus}`}>{client.paymentStatus}</span></p>
        <p>Paid through: <strong>{client.paidThrough ? new Date(client.paidThrough).toLocaleDateString() : '—'}</strong></p>
      </div>

      <div className="card">
        <h3>Subscription History</h3>
        <table>
          <thead><tr><th>Month</th><th>From</th><th>To</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td>{s.month}</td><td>{s.fromDate}</td><td>{s.toDate}</td><td>{s.dueDate}</td>
                <td>₹{s.amount}</td><td><span className={`badge ${s.status}`}>{s.status}</span></td>
              </tr>
            ))}
            {subscriptions.length === 0 && <tr><td colSpan={6}>No subscription cycles yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Users</h3>
        <form onSubmit={handleAddUser} className="form-grid" style={{ alignItems: 'end' }}>
          <label><span>Username</span><input value={newUser.username} onChange={(e) => setNewUser((f) => ({ ...f, username: e.target.value }))} required /></label>
          <label><span>Name</span><input value={newUser.name} onChange={(e) => setNewUser((f) => ({ ...f, name: e.target.value }))} /></label>
          <label><span>Password</span><input type="password" value={newUser.password} onChange={(e) => setNewUser((f) => ({ ...f, password: e.target.value }))} required /></label>
          <div><span>Roles</span>
            <RoleCheckboxes value={newUser.roleNames} onChange={(roleNames) => setNewUser((f) => ({ ...f, roleNames }))} />
          </div>
          <button type="submit">Add User</button>
        </form>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Roles</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.name}</td>
                <td style={{ minWidth: 320 }}>
                  <RoleCheckboxes value={rolesForUser(u)} onChange={(roleNames) => setUserRoleEdits((edits) => ({ ...edits, [u.id]: roleNames }))} />
                </td>
                <td>{u.active ? 'Yes' : 'No'}</td>
                <td>
                  {userRoleEdits[u.id] && <button type="button" onClick={() => handleSaveUserRoles(u.id)}>Save Roles</button>}
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5}>No users yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Client-wise Test Pricing</h3>
        <form onSubmit={handleSetPrice} className="form-grid" style={{ alignItems: 'end' }}>
          <label><span>Test</span>
            <select value={priceForm.testId} onChange={(e) => setPriceForm((f) => ({ ...f, testId: e.target.value }))} required>
              <option value="">Select test</option>
              {tests.map((t) => <option key={t.id} value={t.id}>{t.testCode} — {t.testName}</option>)}
            </select>
          </label>
          <label><span>Price (₹)</span><input type="number" value={priceForm.price} onChange={(e) => setPriceForm((f) => ({ ...f, price: e.target.value }))} required /></label>
          <button type="submit">Set Price</button>
        </form>
        <table>
          <thead><tr><th>Test Code</th><th>Test Name</th><th>Price</th></tr></thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id}><td>{p.TestMaster?.testCode}</td><td>{p.TestMaster?.testName}</td><td>₹{p.price}</td></tr>
            ))}
            {prices.length === 0 && <tr><td colSpan={3}>No prices configured for this client yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
