const router = require('express').Router();
const multer = require('multer');
const { authenticate, requireChiefAdmin } = require('../middleware/auth.middleware');
const clientCtrl = require('../controllers/client.controller');
const subCtrl = require('../controllers/subscription.controller');
const userCtrl = require('../controllers/user.controller');
const priceCtrl = require('../controllers/clientTestPrice.controller');

const upload = multer({ storage: multer.memoryStorage() });

// All routes here are Chief Admin only.
router.use(authenticate, requireChiefAdmin);

router.post('/', clientCtrl.createClient);
router.get('/', clientCtrl.listClients);
router.get('/marketing-persons', clientCtrl.listMarketingPersons);
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

module.exports = router;
