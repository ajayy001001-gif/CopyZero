const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const rubricController = require('../controllers/rubricController');
const evaluationController = require('../controllers/evaluationController');
const groqEvaluationController = require('../controllers/groqEvaluationController');
// NOTE: AI evaluation runs on Groq (llama-3.1-8b-instant) with an automatic
// HuggingFace fallback if Groq fails. nimEvaluationController/Service (NVIDIA
// NIM) proved unreliable (deepseek-v4-pro was unresponsive, deepseek-v4-flash
// still fell back frequently) and is no longer wired up here — kept in the
// repo unused, along with ollamaEvaluationController and
// huggingFaceEvaluationController's professor-facing route, for a follow-up
// cleanup pass.

const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

// Groq's free tier has a limited request rate — keep AI evaluation usage
// light and cap it well below that ceiling regardless of how many
// professors are using the app concurrently.
const aiEvaluateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI evaluation limit reached, please wait a few minutes and try again' }
});

// ── Assignment routes ──────────────────────────────────────────────────────────
router.post('/assignments',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.createAssignment);

router.get('/assignments',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.getAssignmentsByProfessor);

router.get('/assignments/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.getAssignmentById);

router.put('/assignments/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.updateAssignment);

router.delete('/assignments/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.deleteAssignment);

router.patch('/assignments/:assignmentId/close',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assignmentController.closeAssignment);

// ── Rubric routes ──────────────────────────────────────────────────────────────
router.post('/rubrics',
  verifyToken, checkVITEmail, checkRole(['professor']),
  rubricController.createRubric);

router.get('/rubrics/assignment/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  rubricController.getRubricByAssignment);

router.put('/rubrics/:rubricId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  rubricController.updateRubric);

// ── Manual evaluation routes ───────────────────────────────────────────────────
router.get('/submissions/assignment/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  evaluationController.getSubmissionsByAssignment);

router.post('/evaluate',
  verifyToken, checkVITEmail, checkRole(['professor']),
  evaluationController.evaluateSubmission);

router.patch('/scores/:scoreId/override',
  verifyToken, checkVITEmail, checkRole(['professor']),
  evaluationController.overrideScore);

router.get('/scores/assignment/:assignmentId',
  verifyToken, checkVITEmail, checkRole(['professor']),
  evaluationController.getScoresByAssignment);

// ── AI evaluation routes (now powered by Groq internally) ──────────────────────
// Route paths kept the same so frontend needs no changes
router.post('/ollama-evaluate',
  verifyToken, checkVITEmail, checkRole(['professor']), aiEvaluateLimiter,
  groqEvaluationController.autoEvaluateWithGroq);

router.get('/ollama-health',
  verifyToken, checkVITEmail, checkRole(['professor']),
  groqEvaluationController.checkGroqHealth);

module.exports = router;
