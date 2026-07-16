# Quick Debug Guide: Assignment Visibility Issue

## Problem
Tests/assignments created by teachers aren't showing up for students.

## Quick Fix (Most Common Solution)

### Run the Debug Script

```bash
cd backend
node debug-assignments.js
```

This will show you:
- ✅ What assignments exist
- ✅ Which ones are "active" (visible to students)
- ✅ User roles (professors vs students)
- ✅ What's wrong and how to fix it

### If Assignments Exist But Have Wrong Status

```bash
cd backend
node fix-assignment-status.js
```

This will automatically set all assignments to `status: "active"`.

## Step-by-Step Debugging

### Step 1: Is the backend running?

```bash
cd backend
npm start
```

You should see: `Server running on port 5000`

### Step 2: Is the frontend running?

```bash
cd frontend
npm run dev
```

You should see: `Local: http://localhost:5173`

### Step 3: Check if assignment was created

1. Log in as teacher
2. Create a test assignment
3. Run the debug script:
   ```bash
   cd backend
   node debug-assignments.js
   ```

### Step 4: Check Firebase directly

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click "Firestore Database"
4. Look for `assignments` collection
5. Click on an assignment document
6. Verify: `status: "active"`

### Step 5: Check student's role

In Firebase Console → Firestore:
1. Go to `users` collection
2. Find the student's document
3. Verify: `role: "student"`

### Step 6: Check browser console

1. Log in as student
2. Press F12 to open Developer Tools
3. Go to "Console" tab
4. Look for any red errors
5. Go to "Network" tab
6. Refresh the page
7. Look for `/api/student/assignments` request
8. Check if it returns data

## Common Issues & Solutions

### Issue 1: "No assignments found"
**Solution:** Teachers need to create assignments first.

### Issue 2: "Assignments exist but none are active"
**Solution:** Run `node fix-assignment-status.js`

### Issue 3: "403 Forbidden" error
**Solution:** 
- Check student email ends with `@vit.ac.in` or `@vitstudent.ac.in`
- Check user has `role: "student"` in Firestore

### Issue 4: "Network Error" or CORS error
**Solution:**
- Make sure backend is running on port 5000
- Check `frontend/.env` has: `VITE_API_URL=http://localhost:5000`

### Issue 5: Backend crashes or errors
**Solution:**
- Check `backend/.env` file exists and has all Firebase credentials
- Verify Firebase credentials are correct

## Test API Manually

### Get Student Token
1. Open browser console (F12) while logged in as student
2. Run: `await firebase.auth().currentUser.getIdToken()`
3. Copy the token

### Test API with curl
```bash
# Replace YOUR_TOKEN with the token from above
curl -X GET http://localhost:5000/api/student/assignments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Should return:
```json
{
  "count": 1,
  "assignments": [
    {
      "id": "...",
      "title": "Test Assignment",
      "status": "active",
      "submitted": false
    }
  ]
}
```

## Still Not Working?

See the full troubleshooting guide: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Or check:
1. Backend terminal logs
2. Browser console errors (F12)
3. Firebase Console (assignments and users collections)
4. Environment variables in `.env` files

## Architecture Note

**Important:** This system shows **ALL active assignments to ALL students**. There's no concept of:
- Classes or sections
- Student groups
- Assignment-to-student mapping

If you need to restrict assignments to specific students, this would require additional development to add:
- Course/section management
- Student enrollment system
- Assignment-to-class mapping
