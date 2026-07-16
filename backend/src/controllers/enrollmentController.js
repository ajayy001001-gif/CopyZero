const { createDocument, queryDocuments, collections } = require('../services/databaseService');

// POST /api/student/join — student only. studentId always comes from
// req.user.uid, never req.body, so a student can't enroll someone else.
async function joinAssignment(req, res) {
  try {
    const studentId = req.user.uid;
    const { code } = req.body;

    if (!code || typeof code !== 'string' || !/^[A-F0-9]{6}$/.test(code.trim().toUpperCase())) {
      return res.status(400).json({ error: 'Invalid code format' });
    }

    const normalizedCode = code.trim().toUpperCase();

    const matches = await queryDocuments(collections.ASSIGNMENTS, [
      { field: 'assignmentCode', operator: '==', value: normalizedCode }
    ]);

    // Same generic message whether the code doesn't exist or the assignment
    // is closed — don't help an attacker distinguish valid-but-closed codes
    // from nonexistent ones.
    if (matches.length === 0 || matches[0].status !== 'active') {
      return res.status(404).json({ error: 'Invalid or expired code' });
    }

    const assignment = matches[0];

    const existingEnrollment = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assignmentId', operator: '==', value: assignment.id }
    ]);

    if (existingEnrollment.length === 0) {
      await createDocument(collections.ENROLLMENTS, {
        studentId,
        assignmentId: assignment.id,
        professorId: assignment.professorId,
        enrolledAt: new Date().toISOString(),
        enrolledBy: 'self'
      });
    }

    return res.status(200).json({
      message: 'Joined assignment successfully',
      assignment: {
        id: assignment.id,
        title: assignment.title,
        dueDate: assignment.dueDate,
        description: assignment.description
      }
    });

  } catch (error) {
    console.error('Join assignment error:', error);
    return res.status(500).json({ error: 'Failed to join assignment' });
  }
}

module.exports = { joinAssignment };
