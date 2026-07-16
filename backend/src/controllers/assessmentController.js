const crypto = require('crypto');
const { createDocument, getDocument, updateDocument, queryDocuments, collections } = require('../services/databaseService');
const { generateUniqueCode } = require('../utils/codeGenerator');

const MAX_MCQ_QUESTIONS = 50;
const MAX_CODING_QUESTIONS = 20;
const MAX_TEXT_LEN = 1000;
const MAX_OPTION_LEN = 500;
const MAX_TEST_CASES = 20;
const MAX_FIELD_LEN = 2000;
const MAX_DURATION_MINUTES = 600; // 10h sanity cap
const MIN_DURATION_MINUTES = 1;
const ALLOWED_LANGUAGES = ['python', 'javascript'];

function shortId() {
  return crypto.randomBytes(6).toString('hex');
}

function validateMcqQuestions(mcqQuestions) {
  if (!Array.isArray(mcqQuestions)) return 'mcqQuestions must be an array';
  if (mcqQuestions.length > MAX_MCQ_QUESTIONS) return `mcqQuestions must have at most ${MAX_MCQ_QUESTIONS} entries`;
  for (const [i, q] of mcqQuestions.entries()) {
    if (!q || typeof q !== 'object') return `mcqQuestions[${i}] is invalid`;
    if (typeof q.question !== 'string' || !q.question.trim() || q.question.length > MAX_TEXT_LEN) {
      return `mcqQuestions[${i}].question must be a non-empty string under ${MAX_TEXT_LEN} chars`;
    }
    if (!Array.isArray(q.options) || q.options.length !== 4 ||
        q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > MAX_OPTION_LEN)) {
      return `mcqQuestions[${i}].options must be exactly 4 non-empty strings`;
    }
    if (!Number.isInteger(q.correctAnswer) || q.correctAnswer < 0 || q.correctAnswer > 3) {
      return `mcqQuestions[${i}].correctAnswer must be an integer 0-3`;
    }
    if (typeof q.points !== 'number' || q.points < 0 || q.points > 1000) {
      return `mcqQuestions[${i}].points must be a number between 0 and 1000`;
    }
    if (q.explanation != null && (typeof q.explanation !== 'string' || q.explanation.length > MAX_TEXT_LEN)) {
      return `mcqQuestions[${i}].explanation must be a string under ${MAX_TEXT_LEN} chars`;
    }
  }
  return null;
}

function validateCodingQuestions(codingQuestions) {
  if (!Array.isArray(codingQuestions)) return 'codingQuestions must be an array';
  if (codingQuestions.length > MAX_CODING_QUESTIONS) return `codingQuestions must have at most ${MAX_CODING_QUESTIONS} entries`;
  for (const [i, q] of codingQuestions.entries()) {
    if (!q || typeof q !== 'object') return `codingQuestions[${i}] is invalid`;
    if (typeof q.title !== 'string' || !q.title.trim() || q.title.length > 200) {
      return `codingQuestions[${i}].title must be a non-empty string under 200 chars`;
    }
    if (!Array.isArray(q.testCases) || q.testCases.length < 1 || q.testCases.length > MAX_TEST_CASES) {
      return `codingQuestions[${i}].testCases must be an array of 1-${MAX_TEST_CASES} entries`;
    }
    for (const [j, tc] of q.testCases.entries()) {
      if (!tc || typeof tc !== 'object') return `codingQuestions[${i}].testCases[${j}] is invalid`;
      if (typeof tc.input !== 'string' || tc.input.length > MAX_FIELD_LEN) {
        return `codingQuestions[${i}].testCases[${j}].input must be a string under ${MAX_FIELD_LEN} chars`;
      }
      if (typeof tc.expectedOutput !== 'string' || tc.expectedOutput.length > MAX_FIELD_LEN) {
        return `codingQuestions[${i}].testCases[${j}].expectedOutput must be a string under ${MAX_FIELD_LEN} chars`;
      }
      if (typeof tc.points !== 'number' || tc.points < 0 || tc.points > 1000) {
        return `codingQuestions[${i}].testCases[${j}].points must be a number between 0 and 1000`;
      }
    }
    const languages = Array.isArray(q.allowedLanguages) ? q.allowedLanguages.filter(l => ALLOWED_LANGUAGES.includes(l)) : [];
    if (languages.length === 0) {
      return `codingQuestions[${i}].allowedLanguages must include at least one of: python, javascript`;
    }
  }
  return null;
}

