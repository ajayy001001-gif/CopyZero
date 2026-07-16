const express = require('express');
const router = express.Router();
const evidenceController = require('../controllers/evidenceController');
const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

router.get('/evidence/:eventId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  evidenceController.getEvidenceForEvent);

module.exports = router;
