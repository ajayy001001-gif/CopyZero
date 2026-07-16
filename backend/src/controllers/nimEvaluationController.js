const { evaluateSubmission, checkNimStatus } = require('../services/nimEvaluationService');
const { getProviderStatus, isValidUserKey } = require('../services/aiProviderService');
const { getDocument, collections, queryDocuments } = require('../services/databaseService');

// Provider-agnostic: evaluateSubmission() routes through aiProviderService,
// which tries NIM then HuggingFace and never throws. This controller no
// longer needs its own try/catch fallback chain.
async function autoEvaluateWithNim(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.body;

    // BYOK: reject a malformed key outright rather than silently ignoring it.
    const rawUserKey = req.headers['x-user-ai-key'];
    let userKey = null;
    if (rawUserKey) {
      if (!isValidUserKey('nim', rawUserKey)) {
        console.log('[AI] user-provided key used: false (rejected — invalid format)');
        return res.status(400).json({ error: 'Invalid API key format' });
      }
      userKey = rawUserKey;
    }
    console.log(`[AI] user-provided key used: ${!!userKey}`);

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
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

    let rubric;
    if (rubrics.length === 0) {
      rubric = {
        criteria: [
          { criterionId: 'fallback_1', name: 'Content Quality', maxPoints: 50 },
          { criterionId: 'fallback_2', name: 'Code Structure', maxPoints: 50 }
        ]
      };
    } else {
      rubric = rubrics[0];
    }

    const submissionData = {
      text: submission.fileContent,
      criteria: rubric.criteria.map(c => ({
        name: c.name,
        description: c.description || '',
        maxPoints: c.maxPoints
      })),
      plagiarismWeightage: assignment.plagiarismWeightage,
      criteriaWeightage: assignment.criteriaWeightage
    };

    const results = await evaluateSubmission(submissionData, { userKey, userKeyProvider: 'nim' });

    // Response shape is identical to previous evaluation pipelines — frontend
    // needs no changes.
    const response = {
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
        plagiarismAnalysis: results.plagiarism?.analysis,
        strengths: results.contentAnalysis?.strengths || [],
        improvements: results.contentAnalysis?.improvements || [],
        evaluatedAt: results.timestamp,
        provider: results.provider,
        usingNim: results.usingNim,
        usingHuggingFace: results.usingHuggingFace,
        degraded: results.degraded
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    // Internal details (provider errors, stack traces) never leave the
    // server — log here only, respond with a generic message.
    console.error('AI evaluation error:', error);
    return res.status(500).json({
      error: 'AI evaluation failed. Please try again shortly.'
    });
  }
}

async function checkNimHealth(req, res) {
  try {
    const status = await checkNimStatus();
    return res.status(200).json({
      running: status.running,
      model: status.model
    });
  } catch (error) {
    console.error('NIM health check error:', error);
    return res.status(500).json({
      running: false,
      error: 'Failed to check AI provider status'
    });
  }
}

module.exports = {
  autoEvaluateWithNim,
  checkNimHealth
};
