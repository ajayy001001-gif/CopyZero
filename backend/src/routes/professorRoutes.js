const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const rubricController = require('../controllers/rubricController');
const evaluationController = require('../controllers/evaluationController');
const groqEvaluationController = require('../controllers/groqEvaluationController');
const codingQuestionController = require('../controllers/codingQuestionController');
const assessmentController = require('../controllers/assessmentController');
const questionGeneratorController = require('../controllers/questionGeneratorController');
// NOTE: AI evaluation is BYOK-only (Groq, llama-3.1-8b-instant) — there is
// no platform-funded key. Every request must supply its own valid
// X-User-AI-Key header or the controller rejects it before any AI call.
// nimEvaluationController/aiProviderService (NIM + HF gateway) and
// ollamaEvaluationController were built out but are kept unwired.

const { verifyToken, checkVITEmail, checkRole } = require('../middleware/auth');

// No AI-quota protection needed here anymore (every call spends the
// professor's own Groq quota, never the platform's) — this limiter is purely
// to protect our own server/Firestore from request flooding.
const aiEvaluateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Too many evaluation requests, please wait a few minutes and try again' }
});

// AI question generation is expensive (long prompts, multiple retries) and
// can spend the platform Groq quota — cap at 8 per professor per hour.
// In-memory (default MemoryStore), keyed by professorId.
const generateQuestionsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
  message: { error: 'Generation limit reached (8/hour). Please try again later.' }
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

// ── Coding question routes ───────────────────────────────────────────────────────
router.post('/coding-questions',
  verifyToken, checkVITEmail, checkRole(['professor']),
  codingQuestionController.createCodingQuestion);

// ── Assessment routes (MCQ + coding, separate entity from Assignments) ──────────
router.post('/assessments',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assessmentController.createAssessment);

router.get('/assessments',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assessmentController.getAssessmentsByProfessor);

router.get('/assessments/:id',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assessmentController.getAssessmentById);

router.put('/assessments/:id',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assessmentController.updateAssessment);

router.post('/assessments/:id/publish',
  verifyToken, checkVITEmail, checkRole(['professor']),
  assessmentController.publishAssessment);

// ── AI question generation (Groq → NIM/HF fallback, review-only) ─────────────────
router.post('/generate-assessment-questions',
  verifyToken, checkVITEmail, checkRole(['professor']), generateQuestionsLimiter,
  questionGeneratorController.generateAssessmentQuestions);

// ── AI evaluation routes (powered by Groq internally) ───────────────────────────
// Route paths kept the same so frontend needs no changes
router.post('/ollama-evaluate',
  verifyToken, checkVITEmail, checkRole(['professor']), aiEvaluateLimiter,
  groqEvaluationController.autoEvaluateWithGroq);

router.get('/ollama-health',
  verifyToken, checkVITEmail, checkRole(['professor']),
  groqEvaluationController.checkGroqHealth);

module.exports = router;
