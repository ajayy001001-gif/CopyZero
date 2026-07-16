const { createDocument, getDocument, updateDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { validateSubmission } = require('../services/validationService');
const { validateFileSize, validateFileType, calculateFileHash } = require('../utils/fileHandler');

async function submitAssignment(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId, fileName, fileContent, fileType, submissionType, blockchainTxHash } = req.body;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.status !== 'active') {
      return res.status(400).json({
        error: 'Assignment is closed for submissions'
      });
    }

    const enrollment = await queryDocuments(collections.ENROLLMENTS, [
      { field: 'studentId', operator: '==', value: studentId },
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);

    if (enrollment.length === 0) {
      return res.status(403).json({
        error: 'You must join this assignment with a code before submitting'
      });
    }

    const dueDate = new Date(assignment.dueDate);
    const now = new Date();
    
    if (now > dueDate) {
      return res.status(400).json({
        error: 'Assignment deadline has passed'
      });
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

    const submissionData = {
      assignmentId,
      studentId,
      studentName: userDoc.fullName,
      studentEmail: userDoc.email,
      fileName,
      fileType: fileType || fileName.substring(fileName.lastIndexOf('.')),
      fileContent,
      fileHash: calculateFileHash(fileContent),
      fileSize: Buffer.byteLength(fileContent, 'utf8'),
      submittedAt: new Date().toISOString(),
      status: 'final',
      version: 1,
      isLocked: true,
      submissionType: submissionType || 'direct',
      blockchainTxHash: blockchainTxHash || null,
      blockchainVerified: submissionType === 'blockchain' && blockchainTxHash ? true : false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const validation = validateSubmission(submissionData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const sizeValidation = validateFileSize(Buffer.from(fileContent).toString('base64'));
    if (!sizeValidation.valid) {
      return res.status(400).json({
        error: sizeValidation.message
      });
    }

    const typeValidation = validateFileType(fileName, assignment.allowedFileTypes);
    if (!typeValidation.valid) {
      return res.status(400).json({
        error: typeValidation.message
      });
    }

    const submission = await createDocument(collections.SUBMISSIONS, submissionData);

    await logAudit(
      studentId,
      userDoc.fullName,
      'submit',
      'submission',
      submission.id,
      { 
        created: submissionData,
        submissionMethod: submissionType || 'direct',
        blockchainHash: blockchainTxHash || 'N/A'
      }
    );

    return res.status(201).json({
      message: `Assignment submitted successfully via ${submissionType === 'blockchain' ? 'blockchain' : 'direct submission'}`,
      submission: {
        id: submission.id,
        assignmentId: submission.assignmentId,
        fileName: submission.fileName,
        submittedAt: submission.submittedAt,
        status: submission.status,
        submissionType: submission.submissionType,
        blockchainVerified: submission.blockchainVerified
      }
    });

  } catch (error) {
    console.error('Submit assignment error:', error);
    return res.status(500).json({
      error: 'Failed to submit assignment',
    });
  }
}

async function getMySubmissions(req, res) {
  try {
    const studentId = req.user.uid;

    const submissions = await queryDocuments(collections.SUBMISSIONS, [
      { field: 'studentId', operator: '==', value: studentId }
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

async function getSubmissionById(req, res) {
  try {
    const studentId = req.user.uid;
    const { submissionId } = req.params;

    const submission = await getDocument(collections.SUBMISSIONS, submissionId);

    if (!submission) {
      return res.status(404).json({
        error: 'Submission not found'
      });
    }

    if (submission.studentId !== studentId) {
      return res.status(403).json({
        error: 'You can only view your own submissions'
      });
    }

    return res.status(200).json({
      submission
    });

  } catch (error) {
    console.error('Get submission error:', error);
    return res.status(500).json({
      error: 'Failed to fetch submission',
    });
  }
}

async function getSubmissionByAssignment(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId } = req.params;

    const submissions = await queryDocuments(collections.SUBMISSIONS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    if (submissions.length === 0) {
      return res.status(404).json({
        error: 'No submission found for this assignment'
      });
    }

    return res.status(200).json({
      submission: submissions[0]
    });

  } catch (error) {
    console.error('Get submission by assignment error:', error);
    return res.status(500).json({
      error: 'Failed to fetch submission',
    });
  }
}

module.exports = {
  submitAssignment,
  getMySubmissions,
  getSubmissionById,
  getSubmissionByAssignment
};
