const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { requireActiveSubscription } = require('../middleware/subscription.middleware');
const { ROLES } = require('../utils/roles');
const billingCtrl = require('../controllers/billing.controller');

router.use(authenticate, requireActiveSubscription);

// Bill creation and its supporting lookups stay Front-Office-only - that's FrontDesk.jsx's job.
router.get('/test-prices', requireRole(ROLES.FRONT_OFFICE), billingCtrl.listTestPrices);
router.get('/payors', requireRole(ROLES.FRONT_OFFICE), billingCtrl.listPayors);
router.get('/payors/:id/test-prices', requireRole(ROLES.FRONT_OFFICE), billingCtrl.listPayorTestPrices);
router.post('/bills', requireRole(ROLES.FRONT_OFFICE), billingCtrl.createBill);

// The Orders screen itself (list, print/receipt view, cancel & refund) is
// also usable by Manager, so they can reach the same screen to configure
// and use cancellation/refund without needing Front Office to do it for them.
router.get('/bills', requireRole(ROLES.FRONT_OFFICE, ROLES.MANAGER), billingCtrl.listBills);
router.get('/bills/:id', requireRole(ROLES.FRONT_OFFICE, ROLES.MANAGER), billingCtrl.getBill);
router.put('/bills/:billId/items/:itemId/cancel', requireRole(ROLES.FRONT_OFFICE, ROLES.MANAGER), billingCtrl.cancelBillItem);
router.put('/bills/:billId/discount', requireRole(ROLES.FRONT_OFFICE, ROLES.MANAGER), billingCtrl.applyPostBillingDiscount);

module.exports = router;
