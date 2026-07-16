const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, checkVITEmail } = require('../middleware/auth');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/profile', verifyToken, checkVITEmail, authController.getProfile);
router.put('/profile', verifyToken, checkVITEmail, authController.updateProfile);

module.exports = router;