const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { requireActiveSubscription } = require('../middleware/subscription.middleware');
const { ROLES } = require('../utils/roles');
const billingCtrl = require('../controllers/billing.controller');

router.use(authenticate, requireActiveSubscription, requireRole(ROLES.FRONT_OFFICE));

router.get('/test-prices', billingCtrl.listTestPrices);
router.get('/payors', billingCtrl.listPayors);
router.get('/payors/:id/test-prices', billingCtrl.listPayorTestPrices);
router.post('/bills', billingCtrl.createBill);
router.get('/bills', billingCtrl.listBills);
router.get('/bills/:id', billingCtrl.getBill);

module.exports = router;
