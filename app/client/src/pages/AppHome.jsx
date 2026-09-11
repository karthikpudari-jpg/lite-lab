import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNavLinks } from '../components/Layout';
import { Icon } from '../components/Icons';
import api from '../api/client';

function greeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const EXPIRY_WARNING_DAYS = 7;

export default function AppHome() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [subInfo, setSubInfo] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.get('/payments/status').then((r) => setSubInfo(r.data)).catch(() => {});
    // Re-fetch whenever the client's payment status changes (e.g. right
    // after paying) - the banner would otherwise keep showing stale info
    // from before the payment, since this component stays mounted under
    // the payment modal the whole time.
  }, [auth?.client?.paymentStatus]);

  const roles = auth?.user?.roles || [];
  const links = getNavLinks(roles);
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let expiryBanner = null;
  if (subInfo) {
    const toDate = new Date(subInfo.toDate);
    const daysLeft = Math.ceil((toDate - now) / (1000 * 60 * 60 * 24));
    const formattedDate = toDate.toLocaleDateString();

    if (subInfo.status !== 'PAID') {
      expiryBanner = {
        tone: 'expired',
        text: daysLeft < 0
          ? `Your subscription expired ${Math.abs(daysLeft)} day(s) ago, on ${formattedDate}.`
          : `Your subscription payment is pending — due ${formattedDate}.`,
      };
    } else if (daysLeft <= EXPIRY_WARNING_DAYS) {
      expiryBanner = {
        tone: 'warning',
        text: `Your subscription expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}, on ${formattedDate}.`,
      };
    }
  }

  return (
    <div>
      {expiryBanner && (
        <div className={`expiry-banner expiry-banner-${expiryBanner.tone}`}>
          <Icon name="calendar" size={18} />
          <span>{expiryBanner.text} Use <strong>Pay in Advance</strong> above to keep access uninterrupted.</span>
        </div>
      )}

      <div className="home-hero">
        <div className="home-hero-bg" />
        <div className="home-hero-content">
          <p className="home-hero-eyebrow">
            <Icon name="building" size={15} /> {auth?.client?.clientName}
          </p>
          <h1>{greeting(now.getHours())}, {auth?.user?.name || auth?.user?.username}</h1>
          <p className="home-hero-sub">{roles.join(' + ')} · Signed in as {auth?.user?.username}</p>

          <div className="home-hero-meta">
            <span><Icon name="calendar" size={16} /> {dateStr}</span>
            <span><Icon name="clock" size={16} /> {timeStr}</span>
            <span className={`badge ${auth?.client?.paymentStatus}`}>{auth?.client?.paymentStatus}</span>
          </div>
        </div>
      </div>

      {links.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Quick Access</h3>
          <div className="home-quick-grid">
            {links.map((item) => (
              <button key={item.to} className="home-quick-card" onClick={() => navigate(item.to)}>
                <span className="home-quick-icon"><Icon name={item.icon} size={22} /></span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
