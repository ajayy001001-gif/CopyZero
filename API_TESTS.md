# API Testing Guide

## Base URL
http://localhost:5000

## Authentication Endpoints

### 1. Signup Professor
POST /api/auth/signup
Content-Type: application/json

{
  "email": "professor@vit.ac.in",
  "password": "professor123",
  "fullName": "Dr. Kumar",
  "role": "professor"
}

### 2. Signup Student
POST /api/auth/signup
Content-Type: application/json

{
  "email": "student@vitstudent.ac.in",
  "password": "student123",
  "fullName": "Rahul Sharma",
  "role": "student"
}

### 3. Login
POST /api/auth/login
Content-Type: application/json

{
  "email": "student@vitstudent.ac.in",
  "password": "student123"
}

### 4. Get Profile
GET /api/auth/profile
Authorization: Bearer YOUR_TOKEN

### 5. Update Profile
PUT /api/auth/profile
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "fullName": "Updated Name"
}

## Professor Endpoints

### 6. Create Assignment
POST /api/professor/assignments
Authorization: Bearer PROFESSOR_TOKEN
Content-Type: application/json

{
  "title": "Data Structures Essay",
  "description": "Write about binary trees",
  "type": "essay",
  "allowedFileTypes": [".txt", ".pdf", ".docx"],
  "dueDate": "2025-02-15T23:59:59.000Z",
  "plagiarismWeightage": 30,
  "criteriaWeightage": 70
}

### 7. Get My Assignments (Professor)
GET /api/professor/assignments
Authorization: Bearer PROFESSOR_TOKEN

### 8. Create Rubric
POST /api/professor/rubrics
Authorization: Bearer PROFESSOR_TOKEN
Content-Type: application/json

{
  "assignmentId": "ASSIGNMENT_ID",
  "criteria": [
    {
      "name": "Content Quality",
      "description": "Depth and accuracy",
      "maxPoints": 40
    },
    {
      "name": "Structure",
      "description": "Organization",
      "maxPoints": 30
    },
    {
      "name": "References",
      "description": "Citations",
      "maxPoints": 30
    }
  ]
}

### 9. Get Rubric
GET /api/professor/rubrics/assignment/:assignmentId
Authorization: Bearer PROFESSOR_TOKEN

### 10. Get Submissions
GET /api/professor/submissions/assignment/:assignmentId
Authorization: Bearer PROFESSOR_TOKEN

### 11. Evaluate Submission
POST /api/professor/evaluate
Authorization: Bearer PROFESSOR_TOKEN
Content-Type: application/json

{
  "submissionId": "SUBMISSION_ID",
  "plagiarismScore": 85,
  "criteriaScores": [
    {
      "criterionId": "crit_1",
      "name": "Content Quality",
      "points": 35,
      "maxPoints": 40
    },
    {
      "criterionId": "crit_2",
      "name": "Structure",
      "points": 28,
      "maxPoints": 30
    },
    {
      "criterionId": "crit_3",
      "name": "References",
      "points": 25,
      "maxPoints": 30
    }
  ],
  "feedback": "Excellent work"
}

### 12. Override Score
PATCH /api/professor/scores/:scoreId/override
Authorization: Bearer PROFESSOR_TOKEN
Content-Type: application/json

{
  "newFinalScore": 9.5,
  "overrideReason": "Exceptional effort"
}

### 13. Get Scores
GET /api/professor/scores/assignment/:assignmentId
Authorization: Bearer PROFESSOR_TOKEN

## Student Endpoints

### 14. Get All Assignments (Student)
GET /api/student/assignments
Authorization: Bearer STUDENT_TOKEN

### 15. Get Assignment Details
GET /api/student/assignments/:assignmentId
Authorization: Bearer STUDENT_TOKEN

### 16. Save Draft
POST /api/student/drafts
Authorization: Bearer STUDENT_TOKEN
Content-Type: application/json

{
  "assignmentId": "ASSIGNMENT_ID",
  "content": "This is my draft work on binary trees...",
  "autoSave": true
}

### 17. Get All My Drafts
GET /api/student/drafts
Authorization: Bearer STUDENT_TOKEN

### 18. Get Drafts for Assignment
GET /api/student/drafts/assignment/:assignmentId
Authorization: Bearer STUDENT_TOKEN

### 19. Get Latest Draft
GET /api/student/drafts/assignment/:assignmentId/latest
Authorization: Bearer STUDENT_TOKEN

### 20. Submit Assignment
POST /api/student/submit
Authorization: Bearer STUDENT_TOKEN
Content-Type: application/json

{
  "assignmentId": "ASSIGNMENT_ID",
  "fileName": "binary_trees.txt",
  "fileContent": "Binary trees are hierarchical data structures...",
  "fileType": ".txt"
}

### 21. Get My Submissions
GET /api/student/submissions
Authorization: Bearer STUDENT_TOKEN

### 22. Get Submission by ID
GET /api/student/submissions/:submissionId
Authorization: Bearer STUDENT_TOKEN

### 23. Get Submission for Assignment
GET /api/student/submissions/assignment/:assignmentId
Authorization: Bearer STUDENT_TOKEN

### 24. Get My Scores
GET /api/student/scores
Authorization: Bearer STUDENT_TOKEN

### 25. Get Score for Assignment
GET /api/student/scores/assignment/:assignmentId
Authorization: Bearer STUDENT_TOKEN

### 26. Get Score by ID
GET /api/student/scores/:scoreId
Authorization: Bearer STUDENT_TOKEN

## Valid Email Domains
- @vit.ac.in (professors)
- @vitstudent.ac.in (students)

## Valid Roles
- professor
- student

## Notes
- All protected routes require Bearer token in Authorization header
- Tokens obtained after login via Firebase Authentication
- Students can only view/modify their own data
- Professors can only manage their own assignments
- Drafts are for integrity tracking only (not evaluated)
- Only final submissions are evaluated