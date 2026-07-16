const { evaluateSubmission } = require('../services/nimEvaluationService');
const { getProviderStatus } = require('../services/aiProviderService');
const {
  getDocument,
  collections,
  queryDocuments
} = require('../services/databaseService');

/**
 * Provider-agnostic AI evaluation controller. evaluateSubmission() routes
 * every call through aiProviderService.callAI() (NIM → HuggingFace →
 * degraded), so this controller no longer talks to HuggingFace directly.
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

    const rubrics = await queryDocuments(collections.RUBRICS, [
      { field: 'assignmentId', operator: '==', value: assignment.id }
    ]);

    if (!rubrics.length) {
      return res.status(404).json({
        error: 'No rubric found for this assignment'
      });
    }

    const rubric = rubrics[0];

    const submissionData = {
      text: submission.fileContent,
      criteria: rubric.criteria.map(c => ({
        name: c.name,
        description: c.description || '',
        maxPoints: c.maxPoints,
        criterionId: c.criterionId
      })),
      plagiarismWeightage: assignment.plagiarismWeightage || 30,
      criteriaWeightage: assignment.criteriaWeightage || 70
    };

    const results = await evaluateSubmission(submissionData);

    return res.status(200).json({
      success: true,
      submissionId,
      evaluation: {
        plagiarismScore: results.breakdown.plagiarismScore,
        criteriaScores: rubric.criteria.map((criterion, index) => {
          const aiScore = results.contentAnalysis?.criteriaScores[index];
          return {
            criterionId: criterion.criterionId,
            name: criterion.name,
            points: Math.round((aiScore?.score / 100) * criterion.maxPoints),
            maxPoints: criterion.maxPoints,
            aiScore: aiScore?.score,
            reasoning: aiScore?.reasoning
          };
        }),
        finalScore: results.finalScore,
        breakdown: results.breakdown,
        feedback: results.feedback
      },
      metadata: {
        plagiarismDetails: results.plagiarism?.details,
        strengths: results.contentAnalysis?.strengths || [],
        improvements: results.contentAnalysis?.improvements || [],
        evaluatedAt: results.timestamp,
        provider: results.provider,
        usingNim: results.usingNim,
        usingHuggingFace: results.usingHuggingFace,
        degraded: results.degraded
      }
    });

  } catch (error) {
    console.error('AI evaluation error:', error);
    return res.status(500).json({
      error: 'AI evaluation failed. Please try again shortly.'
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
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

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
      error: 'Failed to fetch evaluation'
    });
  }
}

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────
async function checkAIHealth(req, res) {
  try {
    const status = getProviderStatus();
    return res.status(200).json({
      nim: status.nim,
      huggingFace: status.huggingFace
    });
  } catch (error) {
    console.error('AI health check error:', error);
    return res.status(500).json({
      error: 'Failed to check AI provider status'
    });
  }
}

module.exports = {
  autoEvaluateWithAI,
  getEvaluationDetails,
  checkAIHealth
};
