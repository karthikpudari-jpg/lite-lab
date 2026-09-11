const fs = require('fs');
const path = require('path');
const { Client } = require('../models');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

function saveFile(clientId, field, file) {
  const dir = path.join(UPLOAD_ROOT, String(clientId));
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file.originalname) || '.png';
  const filename = `${field}${ext}`;
  fs.writeFileSync(path.join(dir, filename), file.buffer);
  return `/uploads/${clientId}/${filename}`;
}

// GET /api/clients/branding  (current client's report branding)
async function getBranding(req, res) {
  const client = await Client.findByPk(req.user.clientId);
  return res.json({
    logoUrl: client.reportLogoPath || null,
    letterheadUrl: client.reportLetterheadPath || null,
  });
}

// POST /api/clients/branding  (multipart: logo, letterhead - either or both)
async function uploadBranding(req, res) {
  const client = await Client.findByPk(req.user.clientId);
  const updates = {};

  if (req.files?.logo?.[0]) {
    updates.reportLogoPath = saveFile(client.id, 'logo', req.files.logo[0]);
  }
  if (req.files?.letterhead?.[0]) {
    updates.reportLetterheadPath = saveFile(client.id, 'letterhead', req.files.letterhead[0]);
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'Upload a logo and/or letterhead file' });
  }

  await client.update(updates);
  return res.json({
    logoUrl: client.reportLogoPath || null,
    letterheadUrl: client.reportLetterheadPath || null,
  });
}

module.exports = { getBranding, uploadBranding };
