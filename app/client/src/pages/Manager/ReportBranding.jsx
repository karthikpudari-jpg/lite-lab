import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function ReportBranding() {
  const [branding, setBranding] = useState({ logoUrl: null, letterheadUrl: null });
  const [logoFile, setLogoFile] = useState(null);
  const [letterheadFile, setLetterheadFile] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data } = await api.get('/branding');
    setBranding(data);
  }
  useEffect(() => { load(); }, []);

  async function handleUpload(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!logoFile && !letterheadFile) {
      setError('Choose a logo and/or letterhead file first');
      return;
    }
    const formData = new FormData();
    if (logoFile) formData.append('logo', logoFile);
    if (letterheadFile) formData.append('letterhead', letterheadFile);
    try {
      const { data } = await api.post('/branding', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBranding(data);
      setLogoFile(null);
      setLetterheadFile(null);
      setMessage('Branding updated. New reports for this client will use it.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload branding');
    }
  }

  return (
    <div className="card">
      <h3>Report Branding</h3>
      <p style={{ fontSize: 13, color: '#64748b' }}>
        Upload a logo and/or a full letterhead image. If a letterhead is set, it is used as the report's header
        image; otherwise the logo (if any) is shown alongside the client name.
      </p>

      <form onSubmit={handleUpload} className="form-grid" style={{ alignItems: 'end' }}>
        <label><span>Logo</span>
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files[0])} />
        </label>
        <label><span>Letterhead</span>
          <input type="file" accept="image/*" onChange={(e) => setLetterheadFile(e.target.files[0])} />
        </label>
        <button type="submit">Upload</button>
      </form>

      {error && <p className="error-text">{error}</p>}
      {message && <p style={{ color: '#166534' }}>{message}</p>}

      <div className="branding-preview">
        <figure>
          {branding.logoUrl ? <img src={branding.logoUrl} alt="Logo preview" /> : <div style={{ width: 220, height: 120, background: '#f1f5f9', borderRadius: 8 }} />}
          <figcaption>Current Logo</figcaption>
        </figure>
        <figure>
          {branding.letterheadUrl ? <img src={branding.letterheadUrl} alt="Letterhead preview" /> : <div style={{ width: 220, height: 120, background: '#f1f5f9', borderRadius: 8 }} />}
          <figcaption>Current Letterhead</figcaption>
        </figure>
      </div>
    </div>
  );
}
