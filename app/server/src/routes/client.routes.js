const router = require('express').Router();
const multer = require('multer');
const { authenticate, requireChiefAdmin, requireChiefAdminRole } = require('../middleware/auth.middleware');
const { CHIEF_ADMIN_ROLES } = require('../utils/roles');
const clientCtrl = require('../controllers/client.controller');
const subCtrl = require('../controllers/subscription.controller');
const userCtrl = require('../controllers/user.controller');
const priceCtrl = require('../controllers/clientTestPrice.controller');
const roleScreenCtrl = require('../controllers/roleScreen.controller');

const upload = multer({ storage: multer.memoryStorage() });

// All routes here are Chief Admin only.
router.use(authenticate, requireChiefAdmin);

router.post('/', clientCtrl.createClient);
router.get('/', clientCtrl.listClients);
router.get('/marketing-persons', clientCtrl.listMarketingPersons);
router.get('/next-code', clientCtrl.previewNextClientCode);
router.get('/:id', clientCtrl.getClient);
router.put('/:id', clientCtrl.updateClient);

router.get('/:clientId/subscriptions', subCtrl.listSubscriptions);
router.get('/:clientId/subscriptions/current', subCtrl.getCurrentSubscription);

router.post('/:clientId/users', userCtrl.createUser);
router.get('/:clientId/users', userCtrl.listUsers);
router.put('/:clientId/users/:userId', userCtrl.updateUser);

router.get('/:clientId/test-prices', priceCtrl.listPrices);
router.put('/:clientId/test-prices', priceCtrl.setPrice);
router.post('/:clientId/test-prices/upload/preview', upload.single('file'), priceCtrl.previewUpload);
router.post('/:clientId/test-prices/upload/commit', priceCtrl.commitUpload);

// Role -> screen access for this one client's staff - Chief Admin (ADMIN role) only,
// not Marketing, matching /role-screen-defaults' restriction on the platform-wide baseline.
const requireAdminRole = requireChiefAdminRole(CHIEF_ADMIN_ROLES.ADMIN);
router.get('/:clientId/role-screens', requireAdminRole, roleScreenCtrl.getClientRoleScreensForAdmin);
router.put('/:clientId/role-screens', requireAdminRole, roleScreenCtrl.updateClientRoleScreensForAdmin);

module.exports = router;
