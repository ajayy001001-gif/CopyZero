const admin = require('firebase-admin');
const path = require('path');

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

let firebaseApp;

try {
  let serviceAccount;
  let credentialSource;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      // Render (and most env var stores) can't hold literal newlines, so the
      // key is stored with escaped \n sequences and unescaped here.
      private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
    credentialSource = 'environment variables (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)';
  } else {
    const serviceAccountPath = path.join(__dirname, '../../firebase-service-account.json');
    serviceAccount = require(serviceAccountPath);
    credentialSource = 'local firebase-service-account.json file';
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });

  console.log('✅ Firebase Admin initialized successfully');
  console.log(`🔑 Credentials loaded from: ${credentialSource}`);
  console.log(`📁 Project: ${serviceAccount.project_id}`);
  console.log('📦 Using Firestore for file storage (no Storage bucket needed)');
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error.message);
  console.error('Set FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars, or place firebase-service-account.json in the backend folder');
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

db.settings({
  ignoreUndefinedProperties: true,
  timestampsInSnapshots: true
});

module.exports = {
  admin,
  db,
  auth
};
