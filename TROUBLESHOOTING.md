# Troubleshooting: Students Not Seeing Teacher-Created Assignments

## Problem
When teachers create tests/assignments, they don't appear in the student's dashboard.

## Understanding the System Flow

```
Teacher Creates Assignment → Stored in Firestore → Student Queries Active Assignments → Displays All Active Assignments
```

**Important:** This system shows **ALL active assignments to ALL students**. There's no filtering by class, section, or enrollment.

## Step-by-Step Debugging Guide

### 1. Verify Assignment Was Created in Firestore

**Check Firebase Console:**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Navigate to Firestore Database
4. Look for the `assignments` collection
5. Check if the assignment exists with:
   - `status: "active"`
   - Valid `dueDate`
   - Valid `professorId`

**Expected Document Structure:**
```json
{
  "professorId": "abc123...",
  "professorName": "professor@vit.ac.in",
  "title": "Test Assignment",
  "description": "Description here",
  "type": "essay" or "code",
  "status": "active",  // ← CRITICAL: Must be "active"
  "dueDate": "2026-07-20T23:59:59.000Z",
  "plagiarismWeightage": 30,
  "criteriaWeightage": 70,
  "maxScore": 10,
  "createdAt": "2026-07-16T...",
  "updatedAt": "2026-07-16T..."
}
```

### 2. Check Backend API Directly

**Test the Student Assignments Endpoint:**

```bash
# First, get the student's ID token
# (Open browser console while logged in as student)
# Run: await firebase.auth().currentUser.getIdToken()

# Then test the API
curl -X GET http://localhost:5000/api/student/assignments \
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "count": 1,
  "assignments": [
    {
      "id": "assignment_id_here",
      "title": "Test Assignment",
      "status": "active",
      "submitted": false,
      ...
    }
  ]
}
```

### 3. Check User Roles

**Verify the student account has correct role:**

1. Go to Firestore Database
2. Navigate to `users` collection
3. Find the student's document (use their UID)
4. Verify: `role: "student"`

**Expected Student Document:**
```json
{
  "email": "student@vitstudent.ac.in",
  "role": "student",  // ← Must be "student"
  "name": "Student Name",
  "createdAt": "..."
}
```

### 4. Check Browser Console for Errors

**When logged in as student:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for errors related to:
   - API calls failing
   - CORS errors
   - Authorization errors
   - Network errors

**Common Error Messages:**
- `Failed to load assignments` → Backend API error
- `403 Forbidden` → Role/permission error
- `Network Error` → Backend not running or CORS issue
- `401 Unauthorized` → Authentication token issue

### 5. Verify Backend Environment Variables

**Check `/backend/.env`:**
```env
# These must be set correctly
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
PORT=5000
```

**Check `/frontend/.env`:**
```env
VITE_API_URL=http://localhost:5000  # Must match backend URL
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# ... other Firebase config
```

### 6. Check Backend Logs

**Start backend with logging:**
```bash
cd backend
npm start
```

**Watch for these log entries when student loads dashboard:**
- `GET /api/student/assignments`
- Any errors in the console

**When teacher creates assignment:**
- `POST /api/professor/assignments`
- Should see: "Assignment created successfully"

### 7. Test with API Testing Tool

Use the provided `test-api.js` script (see below) or use Postman/Insomnia:

**Test Teacher Create:**
```http
POST http://localhost:5000/api/professor/assignments
Authorization: Bearer TEACHER_TOKEN
Content-Type: application/json

{
  "title": "Debug Test",
  "description": "Testing if assignments appear",
  "type": "essay",
  "dueDate": "2026-08-01T23:59:59.000Z",
  "plagiarismWeightage": 30,
  "criteriaWeightage": 70
}
```

**Test Student Get:**
```http
GET http://localhost:5000/api/student/assignments
Authorization: Bearer STUDENT_TOKEN
```

## Common Issues & Solutions

### Issue 1: Assignments Exist but Students See Empty List

**Cause:** Assignment status might be "closed" instead of "active"

**Solution:**
```javascript
// Update assignment status in Firestore
// Go to Firebase Console → Firestore → assignments → [document]
// Change: status: "closed" → status: "active"
```

### Issue 2: 403 Forbidden Error

**Cause:** Student role not set correctly

**Solution:**
1. Go to Firestore → users collection
2. Find student's document
3. Ensure `role: "student"` (not "professor" or missing)

### Issue 3: CORS or Network Errors

**Cause:** Frontend can't reach backend

**Solution:**
1. Verify backend is running: `cd backend && npm start`
2. Check frontend `.env` has correct `VITE_API_URL`
3. Ensure no firewall blocking localhost:5000

### Issue 4: Token Expired or Invalid

**Cause:** Firebase authentication token expired

**Solution:**
1. Student should log out and log back in
2. Clear browser cache/cookies
3. Check Firebase Console for auth issues

### Issue 5: Email Domain Restriction

**Cause:** Student email not from VIT domain

**Solution:**
Student email must end with:
- `@vit.ac.in` OR
- `@vitstudent.ac.in`

Otherwise they'll get 403 Forbidden

## Quick Diagnostic Checklist

- [ ] Backend server is running on port 5000
- [ ] Frontend is running and connected to correct backend URL
- [ ] Teacher logged in with `@vit.ac.in` email
- [ ] Student logged in with `@vit.ac.in` or `@vitstudent.ac.in` email
- [ ] Assignment created successfully (check Firebase Console)
- [ ] Assignment has `status: "active"` in Firestore
- [ ] Student has `role: "student"` in Firestore users collection
- [ ] Teacher has `role: "professor"` in Firestore users collection
- [ ] No errors in browser console (F12)
- [ ] No errors in backend terminal logs
- [ ] Firebase credentials correctly configured in backend `.env`

## Still Not Working?

If assignments still don't appear after checking all the above:

1. **Restart everything:**
   ```bash
   # Stop backend and frontend
   # Clear browser cache
   # Restart backend
   cd backend && npm start
   # Restart frontend
   cd frontend && npm run dev
   ```

2. **Check Firebase indexes** (if query is slow/failing):
   - Go to Firebase Console → Firestore → Indexes
   - Ensure index exists for: `assignments` collection on `status` field

3. **Enable debug mode** - Run the debug script (next section)

4. **Contact support** with:
   - Screenshots of Firebase Console (assignments collection)
   - Browser console errors
   - Backend terminal logs
   - Results from running the debug script
