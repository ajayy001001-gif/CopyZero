const crypto = require('crypto');
const { createDocument, getDocument, updateDocument, deleteDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { validateAssignment } = require('../services/validationService');

// 6 uppercase hex chars, 16^6 ≈ 16.7M possibilities — not brute-forceable at
// the rate-limited attempt rate the join endpoint allows. crypto.randomBytes
// is used (not Math.random) so codes aren't predictable.
async function generateUniqueAssignmentCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const existing = await queryDocuments(collections.ASSIGNMENTS, [
      { field: 'assignmentCode', operator: '==', value: code }
    ]);
    if (existing.length === 0) return code;
  }
  throw new Error('Failed to generate a unique assignment code');
}

async function createAssignment(req, res) {
  try {
    const professorId = req.user.uid;
    const { title, description, type, allowedFileTypes, dueDate, plagiarismWeightage, criteriaWeightage } = req.body;

    const assignmentCode = await generateUniqueAssignmentCode();

    const assignmentData = {
      professorId,
      professorName: req.user.name || req.user.email,
      title,
      description,
      type,
      allowedFileTypes: allowedFileTypes || ['.txt', '.pdf', '.docx'],
      dueDate,
      maxScore: 10,
      plagiarismWeightage: plagiarismWeightage || 30,
      criteriaWeightage: criteriaWeightage || 70,
      status: 'active',
      assignmentCode,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const validation = validateAssignment(assignmentData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const assignment = await createDocument(collections.ASSIGNMENTS, assignmentData);

    await logAudit(
      professorId,
      assignmentData.professorName,
      'create',
      'assignment',
      assignment.id,
      { created: assignmentData }
    );

    return res.status(201).json({
      message: 'Assignment created successfully',
      assignment
    });

  } catch (error) {
    console.error('Create assignment error:', error);
    return res.status(500).json({
      error: 'Failed to create assignment',
    });
  }
}

async function getAssignmentsByProfessor(req, res) {
  try {
    const professorId = req.user.uid;

    const assignments = await queryDocuments(collections.ASSIGNMENTS, [
      { field: 'professorId', operator: '==', value: professorId }
    ]);

    // Dynamically calculate submissionCount for each assignment
    const enrichedAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const subs = await queryDocuments(collections.SUBMISSIONS, [
          { field: 'assignmentId', operator: '==', value: assignment.id }
        ]);
        return {
          ...assignment,
          submissionCount: subs.length
        };
      })
    );

    return res.status(200).json({
      count: enrichedAssignments.length,
      assignments: enrichedAssignments
    });

  } catch (error) {
    console.error('Get assignments error:', error);
    return res.status(500).json({
      error: 'Failed to fetch assignments',
    });
  }
}

async function getAllAssignments(req, res) {
  try {
    const studentId = req.user.uid;

    // Only assignments this student has explicitly joined via a code are
    // visible — never return every assignment in the system.
    const enrollments = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    if (enrollments.length === 0) {
      return res.status(200).json({ count: 0, assignments: [] });
    }

    const enrolledAssignmentIds = new Set(enrollments.map(e => e.assignmentId));
    const assignmentDocs = await Promise.all(
      [...enrolledAssignmentIds].map(id => getDocument(collections.ASSIGNMENTS, id))
    );
    const assignments = assignmentDocs.filter(Boolean);

    const submissions = await queryDocuments(collections.SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    const submissionMap = {};
    submissions.forEach(sub => {
      submissionMap[sub.assignmentId] = sub;
    });

    const enrichedAssignments = assignments.map(assignment => {
      const sub = submissionMap[assignment.id];
      if (sub) {
        return { ...assignment, submitted: true, score: sub.score };
      }
      return { ...assignment, submitted: false };
    });

    return res.status(200).json({
      count: enrichedAssignments.length,
      assignments: enrichedAssignments
    });

  } catch (error) {
    console.error('Get all assignments error:', error);
    return res.status(500).json({
      error: 'Failed to fetch assignments',
    });
  }
}

async function getAssignmentById(req, res) {
  try {
    const { assignmentId } = req.params;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    // Professors may only view their own assignments here; students can view
    // any active assignment (this route is shared by both roles).
    if (req.userRole === 'professor' && assignment.professorId !== req.user.uid) {
      return res.status(403).json({
        error: 'You can only view your own assignments'
      });
    }

    return res.status(200).json({
      assignment
    });

  } catch (error) {
    console.error('Get assignment error:', error);
    return res.status(500).json({
      error: 'Failed to fetch assignment',
    });
  }
}

async function updateAssignment(req, res) {
  try {
    const professorId = req.user.uid;
    const { assignmentId } = req.params;

    const UPDATABLE_FIELDS = [
      'title',
      'description',
      'dueDate',
      'allowedFileTypes',
      'plagiarismWeightage',
      'criteriaWeightage'
    ];
    const updates = {};
    for (const field of UPDATABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only update your own assignments'
      });
    }

    if (updates.plagiarismWeightage && updates.criteriaWeightage) {
      if (updates.plagiarismWeightage + updates.criteriaWeightage !== 100) {
        return res.status(400).json({
          error: 'Weightages must sum to 100'
        });
      }
    }

    const updated = await updateDocument(collections.ASSIGNMENTS, assignmentId, updates);

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'update',
      'assignment',
      assignmentId,
      { before: assignment, after: updated }
    );

    return res.status(200).json({
      message: 'Assignment updated successfully',
      assignment: updated
    });

  } catch (error) {
    console.error('Update assignment error:', error);
    return res.status(500).json({
      error: 'Failed to update assignment',
    });
  }
}

async function deleteAssignment(req, res) {
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
        error: 'You can only delete your own assignments'
      });
    }

    await deleteDocument(collections.ASSIGNMENTS, assignmentId);

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'delete',
      'assignment',
      assignmentId,
      { deleted: assignment }
    );

    return res.status(200).json({
      message: 'Assignment deleted successfully'
    });

  } catch (error) {
    console.error('Delete assignment error:', error);
    return res.status(500).json({
      error: 'Failed to delete assignment',
    });
  }
}

async function closeAssignment(req, res) {
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
        error: 'You can only close your own assignments'
      });
    }

    const updated = await updateDocument(collections.ASSIGNMENTS, assignmentId, {
      status: 'closed'
    });

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'update',
      'assignment',
      assignmentId,
      { status: { before: 'active', after: 'closed' } }
    );

    return res.status(200).json({
      message: 'Assignment closed successfully',
      assignment: updated
    });

  } catch (error) {
    console.error('Close assignment error:', error);
    return res.status(500).json({
      error: 'Failed to close assignment',
    });
  }
}

module.exports = {
  createAssignment,
  getAssignmentsByProfessor,
  getAllAssignments,
  getAssignmentById,
  updateAssignment,
  deleteAssignment,
  closeAssignment
};