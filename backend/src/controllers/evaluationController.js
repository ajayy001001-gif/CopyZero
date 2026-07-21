const { createDocument, getDocument, updateDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { validateScore } = require('../services/validationService');
const { calculateFinalScore, normalizeScore } = require('../services/calculationService');
const { computeIntegrityScore } = require('../services/integrityScoreService');
const { isValidUserKey } = require('../services/aiProviderService');

async function evaluateSubmission(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId, plagiarismScore, criteriaScores, feedback, testResultPlausibility } = req.body;

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);

    if (!submission) {
      return res.status(404).json({
        error: 'Submission not found'
      });
    }

    if (submission.status !== 'final') {
      return res.status(400).json({
        error: 'Can only evaluate final submissions'
      });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only evaluate submissions for your own assignments'
      });
    }

    const existingScores = await queryDocuments(collections.SCORES, [
      { field: 'submissionId', operator: '==', value: submissionId }
    ]);

    let score;
    let isUpdate = false;

    if (existingScores.length > 0) {
      isUpdate = true;
      score = existingScores[0];
      // Instead of failing with 409, we will just update the existing score.
      // The logic below will build the completeScoreData, and then we will update it.
    }

    const scoreData = {
      submissionId,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      studentName: submission.studentName,
      evaluatedBy: professorId,
      evaluatedByName: req.user.name || req.user.email,
      plagiarismScore,
      criteriaScores,
      feedback: feedback || ''
    };

    const validation = validateScore(scoreData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const calculation = calculateFinalScore(
      plagiarismScore,
      criteriaScores,
      assignment.plagiarismWeightage,
      assignment.criteriaWeightage
    );

    const completeScoreData = {
      ...scoreData,
      ...calculation,
      overridden: false,
      overrideReason: null,
      evaluatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isUpdate) {
      completeScoreData.updatedAt = new Date().toISOString();
      await updateDocument(collections.SCORES, score.id, completeScoreData);

      await logAudit(
        professorId,
        req.user.name || req.user.email,
        'update',
        'score',
        score.id,
        { updated: completeScoreData }
      );
    } else {
      score = await createDocument(collections.SCORES, completeScoreData);

      await logAudit(
        professorId,
        req.user.name || req.user.email,
        'evaluate',
        'score',
        score.id,
        { created: completeScoreData }
      );
    }

    // Update the submission document to reflect the score so the UI knows it's evaluated
    await updateDocument(collections.SUBMISSIONS, submissionId, {
      score: calculation.finalScore,
      evaluatedAt: new Date().toISOString()
    });

    // Compute the behavioral integrity score after every successful
    // evaluation. Never blocks or fails the evaluation response — this is a
    // secondary signal for the professor, not a gate on scoring.
    (async () => {
      const rawUserKey = req.headers['x-user-ai-key'];
      const userKey = rawUserKey && isValidUserKey('groq', rawUserKey) ? rawUserKey : null;
      const events = await queryDocuments(collections.EVENTS, [
        { field: 'submissionId', operator: '==', value: submissionId }
      ]);
      const safePlausibility = testResultPlausibility && typeof testResultPlausibility === 'object'
        && typeof testResultPlausibility.consistent === 'boolean'
        ? { consistent: testResultPlausibility.consistent, concern: typeof testResultPlausibility.concern === 'string' ? testResultPlausibility.concern.slice(0, 300) : null }
        : null;

      return computeIntegrityScore({
        submissionId,
        events,
        plagiarismScore,
        aiDetectionScore: null,
        userKey,
        testResultPlausibility: safePlausibility
      });
    })().catch((integrityErr) => {
      console.error(`Background integrity check failed for submission ${submissionId}:`, integrityErr);
    });

    return res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? 'Submission score updated successfully' : 'Submission evaluated successfully',
      score
    });

  } catch (error) {
    console.error('Evaluate submission error:', error);
    return res.status(500).json({
      error: 'Failed to evaluate submission',
    });
  }
}

async function getSubmissionsByAssignment(req, res) {
  try {
    const professorId = req.user.uid;
    const { assignmentId } = req.params;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only view submissions for your own assignments'
      });
    }

    const submissions = await queryDocuments(collections.SUBMISSIONS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'status', operator: '==', value: 'final' }
    ]);

    return res.status(200).json({
      count: submissions.length,
      submissions
    });

  } catch (error) {
    console.error('Get submissions error:', error);
    return res.status(500).json({
      error: 'Failed to fetch submissions',
    });
  }
}

async function overrideScore(req, res) {
  try {
    const professorId = req.user.uid;
    const { scoreId } = req.params;
    const { newFinalScore, overrideReason } = req.body;

    if (typeof newFinalScore !== 'number' || newFinalScore < 0 || newFinalScore > 10) {
      return res.status(400).json({
        error: 'Final score must be between 0 and 10'
      });
    }

    if (!overrideReason || overrideReason.trim().length === 0) {
      return res.status(400).json({
        error: 'Override reason is required'
      });
    }

    const score = await getDocument(collections.SCORES, scoreId);

    if (!score) {
      return res.status(404).json({
        error: 'Score not found'
      });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, score.assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only override scores for your own assignments'
      });
    }

    const oldFinalScore = score.finalScore;

    const updated = await updateDocument(collections.SCORES, scoreId, {
      finalScore: normalizeScore(newFinalScore),
      overridden: true,
      overrideReason,
      overriddenAt: new Date().toISOString(),
      overriddenBy: professorId
    });

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'update',
      'score',
      scoreId,
      {
        action: 'override',
        oldScore: oldFinalScore,
        newScore: newFinalScore,
        reason: overrideReason
      }
    );

    return res.status(200).json({
      message: 'Score overridden successfully',
      score: updated
    });

  } catch (error) {
    console.error('Override score error:', error);
    return res.status(500).json({
      error: 'Failed to override score',
    });
  }
}

async function getScoresByAssignment(req, res) {
  try {
    const professorId = req.user.uid;
    const { assignmentId } = req.params;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only view scores for your own assignments'
      });
    }

    const scores = await queryDocuments(collections.SCORES, [
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);

    return res.status(200).json({
      count: scores.length,
      scores
    });

  } catch (error) {
    console.error('Get scores error:', error);
    return res.status(500).json({
      error: 'Failed to fetch scores',
    });
  }
}

module.exports = {
  evaluateSubmission,
  getSubmissionsByAssignment,
  overrideScore,
  getScoresByAssignment
};