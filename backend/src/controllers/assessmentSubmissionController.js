const { createDocument, getDocument, updateDocument, queryDocuments, collections } = require('../services/databaseService');
const { isValidUserKey } = require('../services/aiProviderService');
const { gradeMcq, gradeCoding, computeTotalScore } = require('../services/assessmentGradingService');
const { computeIntegrityScore } = require('../services/integrityScoreService');
const { sanitizeForStudent } = require('./assessmentController');

const DEADLINE_GRACE_MS = 30 * 1000; // network-latency buffer, not a loophole

function deadlineFor(submission, assessment) {
  return new Date(submission.startedAt).getTime() + assessment.durationMinutes * 60 * 1000;
}

// POST /api/student/assessments/:id/start — student only, enrollment
// required. Enforces one active (non-expired) attempt per student.
async function startAssessment(req, res) {
  try {
    const studentId = req.user.uid;
    const { id: assessmentId } = req.params;

    const assessment = await getDocument(collections.ASSESSMENTS, assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.status !== 'active') {
      return res.status(400).json({ error: 'This assessment is not currently active' });
    }

    const enrollment = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assessmentId', operator: '==', value: assessmentId }
    ]);
    if (enrollment.length === 0) {
      return res.status(403).json({ error: 'You must join this assessment with a code first' });
    }

    const existing = await queryDocuments(collections.ASSESSMENT_SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assessmentId', operator: '==', value: assessmentId }
    ]);

    if (existing.length > 0) {
      const prior = existing[0];
      if (prior.status === 'submitted' || prior.status === 'evaluated') {
        return res.status(409).json({ error: 'You have already completed this assessment' });
      }
      if (prior.status === 'in_progress' && Date.now() < deadlineFor(prior, assessment)) {
        // Resume the same attempt rather than starting a second one.
        return res.status(200).json({
          message: 'Resuming existing attempt',
          submission: { id: prior.id, startedAt: prior.startedAt, durationMinutes: assessment.durationMinutes },
          assessment: sanitizeForStudent(assessment)
        });
      }
      // Prior attempt exists but expired without being submitted — allow a
      // fresh attempt below rather than blocking the student forever.
    }

    const submissionData = {
      assessmentId,
      studentId,
      startedAt: new Date().toISOString(),
      submittedAt: null,
      status: 'in_progress',
      mcqAnswers: [],
      codingAnswers: [],
      mcqScore: null,
      codingScore: null,
      totalScore: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = await createDocument(collections.ASSESSMENT_SUBMISSIONS, submissionData);

    return res.status(201).json({
      message: 'Assessment started',
      submission: { id: submission.id, startedAt: submission.startedAt, durationMinutes: assessment.durationMinutes },
      assessment: sanitizeForStudent(assessment)
    });

  } catch (error) {
    console.error('Start assessment error:', error);
    return res.status(500).json({ error: 'Failed to start assessment' });
  }
}

// GET /api/student/assessments/:id/full-questions — student only, requires
// an in_progress attempt they own. Reveals hidden test-case expectedOutput
// (never mcqQuestions.correctAnswer) so the client can run a genuine final
// pass against ALL test cases right before submit. Safe specifically
// because only one attempt per assessment is ever allowed — there's no
// second attempt this knowledge could be reused on.
async function getFullQuestionsForSubmit(req, res) {
  try {
    const studentId = req.user.uid;
    const { id: assessmentId } = req.params;

    const submissions = await queryDocuments(collections.ASSESSMENT_SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assessmentId', operator: '==', value: assessmentId }
    ]);
    const submission = submissions.find(s => s.status === 'in_progress');
    if (!submission) {
      return res.status(403).json({ error: 'No active attempt found for this assessment' });
    }

    const assessment = await getDocument(collections.ASSESSMENTS, assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const codingQuestions = (assessment.codingQuestions || []).map(q => ({
      id: q.id,
      title: q.title,
      allowedLanguages: q.allowedLanguages,
      timeLimitMs: q.timeLimitMs,
      testCases: q.testCases.map(tc => ({ id: tc.id, input: tc.input, expectedOutput: tc.expectedOutput, isHidden: tc.isHidden, points: tc.points }))
    }));

    return res.status(200).json({ codingQuestions });

  } catch (error) {
    console.error('Get full questions error:', error);
    return res.status(500).json({ error: 'Failed to fetch questions' });
  }
}

