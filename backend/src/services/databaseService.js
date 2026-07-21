const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

const collections = {
  USERS: 'users',
  ASSIGNMENTS: 'assignments',
  RUBRICS: 'rubrics',
  SUBMISSIONS: 'submissions',
  DRAFTS: 'drafts',
  SCORES: 'scores',
  AUDIT_LOGS: 'auditLogs',
  EVENTS: 'events',
  INTEGRITY_SCORES: 'integrityScores',
  ENROLLMENTS: 'enrollments',
  CODING_QUESTIONS: 'codingQuestions',
  EVIDENCE_CLIPS: 'evidenceClips',
  ASSESSMENTS: 'assessments',
  ASSESSMENT_SUBMISSIONS: 'assessmentSubmissions'
};

async function createDocument(collectionName, data, customId = null) {
  try {
    const collectionRef = db.collection(collectionName);
    
    if (customId) {
      const docRef = collectionRef.doc(customId);
      if (typeof docRef.create === 'function') {
        await docRef.create(data);
      } else {
        const doc = await docRef.get();
        if (doc.exists) {
          const error = new Error('Document already exists');
          error.code = 409;
          error.status = 409;
          throw error;
        }
        await docRef.set(data);
      }
      return { id: customId, ...data };
    } else {
      const docRef = await collectionRef.add(data);
      return { id: docRef.id, ...data };
    }
  } catch (error) {
    if (error.code === 6 || error.code === 409 || error.status === 409 || (error.message && error.message.includes('already exists'))) {
      const conflictErr = new Error('Document already exists');
      conflictErr.code = 409;
      conflictErr.status = 409;
      throw conflictErr;
    }
    throw new Error(`Failed to create document: ${error.message}`);
  }
}

async function getDocument(collectionName, docId) {
  try {
    const docRef = db.collection(collectionName).doc(docId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to get document: ${error.message}`);
  }
}

async function updateDocument(collectionName, docId, data) {
  try {
    const docRef = db.collection(collectionName).doc(docId);
    const updateData = {
      ...data,
      updatedAt: new Date().toISOString()
    };
    
    await docRef.update(updateData);
    return { id: docId, ...updateData };
  } catch (error) {
    throw new Error(`Failed to update document: ${error.message}`);
  }
}

async function deleteDocument(collectionName, docId) {
  try {
    await db.collection(collectionName).doc(docId).delete();
    return { id: docId, deleted: true };
  } catch (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
}

async function queryDocuments(collectionName, filters = []) {
  try {
    let query = db.collection(collectionName);
    
    filters.forEach(filter => {
      const { field, operator, value } = filter;
      query = query.where(field, operator, value);
    });
    
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      return [];
    }
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    throw new Error(`Failed to query documents: ${error.message}`);
  }
}

async function logAudit(userId, userName, action, entityType, entityId, changes = {}) {
  try {
    const auditLog = {
      userId,
      userName,
      action,
      entityType,
      entityId,
      changes,
      timestamp: new Date().toISOString()
    };
    
    await createDocument(collections.AUDIT_LOGS, auditLog);
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}

module.exports = {
  collections,
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  logAudit
};