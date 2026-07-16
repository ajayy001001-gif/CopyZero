const { evaluateSubmissionWithGroq, checkGroqStatus } = require('../services/groqEvaluationService');
const { isValidUserKey } = require('../services/aiProviderService');
const { getDocument, collections, queryDocuments } = require('../services/databaseService');

// BYOK only — there is no platform Groq key. Every evaluation requires the
// professor's own key via the X-User-AI-Key header; missing or malformed
// keys are rejected before any AI call is attempted, and never logged
// beyond a boolean presence check.
async function autoEvaluateWithGroq(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.body;

    const rawUserKey = req.headers['x-user-ai-key'];
    if (!rawUserKey) {
      console.log('[AI] user-provided key used: false (missing)');
      return res.status(400).json({
        error: 'AI evaluation requires your own Groq API key',
        help: 'Open "Configure AI" in the sidebar and add your Groq key — there is no shared platform key.'
      });
    }
    if (!isValidUserKey('groq', rawUserKey)) {
      console.log('[AI] user-provided key used: false (rejected — invalid format)');
      return res.status(400).json({ error: 'Invalid API key format' });
    }
    const userKey = rawUserKey;
    console.log('[AI] user-provided key used: true');

    console.log(`Starting Groq evaluation for submission: ${submissionId}`);

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
      console.log(`No rubric found for assignment ${assignment.id}, using default fallback.`);
      rubric = {
        criteria: [
          { criterionId: 'fallback_1', name: 'Content Quality', maxPoints: 50 },
          { criterionId: 'fallback_2', name: 'Code Structure', maxPoints: 50 }
        ]
      };
    } else {
      rubric = rubrics[0];
    }

    // Coding submissions carry client-reported (unverifiable) test results —
    // pass them as one more plausibility signal to the AI evaluator, never
    // as the grade itself.
    let codingContext = null;
    if (submission.submissionKind === 'code' && Array.isArray(submission.claimedTestResults)) {
      const total = submission.claimedTestResults.length;
      const passed = submission.claimedTestResults.filter(r => r.passed).length;
      codingContext = {
        language: submission.language,
        testResultSummary: {
          totalClaimed: total,
          passedClaimed: passed,
          passRate: total > 0 ? passed / total : 0
        }
      };
    }

    const submissionData = {
      text: submission.fileContent,
      criteria: rubric.criteria.map(c => ({
        name: c.name,
        description: c.description || '',
        maxPoints: c.maxPoints
      })),
      plagiarismWeightage: assignment.plagiarismWeightage,
      criteriaWeightage: assignment.criteriaWeightage,
      codingContext
    };

    const config = {
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      userKey
    };

    console.log(`Using Groq model: ${config.model}`);
    const results = await evaluateSubmissionWithGroq(submissionData, config);

    // Response shape is identical to the previous evaluation pipelines —
    // frontend needs no changes.
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
        usingGroq: true,
        usingUserKey: true,
        testResultPlausibility: results.testResultPlausibility,
        model: config.model
      }
    };

    console.log('✅ Evaluation complete!');
    return res.status(200).json(response);

  } catch (error) {
    console.error('AI evaluation error:', error);

    let errorMessage = 'AI evaluation failed';
    let helpText = '';

    if (error.message.includes('GROQ_USER_KEY_REQUIRED')) {
      errorMessage = 'AI evaluation requires your own Groq API key';
      helpText = 'Open "Configure AI" in the sidebar and add your Groq key.';
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMessage = 'AI evaluation timed out';
      helpText = 'The model took too long to respond. Try again.';
    } else if (error.response?.status === 429 || error.message.includes('rate limit') || error.message.includes('429')) {
      errorMessage = 'Your Groq key hit its rate limit';
      helpText = 'Wait a minute and try again — this is your own Groq account\'s rate limit.';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = 'Your Groq key was rejected';
      helpText = 'Check that your key is valid and active in Configure AI.';
    } else if (error.message.includes('No JSON object found')) {
      errorMessage = 'AI response could not be parsed';
      helpText = 'The model did not return valid JSON. Try again.';
    }

    return res.status(500).json({
      error: errorMessage,
      help: helpText
    });
  }
}

// Deliberately does NOT accept a user key here, even though the header may
// be present — this route has no dedicated rate limiter (unlike the
// properly-throttled POST /api/ai/test-key), so honoring a key here would
// give an unrate-limited oracle for probing arbitrary key strings. Key
// validity should only ever be checked via /api/ai/test-key.
async function checkGroqHealth(req, res) {
  try {
    const status = await checkGroqStatus(null);

    return res.status(200).json({
      running: status.running,
      model: status.model,
      message: 'BYOK required — use "Configure AI" to add and test your own Groq key.'
    });

  } catch (error) {
    return res.status(500).json({
      running: false,
      error: 'Failed to check Groq status',
    });
  }
}

module.exports = {
  autoEvaluateWithGroq,
  checkGroqHealth
};