function normalizeMcqQuestions(mcqQuestions) {
  return mcqQuestions.map(q => ({
    id: q.id || shortId(),
    question: q.question.trim().slice(0, MAX_TEXT_LEN),
    options: q.options.map(o => o.trim().slice(0, MAX_OPTION_LEN)),
    correctAnswer: q.correctAnswer,
    points: q.points,
    explanation: typeof q.explanation === 'string' ? q.explanation.slice(0, MAX_TEXT_LEN) : ''
  }));
}

function normalizeCodingQuestions(codingQuestions) {
  return codingQuestions.map(q => ({
    id: q.id || shortId(),
    title: q.title.trim().slice(0, 200),
    description: typeof q.description === 'string' ? q.description.slice(0, MAX_FIELD_LEN) : '',
    starterCode: {
      python: typeof q.starterCode?.python === 'string' ? q.starterCode.python.slice(0, MAX_FIELD_LEN) : '',
      javascript: typeof q.starterCode?.javascript === 'string' ? q.starterCode.javascript.slice(0, MAX_FIELD_LEN) : ''
    },
    testCases: q.testCases.map((tc, j) => ({
      id: tc.id || `${shortId()}_${j}`,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isHidden: !!tc.isHidden,
      points: tc.points
    })),
    allowedLanguages: q.allowedLanguages.filter(l => ALLOWED_LANGUAGES.includes(l)),
    timeLimitMs: typeof q.timeLimitMs === 'number' ? Math.min(Math.max(q.timeLimitMs, 1000), 10000) : 5000,
    // AI-generated coding questions carry provenance + a verification flag so
    // publish can block on unverified ones (see publishAssessment). Manually
    // authored questions have neither flag set → treated as verified, so the
    // existing manual flow is unaffected.
    aiGenerated: !!q.aiGenerated,
    verified: q.aiGenerated ? !!q.verified : true
  }));
}

// Redacts correctAnswer (MCQ) and hidden expectedOutput (coding) — the exam
// UI never receives grading answers, same principle as codingQuestionController.
function sanitizeForStudent(assessment) {
  return {
    id: assessment.id,
    title: assessment.title,
    description: assessment.description,
    durationMinutes: assessment.durationMinutes,
    status: assessment.status,
    mcqQuestions: (assessment.mcqQuestions || []).map(q => ({
      id: q.id,
      question: q.question,
      options: q.options,
      points: q.points
    })),
    codingQuestions: (assessment.codingQuestions || []).map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      starterCode: q.starterCode,
      allowedLanguages: q.allowedLanguages,
      timeLimitMs: q.timeLimitMs,
      testCases: q.testCases.map(tc => ({
        id: tc.id,
        isHidden: tc.isHidden,
        points: tc.points,
        input: tc.input,
        expectedOutput: tc.isHidden ? undefined : tc.expectedOutput
      }))
    }))
  };
}

