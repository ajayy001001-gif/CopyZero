# Database Schema Documentation

## Collections Overview

1. users - User profiles and roles
2. assignments - Professor-created assignments
3. rubrics - Evaluation criteria per assignment
4. submissions - Final student submissions
5. drafts - Auto-saved student work
6. scores - Evaluation results
7. auditLogs - Change tracking for integrity

---

## 1. USERS Collection

**Path:** /users/{userId}

**Document ID:** Firebase Auth UID

**Fields:**
- uid: string (Firebase Auth UID)
- email: string (VIT email)
- fullName: string
- role: string (student | professor)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

**Example:**
{
  "uid": "abc123",
  "email": "student@vitstudent.ac.in",
  "fullName": "Rahul Sharma",
  "role": "student",
  "createdAt": "2025-02-06T10:00:00.000Z",
  "updatedAt": "2025-02-06T10:00:00.000Z"
}

**Indexes:**
- email (for lookups)
- role (for filtering)

---

## 2. ASSIGNMENTS Collection

**Path:** /assignments/{assignmentId}

**Document ID:** Auto-generated

**Fields:**
- assignmentId: string (auto-generated)
- professorId: string (creator UID)
- professorName: string
- title: string
- description: string
- type: string (essay | code)
- allowedFileTypes: array of strings
- dueDate: string (ISO timestamp)
- maxScore: number (default 10)
- plagiarismWeightage: number (0-100, percentage)
- criteriaWeightage: number (0-100, percentage)
- status: string (active | closed)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

**Example:**
{
  "assignmentId": "assign_001",
  "professorId": "prof_abc",
  "professorName": "Dr. Kumar",
  "title": "Data Structures Essay",
  "description": "Write about binary trees",
  "type": "essay",
  "allowedFileTypes": [".txt", ".pdf", ".docx"],
  "dueDate": "2025-02-15T23:59:59.000Z",
  "maxScore": 10,
  "plagiarismWeightage": 30,
  "criteriaWeightage": 70,
  "status": "active",
  "createdAt": "2025-02-06T10:00:00.000Z",
  "updatedAt": "2025-02-06T10:00:00.000Z"
}

**Validation:**
- plagiarismWeightage + criteriaWeightage must equal 100

**Indexes:**
- professorId
- status
- dueDate

---

## 3. RUBRICS Collection

**Path:** /rubrics/{rubricId}

**Document ID:** Auto-generated

**Fields:**
- rubricId: string (auto-generated)
- assignmentId: string (foreign key)
- criteria: array of objects
  - criterionId: string
  - name: string
  - description: string
  - maxPoints: number
- totalPoints: number (sum of all criteria maxPoints)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

**Example:**
{
  "rubricId": "rubric_001",
  "assignmentId": "assign_001",
  "criteria": [
    {
      "criterionId": "crit_1",
      "name": "Content Quality",
      "description": "Depth and accuracy of content",
      "maxPoints": 40
    },
    {
      "criterionId": "crit_2",
      "name": "Structure",
      "description": "Organization and flow",
      "maxPoints": 30
    },
    {
      "criterionId": "crit_3",
      "name": "References",
      "description": "Proper citations",
      "maxPoints": 30
    }
  ],
  "totalPoints": 100,
  "createdAt": "2025-02-06T10:00:00.000Z",
  "updatedAt": "2025-02-06T10:00:00.000Z"
}

**Indexes:**
- assignmentId

---

## 4. SUBMISSIONS Collection

**Path:** /submissions/{submissionId}

**Document ID:** Auto-generated

**Fields:**
- submissionId: string (auto-generated)
- assignmentId: string (foreign key)
- studentId: string (user UID)
- studentName: string
- studentEmail: string
- fileName: string
- fileType: string
- fileContent: string (base64 or text)
- fileHash: string (SHA-256)
- fileSize: number (bytes)
- submittedAt: string (ISO timestamp)
- status: string (draft | final)
- version: number (increments with each save)
- isLocked: boolean (true when final)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

**Example:**
{
  "submissionId": "sub_001",
  "assignmentId": "assign_001",
  "studentId": "student_abc",
  "studentName": "Rahul Sharma",
  "studentEmail": "rahul@vitstudent.ac.in",
  "fileName": "binary_trees_essay.txt",
  "fileType": ".txt",
  "fileContent": "Binary trees are...",
  "fileHash": "a1b2c3d4e5f6...",
  "fileSize": 5120,
  "submittedAt": "2025-02-10T15:30:00.000Z",
  "status": "final",
  "version": 1,
  "isLocked": true,
  "createdAt": "2025-02-10T15:30:00.000Z",
  "updatedAt": "2025-02-10T15:30:00.000Z"
}

**Indexes:**
- assignmentId + studentId (composite)
- status
- submittedAt

