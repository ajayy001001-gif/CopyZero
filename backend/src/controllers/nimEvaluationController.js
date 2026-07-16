const { evaluateSubmissionWithNim, checkNimStatus } = require('../services/nimEvaluationService');
const { evaluateSubmissionWithHuggingFace } = require('../services/huggingFaceEvaluationService');
const { getDocument, collections, queryDocuments } = require('../services/databaseService');

async function autoEvaluateWithNim(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.body;

    console.log(`Starting NVIDIA NIM evaluation for submission: ${submissionId}`);

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

    const config = {
      model: process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-flash'
    };

    let results;
    let usedFallback = false;
    let primaryError;

    try {
      console.log(`Using NVIDIA NIM model: ${config.model}`);
      results = await evaluateSubmissionWithNim(submissionData, config);
    } catch (nimError) {
      primaryError = nimError;
      console.error('NVIDIA NIM evaluation failed, falling back to HuggingFace:', nimError.message);
      try {
        results = await evaluateSubmissionWithHuggingFace(submissionData);
        usedFallback = true;
      } catch (hfError) {
        console.error('HuggingFace fallback also failed:', hfError.message);
        throw primaryError; // report the original (more informative) NIM failure
      }
    }

    // Response shape is identical to the previous HuggingFace/Ollama pipeline —
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
        usingOllama: false,
        usingHuggingFace: usedFallback,
        usingNim: !usedFallback,
        fallbackUsed: usedFallback,
        model: usedFallback ? 'HuggingFace (fallback)' : config.model
      }
    };

    console.log(usedFallback ? '✅ Evaluation complete (via HuggingFace fallback)!' : '✅ Evaluation complete!');
    return res.status(200).json(response);

  } catch (error) {
    console.error('AI evaluation error:', error);

    let errorMessage = 'AI evaluation failed';
    let helpText = '';

    if (error.message.includes('NVIDIA_NIM_API_KEY')) {
      errorMessage = 'NVIDIA NIM API key not configured';
      helpText = 'Add NVIDIA_NIM_API_KEY to your backend .env file';
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMessage = 'AI evaluation timed out';
      helpText = 'The model took too long to respond. Try again.';
    } else if (error.response?.status === 429 || error.message.includes('rate limit') || error.message.includes('429')) {
      errorMessage = 'NVIDIA NIM rate limit reached';
      helpText = 'Wait a minute and try again';
    } else if (error.response?.status === 401 || error.response?.status === 403) {
      errorMessage = 'NVIDIA NIM authentication failed';
      helpText = 'Check that NVIDIA_NIM_API_KEY is valid';
    } else if (error.message.includes('No JSON object found')) {
      errorMessage = 'AI response could not be parsed';
      helpText = 'The model did not return valid JSON. Try again.';
    }

    return res.status(500).json({
      error: errorMessage,
      help: helpText,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

async function checkNimHealth(req, res) {
  try {
    const status = await checkNimStatus();

    return res.status(200).json({
      running: status.running,
      model: status.model,
      error: status.error || null,
      message: status.running
        ? `NVIDIA NIM is ready! Model: ${status.model}`
        : `NVIDIA NIM error: ${status.error}`
    });

  } catch (error) {
    return res.status(500).json({
      running: false,
      error: 'Failed to check NVIDIA NIM status',
    });
  }
}

module.exports = {
  autoEvaluateWithNim,
  checkNimHealth
};