// POST /api/professor/assessments — creates the shell; mcqQuestions/
// codingQuestions may optionally be included up front (manual entry) or
// added later via PUT.
async function createAssessment(req, res) {
  try {
    const professorId = req.user.uid;
    const { title, description, durationMinutes, mcqQuestions, codingQuestions } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const duration = typeof durationMinutes === 'number'
      ? Math.min(Math.max(durationMinutes, MIN_DURATION_MINUTES), MAX_DURATION_MINUTES)
      : 30;

    const mcqInput = mcqQuestions || [];
    const codingInput = codingQuestions || [];
    const mcqError = validateMcqQuestions(mcqInput);
    if (mcqError) return res.status(400).json({ error: mcqError });
    const codingError = validateCodingQuestions(codingInput);
    if (codingError) return res.status(400).json({ error: codingError });

    const assessmentCode = await generateUniqueCode(collections.ASSESSMENTS, 'assessmentCode');

    const assessmentData = {
      professorId,
      professorName: req.user.name || req.user.email,
      title: title.trim().slice(0, 200),
      description: typeof description === 'string' ? description.slice(0, MAX_FIELD_LEN) : '',
      assessmentCode,
      durationMinutes: duration,
      mcqQuestions: normalizeMcqQuestions(mcqInput),
      codingQuestions: normalizeCodingQuestions(codingInput),
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const assessment = await createDocument(collections.ASSESSMENTS, assessmentData);

    return res.status(201).json({ message: 'Assessment created successfully', assessment });

  } catch (error) {
    console.error('Create assessment error:', error);
    return res.status(500).json({ error: 'Failed to create assessment' });
  }
}

// PUT /api/professor/assessments/:id — ownership-checked, allowlisted fields
// only (same mass-assignment protection pattern as assignmentController).
async function updateAssessment(req, res) {
  try {
    const professorId = req.user.uid;
    const { id } = req.params;

    const assessment = await getDocument(collections.ASSESSMENTS, id);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only update your own assessments' });
    }

    const UPDATABLE_FIELDS = ['title', 'description', 'durationMinutes', 'mcqQuestions', 'codingQuestions'];
    const updates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (updates.title != null) {
      if (typeof updates.title !== 'string' || !updates.title.trim()) {
        return res.status(400).json({ error: 'title must be a non-empty string' });
      }
      updates.title = updates.title.trim().slice(0, 200);
    }
    if (updates.description != null) {
      updates.description = typeof updates.description === 'string' ? updates.description.slice(0, MAX_FIELD_LEN) : '';
    }
    if (updates.durationMinutes != null) {
      if (typeof updates.durationMinutes !== 'number') {
        return res.status(400).json({ error: 'durationMinutes must be a number' });
      }
      updates.durationMinutes = Math.min(Math.max(updates.durationMinutes, MIN_DURATION_MINUTES), MAX_DURATION_MINUTES);
    }
    if (updates.mcqQuestions != null) {
      const err = validateMcqQuestions(updates.mcqQuestions);
      if (err) return res.status(400).json({ error: err });
      updates.mcqQuestions = normalizeMcqQuestions(updates.mcqQuestions);
    }
    if (updates.codingQuestions != null) {
      const err = validateCodingQuestions(updates.codingQuestions);
      if (err) return res.status(400).json({ error: err });
      updates.codingQuestions = normalizeCodingQuestions(updates.codingQuestions);
    }

    const updated = await updateDocument(collections.ASSESSMENTS, id, updates);

    return res.status(200).json({ message: 'Assessment updated successfully', assessment: updated });

  } catch (error) {
    console.error('Update assessment error:', error);
    return res.status(500).json({ error: 'Failed to update assessment' });
  }
}

// POST /api/professor/assessments/:id/publish
async function publishAssessment(req, res) {
  try {
    const professorId = req.user.uid;
    const { id } = req.params;

    const assessment = await getDocument(collections.ASSESSMENTS, id);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only publish your own assessments' });
    }
    if (!assessment.mcqQuestions?.length && !assessment.codingQuestions?.length) {
      return res.status(400).json({ error: 'Add at least one question before publishing' });
    }

    // Do not let an assessment go active with AI-generated coding questions
    // the professor never test-ran — their expected outputs may be wrong
    // (Groq authored both problem and test cases; no server-side execution
    // exists to self-verify). The review UI sets verified:true only after a
    // known-good solution passes all generated cases (or an explicit,
    // recorded override).
    const unverified = (assessment.codingQuestions || []).filter(q => q.aiGenerated && !q.verified);
    if (unverified.length > 0) {
      return res.status(400).json({
        error: `${unverified.length} AI-generated coding question(s) must be verified (test-run a solution) before publishing.`
      });
    }

    const updated = await updateDocument(collections.ASSESSMENTS, id, { status: 'active' });

    return res.status(200).json({ message: 'Assessment published', assessment: updated });

  } catch (error) {
    console.error('Publish assessment error:', error);
    return res.status(500).json({ error: 'Failed to publish assessment' });
  }
}

