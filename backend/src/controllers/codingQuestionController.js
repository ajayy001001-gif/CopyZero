const { createDocument, getDocument, queryDocuments, collections } = require('../services/databaseService');

const ALLOWED_LANGUAGES = ['python', 'javascript'];
const MAX_TEST_CASES = 20;
const MIN_TEST_CASES = 1;
const MAX_FIELD_LEN = 2000;
const MAX_TIME_LIMIT_MS = 10000;
const MIN_TIME_LIMIT_MS = 1000;

function validateTestCases(testCases) {
  if (!Array.isArray(testCases) || testCases.length < MIN_TEST_CASES || testCases.length > MAX_TEST_CASES) {
    return `testCases must be an array of ${MIN_TEST_CASES}-${MAX_TEST_CASES} entries`;
  }
  for (const [i, tc] of testCases.entries()) {
    if (!tc || typeof tc !== 'object') return `testCases[${i}] is invalid`;
    if (typeof tc.input !== 'string' || tc.input.length > MAX_FIELD_LEN) {
      return `testCases[${i}].input must be a string under ${MAX_FIELD_LEN} chars`;
    }
    if (typeof tc.expectedOutput !== 'string' || tc.expectedOutput.length > MAX_FIELD_LEN) {
      return `testCases[${i}].expectedOutput must be a string under ${MAX_FIELD_LEN} chars`;
    }
    if (typeof tc.points !== 'number' || tc.points < 0 || tc.points > 1000) {
      return `testCases[${i}].points must be a number between 0 and 1000`;
    }
  }
  return null;
}

// POST /api/professor/coding-questions — professor only, ownership tied to
// the assignment they're attaching the question to.
async function createCodingQuestion(req, res) {
  try {
    const professorId = req.user.uid;
    const {
      assignmentId, title, description, starterCode,
      testCases, timeLimitMs, allowedLanguages
    } = req.body;

    if (!assignmentId || typeof assignmentId !== 'string') {
      return res.status(400).json({ error: 'assignmentId is required' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only add questions to your own assignments' });
    }

    const testCaseError = validateTestCases(testCases);
    if (testCaseError) {
      return res.status(400).json({ error: testCaseError });
    }

    const languages = Array.isArray(allowedLanguages) && allowedLanguages.length
      ? allowedLanguages.filter(l => ALLOWED_LANGUAGES.includes(l))
      : ALLOWED_LANGUAGES.slice();
    if (languages.length === 0) {
      return res.status(400).json({ error: 'allowedLanguages must include at least one of: python, javascript' });
    }

    const limitMs = typeof timeLimitMs === 'number'
      ? Math.min(Math.max(timeLimitMs, MIN_TIME_LIMIT_MS), MAX_TIME_LIMIT_MS)
      : 5000;

    const starter = {
      python: typeof starterCode?.python === 'string' ? starterCode.python.slice(0, MAX_FIELD_LEN) : '',
      javascript: typeof starterCode?.javascript === 'string' ? starterCode.javascript.slice(0, MAX_FIELD_LEN) : ''
    };

    const questionData = {
      assignmentId,
      professorId,
      title: title.trim().slice(0, 200),
      description: typeof description === 'string' ? description.slice(0, MAX_FIELD_LEN) : '',
      starterCode: starter,
      testCases: testCases.map((tc, i) => ({
        testCaseId: `tc_${i}`,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isHidden: !!tc.isHidden,
        points: tc.points
      })),
      timeLimitMs: limitMs,
      allowedLanguages: languages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const question = await createDocument(collections.CODING_QUESTIONS, questionData);

    return res.status(201).json({
      message: 'Coding question created successfully',
      question
    });

  } catch (error) {
    console.error('Create coding question error:', error);
    return res.status(500).json({ error: 'Failed to create coding question' });
  }
}

// GET /api/student/coding-questions/:assignmentId — enrolled students only.
// Hidden test cases are stripped of expectedOutput so students can't
// hardcode outputs to pass hidden grading cases.
async function getCodingQuestionsForStudent(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId } = req.params;

    const enrollment = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);
    if (enrollment.length === 0) {
      return res.status(403).json({ error: 'You must join this assignment with a code first' });
    }

    const questions = await queryDocuments(collections.CODING_QUESTIONS, [
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);

    const sanitized = questions.map(q => ({
      id: q.id,
      assignmentId: q.assignmentId,
      title: q.title,
      description: q.description,
      starterCode: q.starterCode,
      timeLimitMs: q.timeLimitMs,
      allowedLanguages: q.allowedLanguages,
      testCases: q.testCases.map(tc => ({
        testCaseId: tc.testCaseId,
        isHidden: tc.isHidden,
        points: tc.points,
        // Hidden cases: input only, never the expected answer.
        input: tc.input,
        expectedOutput: tc.isHidden ? undefined : tc.expectedOutput
      }))
    }));

    return res.status(200).json({ count: sanitized.length, questions: sanitized });

  } catch (error) {
    console.error('Get coding questions error:', error);
    return res.status(500).json({ error: 'Failed to fetch coding questions' });
  }
}

module.exports = { createCodingQuestion, getCodingQuestionsForStudent };
