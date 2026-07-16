const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const eventController = require('../controllers/eventController');
const evidenceController = require('../controllers/evidenceController');
const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

// Client flushes every 15s (~4 batches/min under normal use). Capped well
// above that to allow retries/bursts but still block event-flooding DoS.
const eventBatchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many event batches, please slow down' }
});

// Evidence (webcam snapshots / screen clips) fires only on flagged events,
// not continuously — a much lower ceiling than the event batch limiter.
const evidenceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many evidence uploads, please slow down' }
});

router.post('/batch',
  verifyToken, checkVITEmail, checkRole(['student']), eventBatchLimiter,
  eventController.batchEvents);

router.post('/evidence',
  verifyToken, checkVITEmail, checkRole(['student']), evidenceLimiter,
  evidenceController.uploadEvidence);

router.get('/:submissionId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  eventController.getEventTimeline);

module.exports = router;