// GET /api/professor/assessments
async function getAssessmentsByProfessor(req, res) {
  try {
    const professorId = req.user.uid;
    const assessments = await queryDocuments(collections.ASSESSMENTS, [
      { field: 'professorId', operator: '==', value: professorId }
    ]);
    return res.status(200).json({ count: assessments.length, assessments });
  } catch (error) {
    console.error('Get assessments error:', error);
    return res.status(500).json({ error: 'Failed to fetch assessments' });
  }
}

// GET /api/professor/assessments/:id
async function getAssessmentById(req, res) {
  try {
    const professorId = req.user.uid;
    const { id } = req.params;
    const assessment = await getDocument(collections.ASSESSMENTS, id);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view your own assessments' });
    }
    return res.status(200).json({ assessment });
  } catch (error) {
    console.error('Get assessment error:', error);
    return res.status(500).json({ error: 'Failed to fetch assessment' });
  }
}

// GET /api/student/assessments — only assessments this student has joined
// via code (same enrollment-gate pattern as getAllAssignments).
async function getAssessmentsForStudent(req, res) {
  try {
    const studentId = req.user.uid;

    const enrollments = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);
    const assessmentIds = [...new Set(enrollments.map(e => e.assessmentId).filter(Boolean))];

    if (assessmentIds.length === 0) {
      return res.status(200).json({ count: 0, assessments: [] });
    }

    const assessmentDocs = await Promise.all(
      assessmentIds.map(id => getDocument(collections.ASSESSMENTS, id))
    );

    const submissions = await queryDocuments(collections.ASSESSMENT_SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);
    const submissionByAssessment = {};
    submissions.forEach(s => { submissionByAssessment[s.assessmentId] = s; });

    const sanitized = assessmentDocs.filter(Boolean).map(a => ({
      ...sanitizeForStudent(a),
      attemptStatus: submissionByAssessment[a.id]?.status || null,
      submissionId: submissionByAssessment[a.id]?.id || null
    }));

    return res.status(200).json({ count: sanitized.length, assessments: sanitized });

  } catch (error) {
    console.error('Get student assessments error:', error);
    return res.status(500).json({ error: 'Failed to fetch assessments' });
  }
}

// GET /api/professor/assessments/:id/submissions — professor only,
// ownership-checked. Returns each student's attempt with scores and the
// integrity record (joined inline: the standalone /api/integrity endpoint
// only resolves ownership for assignment submissions, not assessment ones).
async function getAssessmentSubmissions(req, res) {
  try {
    const professorId = req.user.uid;
    const { id } = req.params;

    const assessment = await getDocument(collections.ASSESSMENTS, id);
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    if (assessment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view results for your own assessments' });
    }

    const submissions = await queryDocuments(collections.ASSESSMENT_SUBMISSIONS, [
      { field: 'assessmentId', operator: '==', value: id }
    ]);

    const enriched = await Promise.all(submissions.map(async (s) => {
      const [user, integrity] = await Promise.all([
        getDocument(collections.USERS, s.studentId),
        getDocument(collections.INTEGRITY_SCORES, s.id)
      ]);
      return {
        id: s.id,
        studentName: user?.fullName || user?.email || s.studentId,
        studentEmail: user?.email || null,
        status: s.status,
        startedAt: s.startedAt,
        submittedAt: s.submittedAt,
        mcqScore: s.mcqScore,
        mcqMaxScore: s.mcqMaxScore,
        codingScore: s.codingScore,
        codingMaxScore: s.codingMaxScore,
        totalScore: s.totalScore,
        codingDetails: s.codingDetails || [],
        integrityScore: integrity || null
      };
    }));

    // Completed attempts first, then most-recently-started.
    enriched.sort((a, b) => {
      const ao = a.status === 'in_progress' ? 1 : 0;
      const bo = b.status === 'in_progress' ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return new Date(b.startedAt) - new Date(a.startedAt);
    });

    return res.status(200).json({
      assessmentTitle: assessment.title,
      count: enriched.length,
      submissions: enriched
    });

  } catch (error) {
    console.error('Get assessment submissions error:', error);
    return res.status(500).json({ error: 'Failed to fetch assessment results' });
  }
}

module.exports = {
  createAssessment,
  updateAssessment,
  publishAssessment,
  getAssessmentsByProfessor,
  getAssessmentById,
  getAssessmentsForStudent,
  getAssessmentSubmissions,
  sanitizeForStudent
};
