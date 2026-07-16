const { createDocument, getDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { calculateFileHash } = require('../utils/fileHandler');

async function saveDraft(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId, content, autoSave } = req.body;

    if (!assignmentId || !content) {
      return res.status(400).json({
        error: 'Assignment ID and content are required'
      });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    const userDoc = await getDocument(collections.USERS, studentId);

    const existingDrafts = await queryDocuments(collections.DRAFTS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    const version = existingDrafts.length + 1;
    const contentHash = calculateFileHash(content);

    const draftData = {
      assignmentId,
      studentId,
      studentName: userDoc.fullName,
      content,
      contentHash,
      savedAt: new Date().toISOString(),
      autoSave: autoSave || false,
      version
    };

    const draft = await createDocument(collections.DRAFTS, draftData);

    await logAudit(
      studentId,
      userDoc.fullName,
      'create',
      'draft',
      draft.id,
      { version, autoSave: autoSave || false }
    );

    return res.status(201).json({
      message: 'Draft saved successfully',
      draft: {
        id: draft.id,
        version: draft.version,
        savedAt: draft.savedAt,
        contentHash: draft.contentHash
      }
    });

  } catch (error) {
    console.error('Save draft error:', error);
    return res.status(500).json({
      error: 'Failed to save draft',
    });
  }
}

async function getDraftsByAssignment(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId } = req.params;

    const drafts = await queryDocuments(collections.DRAFTS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    return res.status(200).json({
      count: drafts.length,
      drafts: drafts.map(draft => ({
        id: draft.id,
        version: draft.version,
        savedAt: draft.savedAt,
        autoSave: draft.autoSave,
        contentHash: draft.contentHash
      }))
    });

  } catch (error) {
    console.error('Get drafts error:', error);
    return res.status(500).json({
      error: 'Failed to fetch drafts',
    });
  }
}

async function getLatestDraft(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId } = req.params;

    const drafts = await queryDocuments(collections.DRAFTS, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    if (drafts.length === 0) {
      return res.status(404).json({
        error: 'No drafts found for this assignment'
      });
    }

    const latestDraft = drafts.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))[0];

    return res.status(200).json({
      draft: latestDraft
    });

  } catch (error) {
    console.error('Get latest draft error:', error);
    return res.status(500).json({
      error: 'Failed to fetch latest draft',
    });
  }
}

async function getAllMyDrafts(req, res) {
  try {
    const studentId = req.user.uid;

    const drafts = await queryDocuments(collections.DRAFTS, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    return res.status(200).json({
      count: drafts.length,
      drafts: drafts.map(draft => ({
        id: draft.id,
        assignmentId: draft.assignmentId,
        version: draft.version,
        savedAt: draft.savedAt,
        autoSave: draft.autoSave,
        contentHash: draft.contentHash
      }))
    });

  } catch (error) {
    console.error('Get all drafts error:', error);
    return res.status(500).json({
      error: 'Failed to fetch drafts',
    });
  }
}

module.exports = {
  saveDraft,
  getDraftsByAssignment,
  getLatestDraft,
  getAllMyDrafts
};
