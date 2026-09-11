const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { chiefAdminLogin, clientUserLogin, selfRegister, changeOwnPassword } = require('../controllers/auth.controller');

router.post('/chief-admin/login', chiefAdminLogin);
router.post('/login', clientUserLogin);
router.post('/self-register', selfRegister);
router.put('/change-password', authenticate, changeOwnPassword);

module.exports = router;
