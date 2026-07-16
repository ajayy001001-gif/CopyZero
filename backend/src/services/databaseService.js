const { db } = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');

const collections = {
  USERS: 'users',
  ASSIGNMENTS: 'assignments',
  RUBRICS: 'rubrics',
  SUBMISSIONS: 'submissions',
  DRAFTS: 'drafts',
  SCORES: 'scores',
  AUDIT_LOGS: 'auditLogs'
};

async function createDocument(collectionName, data, customId = null) {
  try {
    const collectionRef = db.collection(collectionName);
    
    if (customId) {
      await collectionRef.doc(customId).set(data);
      return { id: customId, ...data };
    } else {
      const docRef = await collectionRef.add(data);
      return { id: docRef.id, ...data };
    }
  } catch (error) {
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