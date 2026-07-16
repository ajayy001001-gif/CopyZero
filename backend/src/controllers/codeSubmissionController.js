const { createDocument, getDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { calculateFileHash } = require('../utils/fileHandler');

const ALLOWED_LANGUAGES = ['python', 'javascript'];
const MAX_CODE_LEN = 50000;
const MAX_ACTUAL_OUTPUT_LEN = 2000;

// Client-side execution means testResults are self-reported by the browser
// and CANNOT be trusted as the sole grade for hidden test cases — see the
// verificationStatus field below, which the existing AI evaluation pipeline
// cross-checks (testResultPlausibility) before a professor finalizes a score.
function sanitizeTestResults(testResults, testCases) {
  if (!Array.isArray(testResults)) return [];
  const validIds = new Set(testCases.map(tc => tc.testCaseId));
  return testResults
    .filter(r => r && typeof r === 'object' && validIds.has(r.testCaseId))
    .slice(0, testCases.length)
    .map(r => ({
      testCaseId: r.testCaseId,
      passed: !!r.passed,
      actualOutput: typeof r.actualOutput === 'string' ? r.actualOutput.slice(0, MAX_ACTUAL_OUTPUT_LEN) : ''
    }));
}

// POST /api/student/submit-code — student only, enrollment verified.
// Extends the existing `submissions` collection (fileContent holds the
// code) rather than creating a parallel one, so the existing evaluation/
// plagiarism/scores pipeline works on coding submissions unchanged.
async function submitCode(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId, questionId, language, code, testResults } = req.body;

    if (!assignmentId || !questionId || typeof questionId !== 'string') {
      return res.status(400).json({ error: 'assignmentId and questionId are required' });
    }
    if (!ALLOWED_LANGUAGES.includes(language)) {
      return res.status(400).json({ error: 'language must be python or javascript' });
    }
    if (typeof code !== 'string' || !code.trim() || code.length > MAX_CODE_LEN) {
      return res.status(400).json({ error: `code must be a non-empty string under ${MAX_CODE_LEN} chars` });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.status !== 'active') {
      return res.status(400).json({ error: 'Assignment is closed for submissions' });
    }
    if (new Date() > new Date(assignment.dueDate)) {
      return res.status(400).json({ error: 'Assignment deadline has passed' });
    }

    const enrollment = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);
    if (enrollment.length === 0) {
      return res.status(403).json({ error: 'You must join this assignment with a code before submitting' });
    }

    const question = await getDocument(collections.CODING_QUESTIONS, questionId);
    if (!question || question.assignmentId !== assignmentId) {
      return res.status(404).json({ error: 'Coding question not found for this assignment' });
    }
    if (!question.allowedLanguages.includes(language)) {
      return res.status(400).json({ error: `This question does not allow ${language}` });
    }

    const existingSubmissions = await queryDocuments(collections.SUBMISSIONS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'status', operator: '==', value: 'final' }
    ]);
    if (existingSubmissions.length > 0) {
      return res.status(409).json({
        error: 'You have already submitted this assignment',
        submission: existingSubmissions[0]
      });
    }

    const userDoc = await getDocument(collections.USERS, studentId);
    const claimedTestResults = sanitizeTestResults(testResults, question.testCases);
    const fileExt = language === 'python' ? '.py' : '.js';

    const submissionData = {
      assignmentId,
      studentId,
      studentName: userDoc.fullName,
      studentEmail: userDoc.email,
      fileName: `${question.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40) || 'solution'}${fileExt}`,
      fileType: fileExt,
      fileContent: code,
      fileHash: calculateFileHash(code),
      fileSize: Buffer.byteLength(code, 'utf8'),
      submittedAt: new Date().toISOString(),
      status: 'final',
      version: 1,
      isLocked: true,
      submissionKind: 'code',
      questionId,
      language,
      claimedTestResults,
      // Client-reported results are a signal, not a verdict — the
      // professor's evaluation step independently checks plausibility.
      verificationStatus: 'pending_verification',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const submission = await createDocument(collections.SUBMISSIONS, submissionData);

    await logAudit(
      studentId,
      userDoc.fullName,
      'submit',
      'submission',
      submission.id,
      { created: { ...submissionData, fileContent: undefined } }
    );

    return res.status(201).json({
      message: 'Code submitted successfully',
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        fileName: submission.fileName,
        submittedAt: submission.submittedAt,
        status: submission.status,
        verificationStatus: submission.verificationStatus
      }
    });

  } catch (error) {
    console.error('Submit code error:', error);
    return res.status(500).json({ error: 'Failed to submit code' });
  }
}

module.exports = { submitCode };
