require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
require('express-async-errors'); // makes thrown/rejected errors in async route handlers reach the error middleware instead of crashing the process
const cors = require('cors');
const { sequelize } = require('./models');
const routes = require('./routes');
const { expireOverdueSubscriptions } = require('./controllers/subscription.controller');

const app = express();
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));
app.use('/uploads', express.static(UPLOAD_ROOT));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  await sequelize.sync(); // dev convenience; use real migrations in production
  await expireOverdueSubscriptions();
  setInterval(() => {
    expireOverdueSubscriptions().catch((err) => console.error('expireOverdueSubscriptions failed:', err));
  }, 24 * 60 * 60 * 1000);

  app.listen(PORT, () => console.log(`HMS/LIMS API listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
