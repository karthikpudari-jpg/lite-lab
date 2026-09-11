const router = require('express').Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth.middleware');
const { requireRole } = require('../middleware/role.middleware');
const { requireActiveSubscription } = require('../middleware/subscription.middleware');
const { ROLES } = require('../utils/roles');
const testCtrl = require('../controllers/testMaster.controller');
const priceCtrl = require('../controllers/clientTestPrice.controller');
const packageCtrl = require('../controllers/package.controller');

const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, requireActiveSubscription, requireRole(ROLES.MASTER_MANAGER));

// Test Master (global, unique across all clients)
router.get('/tests', testCtrl.listTests);
router.post('/tests', testCtrl.createTest);
router.put('/tests/:id', testCtrl.updateTest);
router.post('/tests/:testId/parameters', testCtrl.addParameter);

// Client-wise test pricing for the logged-in client
router.get('/client-test-price', priceCtrl.listPrices);
router.put('/client-test-price', priceCtrl.setPrice);
router.get('/client-test-price/template', priceCtrl.downloadTemplate);
router.post('/client-test-price/upload/preview', upload.single('file'), priceCtrl.previewUpload);
router.post('/client-test-price/upload/commit', priceCtrl.commitUpload);

// Packages (client-wise bundles of tests with their own price)
router.get('/packages', packageCtrl.listPackages);
router.post('/packages', packageCtrl.createPackage);
router.put('/packages/:id', packageCtrl.updatePackage);
router.get('/packages/template', packageCtrl.downloadTemplate);
router.post('/packages/upload/preview', upload.single('file'), packageCtrl.previewUpload);
router.post('/packages/upload/commit', packageCtrl.commitUpload);

module.exports = router;
