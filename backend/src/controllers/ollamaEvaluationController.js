// Changed line 1: import HuggingFace service instead of Ollama
const { evaluateSubmissionWithHuggingFace, checkHuggingFaceStatus } = require('../services/huggingFaceEvaluationService');
const { getDocument, collections, queryDocuments } = require('../services/databaseService');

async function autoEvaluateWithOllama(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.body;

    console.log(`Starting HuggingFace evaluation for submission: ${submissionId}`);

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
      model: process.env.HUGGINGFACE_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3'
    };

    console.log(`Using HuggingFace model: ${config.model}`);

    // Changed line 2: call HuggingFace instead of Ollama
    const results = await evaluateSubmissionWithHuggingFace(submissionData, config);

    // Response shape is identical — frontend needs no changes
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
        usingHuggingFace: true,
        model: config.model
      }
    };

    console.log('✅ Evaluation complete!');
    return res.status(200).json(response);

  } catch (error) {
    console.error('HuggingFace evaluation error:', error);

    let errorMessage = 'AI evaluation failed';
    let helpText = '';

    if (error.message.includes('HUGGINGFACE_API_TOKEN')) {
      errorMessage = 'HuggingFace token not configured';
      helpText = 'Add HUGGINGFACE_API_TOKEN to your backend .env file';
    } else if (error.message.includes('rate limit') || error.message.includes('429')) {
      errorMessage = 'HuggingFace rate limit reached';
      helpText = 'Wait a minute and try again, or upgrade your HuggingFace plan';
    } else if (error.message.includes('loading') || error.message.includes('503')) {
      errorMessage = 'AI model is loading';
      helpText = 'The model is warming up. Wait 20 seconds and try again.';
    }

    return res.status(500).json({
      error: errorMessage,
      help: helpText
    });
  }
}

async function checkOllamaHealth(req, res) {
  try {
    const status = await checkHuggingFaceStatus();

    return res.status(200).json({
      running: status.running,
      model: status.model,
      error: status.error || null,
      message: status.running
        ? `HuggingFace AI is ready! Model: ${status.model}`
        : `HuggingFace AI error: ${status.error}`
    });

  } catch (error) {
    return res.status(500).json({
      running: false,
      error: 'Failed to check HuggingFace status',
    });
  }
}

module.exports = {
  autoEvaluateWithOllama,
  checkOllamaHealth
};
