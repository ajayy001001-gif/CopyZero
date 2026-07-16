const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const submissionController = require('../controllers/submissionController');
const draftController = require('../controllers/draftController');
const studentScoreController = require('../controllers/studentScoreController');
const enrollmentController = require('../controllers/enrollmentController');

// NEW: Import HuggingFace controller for viewing evaluations
const hfEvaluationController = require('../controllers/huggingFaceEvaluationController');

const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

// Prevents brute-force enumeration of assignment codes (16^6 ≈ 16.7M
// possibilities, but still worth throttling attempts). Keyed per-student.
const joinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many join attempts, please try again in an hour' }
});

// Enrollment routes
router.post('/join', verifyToken, checkVITEmail, checkRole(['student']), joinLimiter, enrollmentController.joinAssignment);

// Assignment routes
router.get('/assignments', verifyToken, checkVITEmail, checkRole(['student']), assignmentController.getAllAssignments);
router.get('/assignments/:assignmentId', verifyToken, checkVITEmail, checkRole(['student']), assignmentController.getAssignmentById);

// Submission routes
router.post('/submit', verifyToken, checkVITEmail, checkRole(['student']), submissionController.submitAssignment);
router.get('/submissions', verifyToken, checkVITEmail, checkRole(['student']), submissionController.getMySubmissions);
router.get('/submissions/:submissionId', verifyToken, checkVITEmail, checkRole(['student']), submissionController.getSubmissionById);
router.get('/submissions/assignment/:assignmentId', verifyToken, checkVITEmail, checkRole(['student']), submissionController.getSubmissionByAssignment);

// Draft routes
router.post('/drafts', verifyToken, checkVITEmail, checkRole(['student']), draftController.saveDraft);
router.get('/drafts', verifyToken, checkVITEmail, checkRole(['student']), draftController.getAllMyDrafts);
router.get('/drafts/assignment/:assignmentId', verifyToken, checkVITEmail, checkRole(['student']), draftController.getDraftsByAssignment);
router.get('/drafts/assignment/:assignmentId/latest', verifyToken, checkVITEmail, checkRole(['student']), draftController.getLatestDraft);

// Score routes
router.get('/scores', verifyToken, checkVITEmail, checkRole(['student']), studentScoreController.getMyScores);
router.get('/scores/assignment/:assignmentId', verifyToken, checkVITEmail, checkRole(['student']), studentScoreController.getScoreByAssignment);
router.get('/scores/:scoreId', verifyToken, checkVITEmail, checkRole(['student']), studentScoreController.getScoreById);

// ==================== NEW: EVALUATION DETAILS ROUTE ====================
// Allows students to view detailed AI evaluation feedback for their submissions
router.get('/evaluation/:submissionId', 
  verifyToken, 
  checkVITEmail, 
  checkRole(['student']), 
  hfEvaluationController.getEvaluationDetails
);

module.exports = router;