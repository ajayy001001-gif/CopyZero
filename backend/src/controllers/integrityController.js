const { getDocument, collections } = require('../services/databaseService');

// GET /api/integrity/:submissionId — professor only, ownership-checked via
// the submission's assignment (same pattern as event timeline access).
async function getIntegrityScore(req, res) {
  try {
    const professorId = req.user.uid;
    const { submissionId } = req.params;

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, submission.assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    if (assignment.professorId !== professorId) {
      return res.status(403).json({ error: 'You can only view integrity scores for your own assignments' });
    }

    const score = await getDocument(collections.INTEGRITY_SCORES, submissionId);
    if (!score) {
      return res.status(404).json({ error: 'No integrity score computed for this submission yet' });
    }

    return res.status(200).json({ integrityScore: score });

  } catch (error) {
    console.error('Get integrity score error:', error);
    return res.status(500).json({ error: 'Failed to fetch integrity score' });
  }
}

module.exports = { getIntegrityScore };
