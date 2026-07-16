const express = require('express');
const router = express.Router();
const integrityController = require('../controllers/integrityController');
const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

router.get('/:submissionId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  integrityController.getIntegrityScore);

module.exports = router;
