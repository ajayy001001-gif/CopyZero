const crypto = require('crypto');
const { queryDocuments } = require('../services/databaseService');

// Same algorithm as assignmentController.js's generateUniqueAssignmentCode
// (6 uppercase hex chars via crypto.randomBytes, 16^6 ≈ 16.7M possibilities),
// extracted here so new join-code features (assessments) can reuse it
// without touching the existing, working assignment code path.
async function generateUniqueCode(collectionName, codeField) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const existing = await queryDocuments(collectionName, [
      { field: codeField, operator: '==', value: code }
    ]);
    if (existing.length === 0) return code;
  }
  throw new Error(`Failed to generate a unique code for ${collectionName}.${codeField}`);
}

module.exports = { generateUniqueCode };
