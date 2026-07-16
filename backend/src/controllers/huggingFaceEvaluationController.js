const huggingFaceService = require('../services/huggingFaceEvaluationService');
const {
  getDocument,
  collections,
  queryDocuments,
  createDocument,
  updateDocument, // ✅ FIXED: was missing
  logAudit
} = require('../services/databaseService');

const { validateScore } = require('../services/validationService');
const { calculateFinalScore } = require('../services/calculationService');

/**
 * HuggingFace AI Evaluation Controller
 * Production-ready version
 */

// ─────────────────────────────────────────────────────────────
// AUTO EVALUATE
// ─────────────────────────────────────────────────────────────
async function autoEvaluateWithAI(req, res) {
  try {
    const professorId = req.user?.uid;
    const { submissionId } = req.body;

    if (!submissionId) {
      return res.status(400).json({ error: 'Submission ID is required' });
    }

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!submission.fileContent?.trim()) {
      return res.status(400).json({
        error: 'Submission has no content to evaluate'
      });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only evaluate submissions for your own assignments'
      });
    }

    // Prevent duplicate evaluation
    const existingScores = await queryDocuments(collections.SCORES, [
      { field: 'submissionId', operator: '==', value: submissionId }
    ]);

    if (existingScores.length > 0) {
      return res.status(409).json({
        error: 'Submission already evaluated',
        score: existingScores[0]
      });
    }

    // Get rubric
    const rubrics = await queryDocuments(collections.RUBRICS, [
      { field: 'assignmentId', operator: '==', value: assignment.id }
    ]);

    if (!rubrics.length) {
      return res.status(404).json({
        error: 'No rubric found for this assignment'
      });
    }

    const rubric = rubrics[0];

    const structuredRubric = {
      criteria: rubric.criteria.map(c => ({
        name: c.name,
        description: c.description || '',
        maxPoints: c.maxPoints,
        criterionId: c.criterionId
      })),
      plagiarismWeightage: assignment.plagiarismWeightage || 30,
      criteriaWeightage: assignment.criteriaWeightage || 70
    };

    // ─── AI Evaluation ──────────────────────────────────────
    const evaluation = await huggingFaceService.evaluateAssignment(
      assignment.description || assignment.title,
      structuredRubric,
      submission.fileContent
    );

    // ─── Plagiarism Check (Safe Fallback) ───────────────────
    let plagiarismCheck = {
      plagiarism_score: 0,
      confidence: 'low',
      risk_level: 'none',
      suspicious_patterns: [],
      recommendations: 'Plagiarism check unavailable'
    };

    try {
      plagiarismCheck = await huggingFaceService.checkPlagiarism(
        submission.fileContent,
        submission.previousDrafts || [],
        []
      );
    } catch (err) {
      console.error('Plagiarism check failed:', err.message);
    }

    // ─── Map Criteria Scores ────────────────────────────────
    const criteriaScores = rubric.criteria.map((criterion) => {
      const aiCriterion = evaluation.criteria_scores?.[criterion.name];

      return {
        criterionId: criterion.criterionId,
        name: criterion.name,
        points: aiCriterion?.score || 0,
        maxPoints: aiCriterion?.max_score || criterion.maxPoints,
        feedback: aiCriterion?.feedback || 'Not evaluated'
      };
    });

    // ─── Calculate Final Score ──────────────────────────────
    const calculation = calculateFinalScore(
      plagiarismCheck.plagiarism_score,
      criteriaScores,
      structuredRubric.plagiarismWeightage,
      structuredRubric.criteriaWeightage
    );

    const scoreData = {
      submissionId,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      studentName: submission.studentName,
      evaluatedBy: 'AI',
      evaluatedByName: 'HuggingFace AI',
      plagiarismScore: plagiarismCheck.plagiarism_score,
      criteriaScores,
      feedback: evaluation.overall_feedback || 'AI evaluation completed',
      ...calculation,
      overridden: false,
      overrideReason: null,
      evaluatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiMetadata: {
        model: process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.2-3B-Instruct',
        grade: evaluation.grade,
        percentage: evaluation.percentage
      }
    };

    const validation = validateScore(scoreData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const score = await createDocument(collections.SCORES, scoreData);

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'evaluate',
      'score',
      score.id,
      { action: 'AI evaluation' }
    );

    return res.status(200).json({
      success: true,
      submissionId,
      scoreId: score.id,
      finalScore: calculation.finalScore,
      weightedScore: calculation.weightedScore
    });

  } catch (error) {
    console.error('AI evaluation error:', error);
    return res.status(500).json({
      error: 'AI evaluation failed',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// GET EVALUATION DETAILS
// ─────────────────────────────────────────────────────────────
async function getEvaluationDetails(req, res) {
  try {
    const { submissionId } = req.params;
    const userId = req.user.uid;
    const userRole = req.user.role;

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);

    const isProfessor = userRole === 'professor' && assignment.professorId === userId;
    const isStudent = userRole === 'student' && submission.studentId === userId;

    if (!isProfessor && !isStudent) {
      return res.status(403).json({
        error: 'You do not have permission to view this evaluation'
      });
    }

    const scores = await queryDocuments(collections.SCORES, [
      { field: 'submissionId', operator: '==', value: submissionId }
    ]);

    if (!scores.length) {
      return res.status(404).json({
        error: 'No evaluation found'
      });
    }

    return res.status(200).json({
      success: true,
      evaluation: scores[0]
    });

  } catch (error) {
    console.error('Get evaluation error:', error);
    return res.status(500).json({
      error: 'Failed to fetch evaluation',
    });
  }
}

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────
async function checkAIHealth(req, res) {
  try {
    const hasToken = !!process.env.HUGGINGFACE_API_TOKEN;

    return res.status(200).json({
      configured: hasToken,
      model: process.env.HUGGINGFACE_MODEL,
      message: hasToken
        ? 'HuggingFace AI is configured'
        : 'HUGGINGFACE_API_TOKEN missing in .env'
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Failed to check AI health',
    });
  }
}

module.exports = {
  autoEvaluateWithAI,
  getEvaluationDetails,
  checkAIHealth
};
