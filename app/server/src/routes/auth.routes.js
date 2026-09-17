const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { chiefAdminLogin, clientUserLogin, selfRegister, changeOwnPassword, logout } = require('../controllers/auth.controller');

router.post('/chief-admin/login', chiefAdminLogin);
router.post('/login', clientUserLogin);
router.post('/self-register', selfRegister);
router.put('/change-password', authenticate, changeOwnPassword);
router.post('/logout', authenticate, logout);

module.exports = router;