// POST /api/student/assessments/:id/submit — student only, must own an
// in_progress submission. Server-side duration is the actual security
// boundary; the client-side timer is a UX nicety only.
async function submitAssessment(req, res) {
  try {
    const studentId = req.user.uid;
    const { id: assessmentId } = req.params;
    const { mcqAnswers, codingAnswers } = req.body;

    const submissions = await queryDocuments(collections.ASSESSMENT_SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assessmentId', operator: '==', value: assessmentId }
    ]);
    const submission = submissions.find(s => s.status === 'in_progress');
    if (!submission) {
      return res.status(404).json({ error: 'No active attempt found for this assessment' });
    }

    const assessment = await getDocument(collections.ASSESSMENTS, assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    if (Date.now() > deadlineFor(submission, assessment) + DEADLINE_GRACE_MS) {
      return res.status(400).json({ error: 'Time limit exceeded — this attempt can no longer be submitted' });
    }

    const rawUserKey = req.headers['x-user-ai-key'];
    const userKey = rawUserKey && isValidUserKey('groq', rawUserKey) ? rawUserKey : null;

    const { mcqScore, mcqMaxScore } = gradeMcq(mcqAnswers, assessment.mcqQuestions || []);
    const { codingScore, codingMaxScore, details: codingDetails } = await gradeCoding(
      codingAnswers, assessment.codingQuestions || [], userKey
    );
    const totalScore = computeTotalScore(mcqScore, codingScore);

    const now = new Date().toISOString();
    const updated = await updateDocument(collections.ASSESSMENT_SUBMISSIONS, submission.id, {
      mcqAnswers: Array.isArray(mcqAnswers) ? mcqAnswers.slice(0, (assessment.mcqQuestions || []).length) : [],
      codingAnswers: Array.isArray(codingAnswers)
        ? codingAnswers.slice(0, (assessment.codingQuestions || []).length).map(a => ({
            questionId: a?.questionId,
            language: a?.language,
            code: typeof a?.code === 'string' ? a.code.slice(0, 50000) : ''
          }))
        : [],
      mcqScore,
      mcqMaxScore,
      codingScore,
      codingMaxScore,
      totalScore,
      codingDetails,
      submittedAt: now,
      status: 'evaluated'
    });

    // Integrity score computed once for the whole session, fed by every
    // event tagged with this submission's ID regardless of which section
    // (MCQ or coding) the student was in when each event fired.
    try {
      const events = await queryDocuments(collections.EVENTS, [
        { field: 'submissionId', operator: '==', value: submission.id }
      ]);
      const flagged = codingDetails.filter(d => d.testResultPlausibility?.consistent === false);
      const aggregatedPlausibility = flagged.length > 0
        ? { consistent: false, concern: flagged.map(d => d.testResultPlausibility.concern).filter(Boolean).join('; ') || 'One or more coding answers flagged' }
        : codingDetails.some(d => d.testResultPlausibility)
          ? { consistent: true, concern: null }
          : null;

      await computeIntegrityScore({
        submissionId: submission.id,
        events,
        plagiarismScore: null,
        aiDetectionScore: null,
        userKey,
        testResultPlausibility: aggregatedPlausibility
      });
    } catch (integrityErr) {
      console.error('Assessment integrity score computation failed:', integrityErr.message);
    }

    return res.status(200).json({
      message: 'Assessment submitted successfully',
      submission: {
        id: updated.id,
        status: updated.status,
        submittedAt: updated.submittedAt,
        mcqScore,
        mcqMaxScore,
        codingScore,
        codingMaxScore,
        totalScore
      }
    });

  } catch (error) {
    console.error('Submit assessment error:', error);
    return res.status(500).json({ error: 'Failed to submit assessment' });
  }
}

module.exports = { startAssessment, getFullQuestionsForSubmit, submitAssessment };
