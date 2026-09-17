import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { setPaymentRequiredHandler, setAuthInvalidatedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  });
  const [paymentRequired, setPaymentRequired] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');

  function persist(next) {
    setAuth(next);
    if (next) {
      localStorage.setItem('auth', JSON.stringify(next));
      localStorage.setItem('token', next.token);
    } else {
      localStorage.removeItem('auth');
      localStorage.removeItem('token');
    }
  }

  function logout() {
    // Best-effort: clears currentSessionId server-side so the token can't be
    // reused even before it expires. Ignore failures (e.g. already invalid) -
    // the local session is cleared regardless.
    if (auth?.token) api.post('/auth/logout').catch(() => {});
    persist(null);
    setPaymentRequired(false);
  }

  useEffect(() => {
    setPaymentRequiredHandler(() => setPaymentRequired(true));
    // A blocked request while a session looked valid means the account was
    // deactivated or a role was changed elsewhere - force a clean re-login
    // rather than leaving stale nav/permissions on screen.
    setAuthInvalidatedHandler((message) => {
      logout();
      setSessionMessage(message || 'Your access has changed. Please log in again.');
    });
  }, []);

  async function loginChiefAdmin(username, password) {
    const { data } = await api.post('/auth/chief-admin/login', { username, password });
    persist(data);
    return data;
  }

  async function loginClientUser(clientCode, username, password) {
    const { data } = await api.post('/auth/login', { clientCode, username, password });
    persist(data);
    if (data.client?.paymentStatus !== 'PAID') setPaymentRequired(true);
    return data;
  }

  function markPaid() {
    if (!auth) return;
    // lastPaymentAt always changes, even when paymentStatus was already PAID
    // (an advance top-up while already paid) - components that need to
    // refetch payment/subscription details after any payment should key off
    // this instead of paymentStatus, which wouldn't change in that case.
    const next = { ...auth, client: { ...auth.client, paymentStatus: 'PAID' }, lastPaymentAt: Date.now() };
    persist(next);
    setPaymentRequired(false);
  }

  function clearSessionMessage() {
    setSessionMessage('');
  }

  const value = useMemo(() => ({
    auth,
    paymentRequired,
    setPaymentRequired,
    sessionMessage,
    clearSessionMessage,
    loginChiefAdmin,
    loginClientUser,
    logout,
    markPaid,
  }), [auth, paymentRequired, sessionMessage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
