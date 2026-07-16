# Firebase Setup Documentation

## Project Information
- **Project Name:** vit-academic-integrity
- **Project ID:** [Your Firebase Project ID from console]
- **Region:** asia-south1 (Mumbai)

## Services Enabled
- ✅ Authentication (Email/Password)
- ✅ Firestore Database
- ❌ Firebase Storage (SKIPPED - using Firestore for file storage instead)

## Why No Firebase Storage?
Firebase Storage requires Blaze (paid) plan. Instead, we're using:
- **Firestore documents** to store file contents (base64 encoded)
- Works perfectly for text submissions (essays, code files)
- Completely free within Firestore quotas
- Simpler implementation for hackathon

## File Storage Strategy
- Essays/Code submissions stored as text in Firestore `submissions` collection
- File size limit: ~1MB (sufficient for text documents)
- Drafts auto-saved to `drafts` collection
- Professor can view all submissions directly from Firestore

## Web App Configuration
Located in Firebase Console → Project Settings → Your apps
```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",  // Not used, but still in config
  messagingSenderId: "...",
  appId: "..."
};
```

## Security Rules

### Firestore Rules
- Only VIT email domains allowed (@vit.ac.in, @vitstudent.ac.in)
- Role-based access (professors and students)
- Students can only modify their own non-final submissions
- Only professors can create assignments and assign scores
- Audit logs track all submission changes

### Collections Structure
1. **users** - User profiles with roles
2. **assignments** - Professor-created assignments
3. **rubrics** - Evaluation criteria per assignment
4. **submissions** - Final student submissions (with file content)
5. **drafts** - Auto-saved work (with timestamps)
6. **scores** - Evaluation results
7. **auditLogs** - Change tracking for integrity

## Service Account
- **Location:** `backend/firebase-service-account.json`
- **Status:** ⚠️ NOT COMMITTED TO GIT (in .gitignore)
- **Usage:** Backend Firebase Admin SDK

## Email Domain Restrictions
Allowed domains:
- @vit.ac.in (faculty/staff)
- @vitstudent.ac.in (students)

## Firestore Quotas (Free Tier)
- **Stored data:** 1 GB
- **Document reads:** 50,000/day
- **Document writes:** 20,000/day
- **Document deletes:** 20,000/day

This is more than enough for a hackathon demo!

## Next Steps
- [ ] Initialize frontend with React + Vite
- [ ] Implement authentication flows
- [ ] Create database schema
- [ ] Build API endpoints