**Rules:**
- Only one final submission per student per assignment
- Once status is final, isLocked becomes true and no edits allowed

---

## 5. DRAFTS Collection

**Path:** /drafts/{draftId}

**Document ID:** Auto-generated

**Fields:**
- draftId: string (auto-generated)
- assignmentId: string (foreign key)
- studentId: string (user UID)
- studentName: string
- content: string (current work)
- contentHash: string (SHA-256)
- savedAt: string (ISO timestamp)
- autoSave: boolean (true if auto-saved)
- version: number

**Example:**
{
  "draftId": "draft_001",
  "assignmentId": "assign_001",
  "studentId": "student_abc",
  "studentName": "Rahul Sharma",
  "content": "Binary trees are hierarchical...",
  "contentHash": "x1y2z3...",
  "savedAt": "2025-02-09T14:20:00.000Z",
  "autoSave": true,
  "version": 5
}

**Indexes:**
- assignmentId + studentId (composite)
- savedAt

**Rules:**
- Drafts are for integrity tracking only
- Never scored or evaluated
- Automatically timestamped

---

## 6. SCORES Collection

**Path:** /scores/{scoreId}

**Document ID:** Auto-generated

**Fields:**
- scoreId: string (auto-generated)
- submissionId: string (foreign key)
- assignmentId: string (foreign key)
- studentId: string (user UID)
- studentName: string
- evaluatedBy: string (professor UID)
- evaluatedByName: string
- plagiarismScore: number (0-100, originality percentage)
- criteriaScores: array of objects
  - criterionId: string
  - name: string
  - points: number
  - maxPoints: number
- totalCriteriaPoints: number
- totalCriteriaMaxPoints: number
- weightedPlagiarismScore: number (calculated)
- weightedCriteriaScore: number (calculated)
- finalScore: number (0-10)
- overridden: boolean
- overrideReason: string
- feedback: string
- evaluatedAt: string (ISO timestamp)
- createdAt: string (ISO timestamp)
- updatedAt: string (ISO timestamp)

**Example:**
{
  "scoreId": "score_001",
  "submissionId": "sub_001",
  "assignmentId": "assign_001",
  "studentId": "student_abc",
  "studentName": "Rahul Sharma",
  "evaluatedBy": "prof_abc",
  "evaluatedByName": "Dr. Kumar",
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
  "totalCriteriaPoints": 88,
  "totalCriteriaMaxPoints": 100,
  "weightedPlagiarismScore": 2.55,
  "weightedCriteriaScore": 6.16,
  "finalScore": 8.71,
  "overridden": false,
  "overrideReason": null,
  "feedback": "Excellent work with minor citation issues",
  "evaluatedAt": "2025-02-11T10:00:00.000Z",
  "createdAt": "2025-02-11T10:00:00.000Z",
  "updatedAt": "2025-02-11T10:00:00.000Z"
}

**Calculation Formula:**
weightedPlagiarismScore = (plagiarismScore / 100) * (plagiarismWeightage / 100) * 10
weightedCriteriaScore = (totalCriteriaPoints / totalCriteriaMaxPoints) * (criteriaWeightage / 100) * 10
finalScore = weightedPlagiarismScore + weightedCriteriaScore

**Indexes:**
- submissionId
- assignmentId
- studentId

---

## 7. AUDIT_LOGS Collection

**Path:** /auditLogs/{logId}

**Document ID:** Auto-generated

**Fields:**
- logId: string (auto-generated)
- userId: string (who made the change)
- userName: string
- action: string (create | update | delete | submit | evaluate)
- entityType: string (assignment | submission | draft | score)
- entityId: string
- changes: object (before/after values)
- timestamp: string (ISO timestamp)
- ipAddress: string (optional)

**Example:**
{
  "logId": "log_001",
  "userId": "student_abc",
  "userName": "Rahul Sharma",
  "action": "submit",
  "entityType": "submission",
  "entityId": "sub_001",
  "changes": {
    "status": { "before": "draft", "after": "final" },
    "isLocked": { "before": false, "after": true }
  },
  "timestamp": "2025-02-10T15:30:00.000Z",
  "ipAddress": "192.168.1.1"
}

**Indexes:**
- userId
- entityType + entityId (composite)
- timestamp

---

## Relationships

1. users → assignments (1:N via professorId)
2. assignments → rubrics (1:1)
3. assignments → submissions (1:N via assignmentId)
4. assignments → drafts (1:N via assignmentId)
5. submissions → scores (1:1 via submissionId)
6. users → submissions (1:N via studentId)

## Data Integrity Rules

1. Only final submissions are scored
2. Drafts are never evaluated
3. plagiarismWeightage + criteriaWeightage must equal 100
4. Final submissions cannot be edited (isLocked = true)
5. Professor has authority to override scores
6. All changes tracked in auditLogs