const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const aiKeyController = require('../controllers/aiKeyController');
const { verifyToken, checkVITEmail } = require('../middleware/auth');

// Prevents using this endpoint to probe/brute-force key validity.
const testKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many key test attempts, please try again later' }
});

router.post('/test-key', verifyToken, checkVITEmail, testKeyLimiter, aiKeyController.testKey);

module.exports = router;
