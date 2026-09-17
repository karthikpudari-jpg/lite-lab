const XLSX = require('xlsx');
const { Client, ChiefAdmin, Role } = require('../models');

/** Aggregates every client's subscription value by the Sales/Marketing person on record. */
async function buildSalesReportData() {
  const marketingRole = await Role.findOne({ where: { name: 'MARKETING' } });
  const marketingUsers = marketingRole
    ? await ChiefAdmin.findAll({
        include: [{ model: Role, where: { id: marketingRole.id }, through: { attributes: [] } }],
      })
    : [];

  const summaryMap = new Map();
  for (const u of marketingUsers) {
    summaryMap.set(u.username, {
      salesPerson: u.username,
      name: u.name || u.username,
      clientCount: 0,
      totalMonthlyRevenue: 0,
      totalMarketingPersonPrice: 0,
      paid: 0,
      pending: 0,
      expired: 0,
    });
  }

  const clients = await Client.findAll({ order: [['createdAt', 'DESC']] });
  const details = [];

  for (const c of clients) {
    if (!c.salesPerson) continue;
    if (!summaryMap.has(c.salesPerson)) {
      summaryMap.set(c.salesPerson, {
        salesPerson: c.salesPerson,
        name: c.salesPerson,
        clientCount: 0,
        totalMonthlyRevenue: 0,
        totalMarketingPersonPrice: 0,
        paid: 0,
        pending: 0,
        expired: 0,
      });
    }
    const s = summaryMap.get(c.salesPerson);
    s.clientCount += 1;
    s.totalMonthlyRevenue += Number(c.monthlyAmount);
    s.totalMarketingPersonPrice += Number(c.marketingPersonPrice || 0);
    if (c.paymentStatus === 'PAID') s.paid += 1;
    else if (c.paymentStatus === 'PENDING') s.pending += 1;
    else if (c.paymentStatus === 'EXPIRED') s.expired += 1;

    details.push({
      salesPerson: c.salesPerson,
      clientCode: c.clientCode,
      clientName: c.clientName,
      marketingPersonPrice: Number(c.marketingPersonPrice || 0),
      monthlyAmount: Number(c.monthlyAmount),
      paymentStatus: c.paymentStatus,
      active: c.active,
      createdAt: c.createdAt,
    });
  }

  return { summary: [...summaryMap.values()], details };
}

// GET /api/chief-admin-users/sales-report
async function getSalesReport(req, res) {
  const data = await buildSalesReportData();
  return res.json(data);
}

// GET /api/chief-admin-users/sales-report/export
async function exportSalesReport(req, res) {
  const { summary, details } = await buildSalesReportData();

  const summaryRows = summary.map((s) => ({
    'Sales Person': s.name,
    Username: s.salesPerson,
    'Clients Onboarded': s.clientCount,
    'Total Monthly Revenue': s.totalMonthlyRevenue,
    'Total Marketing Person Price': s.totalMarketingPersonPrice,
    Paid: s.paid,
    Pending: s.pending,
    Expired: s.expired,
  }));
  const detailRows = details.map((d) => ({
    'Sales Person': d.salesPerson,
    'Client Code': d.clientCode,
    'Client Name': d.clientName,
    'Marketing Person Price': d.marketingPersonPrice,
    'Monthly Amount': d.monthlyAmount,
    'Payment Status': d.paymentStatus,
    Active: d.active ? 'Yes' : 'No',
    'Created On': new Date(d.createdAt).toISOString().slice(0, 10),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Summary');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Details');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="marketing-sales-report.xlsx"');
  return res.send(buffer);
}

module.exports = { getSalesReport, exportSalesReport };
