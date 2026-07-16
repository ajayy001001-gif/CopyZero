const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const rubricController = require('../controllers/rubricController');
const evaluationController = require('../controllers/evaluationController');
const groqEvaluationController = require('../controllers/groqEvaluationController');
// NOTE: AI evaluation runs on Groq (llama-3.1-8b-instant) with an automatic
// HuggingFace fallback if Groq fails — this is the only active provider for
// now. nimEvaluationController/aiProviderService (NIM primary + HF gateway)
// were built out but are kept unwired in the repo, along with
// ollamaEvaluationController, for a possible future follow-up.

const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');
const { isValidUserKey } = require('../services/aiProviderService');

// Groq's free tier has a limited request rate — keep AI evaluation usage
// light and cap it well below that ceiling regardless of how many
// professors are using the app concurrently. Keyed per-professor (not per-IP)
// so the cap can't be sidestepped by switching networks, and kept
// deliberately tight since this is a hosted site with shared credits — see
// GROQ_LIMIT_PER_MIN / GROQ_DAILY_CALL_CAP in groqEvaluationService.js for
// the site-wide cap underneath this per-user one.
// BYOK requests (a valid X-User-AI-Key header) skip this limiter entirely —
// it's the professor's own Groq quota being spent, not the platform's.
const aiEvaluateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  skip: (req) => isValidUserKey('groq', req.headers['x-user-ai-key']),
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

// ── AI evaluation routes (powered by Groq internally) ───────────────────────────
// Route paths kept the same so frontend needs no changes
router.post('/ollama-evaluate',
  verifyToken, checkVITEmail, checkRole(['professor']), aiEvaluateLimiter,
  groqEvaluationController.autoEvaluateWithGroq);

router.get('/ollama-health',
  verifyToken, checkVITEmail, checkRole(['professor']),
  groqEvaluationController.checkGroqHealth);

module.exports = router;
