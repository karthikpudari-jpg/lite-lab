import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PaymentPendingModal from './PaymentPendingModal';

export const APP_NAV = {
  ADMIN: [
    { to: '/app/masters', label: 'Masters & Pricing', icon: 'masters' },
    { to: '/app/tickets', label: 'Tickets', icon: 'tickets' },
  ],
  FRONT_OFFICE: [
    { to: '/app/billing', label: 'Patient & Billing', icon: 'billing' },
    { to: '/app/orders', label: 'Orders', icon: 'orders' },
  ],
  LAB_USER: [
    { to: '/app/lab', label: 'Laboratory', icon: 'lab' },
  ],
  MANAGER: [
    { to: '/app/reports', label: 'Reports', icon: 'reports' },
    { to: '/app/tickets', label: 'Tickets', icon: 'tickets' },
    { to: '/app/report-branding', label: 'Report Branding', icon: 'branding' },
  ],
  MASTER_MANAGER: [
    { to: '/app/masters', label: 'Masters & Pricing', icon: 'masters' },
  ],
};

export function getNavLinks(roles) {
  const isAdmin = roles.includes('ADMIN');
  const links = isAdmin
    ? Object.values(APP_NAV).flat()
    : roles.flatMap((r) => APP_NAV[r] || []);
  return links.filter((v, i, arr) => arr.findIndex((x) => x.to === v.to) === i);
}

export function ChiefAdminLayout() {
  const { auth, logout } = useAuth();
  const roles = auth?.user?.roles || [];
  const isAdmin = roles.includes('ADMIN');
  const isMarketing = roles.includes('MARKETING');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Chief Admin</h2>
        <nav>
          <NavLink to="/chief-admin" end>Dashboard</NavLink>
          <NavLink to="/chief-admin/clients/new">Create Client</NavLink>
          {isAdmin && <NavLink to="/chief-admin/masters">Test Master</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/users">Team</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/tickets">Tickets</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/integrations">Integrations</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/sales-dashboard">Sales Dashboard</NavLink>}
          {(isAdmin || isMarketing) && <NavLink to="/chief-admin/team-passwords">Reset Passwords</NavLink>}
          <NavLink to="/chief-admin/reset-password">My Password</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div>Signed in as <strong>{auth?.user?.username}</strong> · {roles.join(' + ')}</div>
          <button className="secondary" onClick={logout}>Logout</button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function AppLayout() {
  const { auth, logout, paymentRequired } = useAuth();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const roles = auth?.user?.roles || [];
  const links = getNavLinks(roles);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>{auth?.client?.clientName}</h2>
        <nav>
          <NavLink to="/app" end>Home</NavLink>
          {links.map((item) => (
            <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
          ))}
          <NavLink to="/app/reset-password">Reset Password</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div>
            {auth?.user?.username} · {roles.join(' + ')} ·{' '}
            <span className={`badge ${auth?.client?.paymentStatus}`}>{auth?.client?.paymentStatus}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!paymentRequired && (
              <button className="secondary" onClick={() => setShowPaymentModal(true)}>Pay in Advance</button>
            )}
            <button className="secondary" onClick={logout}>Logout</button>
          </div>
        </div>
        <Outlet />
      </main>
      {(paymentRequired || showPaymentModal) && (
        <PaymentPendingModal dismissible={!paymentRequired} onClose={() => setShowPaymentModal(false)} />
      )}
    </div>
  );
}
