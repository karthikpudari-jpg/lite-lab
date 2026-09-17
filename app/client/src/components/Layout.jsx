import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PaymentPendingModal from './PaymentPendingModal';
import { Icon } from './Icons';
import api from '../api/client';

// Every screen a client-side role can be granted, keyed by the same screen
// key the backend's RoleScreenDefault/ClientRoleScreen tables use.
export const SCREEN_CATALOG = [
  { key: 'masters', to: '/app/masters', label: 'Masters & Pricing', icon: 'masters' },
  { key: 'payors', to: '/app/payors', label: 'Payors', icon: 'building' },
  { key: 'tickets', to: '/app/tickets', label: 'Tickets', icon: 'tickets' },
  { key: 'billing', to: '/app/billing', label: 'Patient & Billing', icon: 'billing' },
  { key: 'orders', to: '/app/orders', label: 'Orders', icon: 'orders' },
  { key: 'lab', to: '/app/lab', label: 'Laboratory', icon: 'lab' },
  { key: 'reports', to: '/app/reports', label: 'Reports', icon: 'reports' },
  { key: 'report-branding', to: '/app/report-branding', label: 'Report Branding', icon: 'branding' },
  { key: 'payor-invoices', to: '/app/payor-invoices', label: 'Payor Invoices', icon: 'invoice' },
  { key: 'test-parameters', to: '/app/test-parameters', label: 'Test Parameters', icon: 'masters' },
];

// Used only until the real effective map has loaded from the server, or if
// that fetch fails - mirrors the screens each role could already reach
// before access became configurable, so nothing regresses.
export const DEFAULT_ROLE_SCREENS = {
  FRONT_OFFICE: ['billing', 'orders'],
  LAB_USER: ['lab'],
  MANAGER: ['reports', 'tickets', 'report-branding', 'payor-invoices', 'test-parameters'],
  MASTER_MANAGER: ['masters', 'payors'],
};

/** ADMIN always sees every screen - it's the role that configures everyone else's access. */
export function getNavLinks(roles, roleScreens = DEFAULT_ROLE_SCREENS) {
  if (roles.includes('ADMIN')) return SCREEN_CATALOG;
  const allowedKeys = new Set(roles.flatMap((r) => roleScreens[r] || []));
  return SCREEN_CATALOG.filter((s) => allowedKeys.has(s.key));
}

export function ChiefAdminLayout() {
  const { auth, logout } = useAuth();
  const roles = auth?.user?.roles || [];
  const isAdmin = roles.includes('ADMIN');
  const isMarketing = roles.includes('MARKETING');
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <h2>Chief Admin</h2>
        <nav onClick={() => setNavOpen(false)}>
          <NavLink to="/chief-admin" end>Dashboard</NavLink>
          <NavLink to="/chief-admin/clients/new">Create Client</NavLink>
          {isAdmin && <NavLink to="/chief-admin/masters">Test Master</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/users">Team</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/tickets">Tickets</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/integrations">Integrations</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/sales-dashboard">Sales Dashboard</NavLink>}
          {(isAdmin || isMarketing) && <NavLink to="/chief-admin/team-passwords">Reset Passwords</NavLink>}
          {isAdmin && <NavLink to="/chief-admin/role-screen-defaults">Role Screen Defaults</NavLink>}
          <NavLink to="/chief-admin/reset-password">My Password</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={18} />
            </button>
            <div>Signed in as <strong>{auth?.user?.username}</strong> · {roles.join(' + ')}</div>
          </div>
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
  const [navOpen, setNavOpen] = useState(false);
  const [roleScreens, setRoleScreens] = useState(DEFAULT_ROLE_SCREENS);
  const roles = auth?.user?.roles || [];
  const links = getNavLinks(roles, roleScreens);

  useEffect(() => {
    api.get('/role-screens/effective').then((r) => setRoleScreens(r.data)).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <div className={`sidebar-overlay${navOpen ? ' open' : ''}`} onClick={() => setNavOpen(false)} />
      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <h2>{auth?.client?.clientName}</h2>
        <nav onClick={() => setNavOpen(false)}>
          <NavLink to="/app" end>Home</NavLink>
          {links.map((item) => (
            <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
          ))}
          {roles.includes('ADMIN') && <NavLink to="/app/role-screens">Staff Screen Access</NavLink>}
          <NavLink to="/app/reset-password">Reset Password</NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}>
              <Icon name="menu" size={18} />
            </button>
            <div>
              {auth?.user?.username} · {roles.join(' + ')} ·{' '}
              <span className={`badge ${auth?.client?.paymentStatus}`}>{auth?.client?.paymentStatus}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!paymentRequired && (
              <button className="secondary" onClick={() => setShowPaymentModal(true)}>Pay in Advance</button>
            )}
            <button className="secondary" onClick={logout}>Logout</button>
          </div>
        </div>
        <Outlet context={{ roleScreens }} />
      </main>
      {(paymentRequired || showPaymentModal) && (
        <PaymentPendingModal dismissible={!paymentRequired} onClose={() => setShowPaymentModal(false)} />
      )}
    </div>
  );
}
