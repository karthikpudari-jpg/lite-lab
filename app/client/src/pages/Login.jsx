import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

function IconFlask() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}
function IconUser() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
      <path d="M14 21V9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v12" />
      <path d="M8 9h0M8 13h0M8 17h0" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function IconEye({ off }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.4 5.5A9.6 9.6 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.1 2.2-2.1 3.3M6.1 6.9C4.2 8.2 2.9 10 2 12c1 2.5 5 7 10 7 1.3 0 2.5-.3 3.6-.8" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a6c4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const FEATURES = [
  'Multi-client subscription & recharge billing',
  'Role-based access across every module',
  'End-to-end lab workflow, billing and reports',
];

function blankSignup() {
  return { clientName: '', mobile: '', email: '', address: '', adminUsername: '', adminPassword: '', adminName: '' };
}

export default function Login() {
  const [mode, setMode] = useState('client'); // 'client' | 'chief' | 'signup'
  const [clientCode, setClientCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginChiefAdmin, loginClientUser, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();

  const [signup, setSignup] = useState(blankSignup());
  const [signupResult, setSignupResult] = useState(null);

  function updateSignup(field, value) { setSignup((f) => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    clearSessionMessage();
    setLoading(true);
    try {
      if (mode === 'chief') {
        await loginChiefAdmin(username, password);
        navigate('/chief-admin');
      } else {
        await loginClientUser(clientCode, username, password);
        navigate('/app');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/self-register', signup);
      setSignupResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function goToLoginAfterSignup() {
    setClientCode(signupResult.clientCode);
    setUsername(signupResult.username);
    setPassword('');
    setSignupResult(null);
    setSignup(blankSignup());
    setMode('client');
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <span className="mark-icon"><IconFlask /></span>
            HMS / LIMS
          </div>
          <h1>Run your diagnostics business on one connected platform.</h1>
          <p className="tagline">
            Client subscriptions, billing, lab workflow and reporting, tied together with a monthly
            recharge model that keeps access and payments in sync automatically.
          </p>
          <ul className="login-brand-features">
            {FEATURES.map((f) => (
              <li key={f}><span className="feat-dot"><IconCheck /></span>{f}</li>
            ))}
          </ul>
        </div>
        <div className="login-brand-footer">Monthly Recharge Application</div>
      </div>

      <div className="login-panel">
        <div className="login-card" style={mode === 'signup' ? { maxWidth: 460 } : undefined}>
          {signupResult ? (
            <>
              <div className="login-card-header">
                <h1>You're all set!</h1>
                <p>Your account has been created. A confirmation has been sent to your email and WhatsApp number.</p>
              </div>
              <div className="report-patient-grid" style={{ marginBottom: 20 }}>
                <div><span>Client Code (auto-generated)</span><strong>{signupResult.clientCode}</strong></div>
                <div><span>Username</span><strong>{signupResult.username}</strong></div>
              </div>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                Note down your Client Code above — you'll need it every time you log in.
                Log in now to complete your first month's payment and activate full access.
              </p>
              <button className="login-submit" onClick={goToLoginAfterSignup}>Continue to Login</button>
            </>
          ) : (
            <>
              <div className="login-card-header">
                <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
                <p>{mode === 'signup' ? 'Register your lab and start your first month free of setup hassle.' : 'Sign in to continue to your dashboard.'}</p>
              </div>

              {sessionMessage && (
                <p className="error-text"><IconAlert />{sessionMessage}</p>
              )}

              <div className="login-toggle">
                <button type="button" className={mode === 'client' ? 'active' : ''} onClick={() => setMode('client')}>
                  Client Login
                </button>
                <button type="button" className={mode === 'chief' ? 'active' : ''} onClick={() => setMode('chief')}>
                  Chief Admin
                </button>
                <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
                  Sign Up
                </button>
              </div>

              {mode === 'signup' ? (
                <form onSubmit={handleSignup}>
                  <p style={{ fontSize: 13, color: '#64748b', marginTop: -8, marginBottom: 12 }}>
                    Your Client Code will be generated automatically once you submit this form.
                  </p>
                  <div className="form-grid">
                    <label><span>Client / Lab Name</span><input value={signup.clientName} onChange={(e) => updateSignup('clientName', e.target.value)} required /></label>
                    <label><span>Mobile (WhatsApp)</span><input value={signup.mobile} onChange={(e) => updateSignup('mobile', e.target.value)} placeholder="For WhatsApp confirmation" /></label>
                    <label><span>Email</span><input type="email" value={signup.email} onChange={(e) => updateSignup('email', e.target.value)} placeholder="For email confirmation" /></label>
                    <label><span>Address</span><input value={signup.address} onChange={(e) => updateSignup('address', e.target.value)} /></label>
                  </div>
                  <div className="form-grid">
                    <label><span>Your Username</span><input value={signup.adminUsername} onChange={(e) => updateSignup('adminUsername', e.target.value)} required /></label>
                    <label><span>Your Name</span><input value={signup.adminName} onChange={(e) => updateSignup('adminName', e.target.value)} /></label>
                    <label><span>Password</span><input type="password" value={signup.adminPassword} onChange={(e) => updateSignup('adminPassword', e.target.value)} required /></label>
                  </div>
                  {error && <p className="error-text"><IconAlert />{error}</p>}
                  <button type="submit" className="login-submit" disabled={loading}>
                    {loading ? 'Creating account…' : 'Create Account'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit}>
                  {mode === 'client' && (
                    <label>
                      <span>Client Code</span>
                      <div className="input-with-icon">
                        <IconBuilding />
                        <input value={clientCode} onChange={(e) => setClientCode(e.target.value)} placeholder="e.g. DEMO001" required />
                      </div>
                    </label>
                  )}
                  <label>
                    <span>Username</span>
                    <div className="input-with-icon">
                      <IconUser />
                      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required />
                    </div>
                  </label>
                  <label>
                    <span>Password</span>
                    <div className="input-with-icon">
                      <IconLock />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        data-pw
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <IconEye off={showPassword} />
                      </button>
                    </div>
                  </label>
                  {error && <p className="error-text"><IconAlert />{error}</p>}
                  <button type="submit" className="login-submit" disabled={loading}>
                    {loading ? 'Signing in…' : 'Sign In'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
