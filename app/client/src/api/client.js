import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const PUBLIC_PATHS = ['/auth/login', '/auth/chief-admin/login', '/auth/self-register'];

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Set by AuthContext so any API call anywhere in the app can trigger the
// payment-pending popup the moment the server reports a 402.
let onPaymentRequired = null;
export function setPaymentRequiredHandler(fn) {
  onPaymentRequired = fn;
}

// Set by AuthContext so a request rejected because the account was
// deactivated, or a role was revoked, forces a clean re-login instead of
// leaving stale nav/permissions visible until the old token happens to expire.
let onAuthInvalidated = null;
export function setAuthInvalidatedHandler(fn) {
  onAuthInvalidated = fn;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const isPublicAuthCall = PUBLIC_PATHS.some((p) => err.config?.url?.includes(p));
    const hadToken = !!localStorage.getItem('token');

    if (status === 402 && onPaymentRequired) {
      onPaymentRequired(err.response.data);
    } else if ((status === 401 || status === 403) && hadToken && !isPublicAuthCall && onAuthInvalidated) {
      onAuthInvalidated(err.response.data?.message);
    }
    return Promise.reject(err);
  }
);

export default api;
