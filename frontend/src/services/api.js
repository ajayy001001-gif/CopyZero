import axios from 'axios';
import { auth } from '../config/firebase';
import { getUserAIKeyHeader } from '../lib/aiKeyStorage';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      console.error('Network or CORS error:', error);
    } else {
      const { status } = error.response;
      if (status === 401 || status === 403) {
        console.warn(`Auth warning (${status}): Unauthorized or forbidden request`, error.response.data);
      } else if (status >= 500) {
        console.error(`Server error (${status}):`, error.response.data);
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  signup: (data) => api.post('/api/auth/signup', data),
  login: (data) => api.post('/api/auth/login', data),
  getProfile: () => api.get('/api/auth/profile'),
  updateProfile: (data) => api.put('/api/auth/profile', data),
};

export const professorAPI = {
  createAssignment: (data) => api.post('/api/professor/assignments', data),
  getAssignments: () => api.get('/api/professor/assignments'),
  getAssignmentById: (id) => api.get(`/api/professor/assignments/${id}`),
  updateAssignment: (id, data) => api.put(`/api/professor/assignments/${id}`, data),
  deleteAssignment: (id) => api.delete(`/api/professor/assignments/${id}`),
  closeAssignment: (id) => api.patch(`/api/professor/assignments/${id}/close`),

  createRubric: (data) => api.post('/api/professor/rubrics', data),
  getRubricByAssignment: (assignmentId) => api.get(`/api/professor/rubrics/assignment/${assignmentId}`),
  updateRubric: (id, data) => api.put(`/api/professor/rubrics/${id}`, data),

  getSubmissions: (assignmentId) => api.get(`/api/professor/submissions/assignment/${assignmentId}`),
  // BYOK header also attached here so the automatic integrity-score
  // computation (triggered server-side after this save) can use the same
  // key — otherwise it degrades to a heuristic-only score, never a platform key.
  evaluateSubmission: (data) => api.post('/api/professor/evaluate', data, { headers: getUserAIKeyHeader() }),
  overrideScore: (scoreId, data) => api.patch(`/api/professor/scores/${scoreId}/override`, data),
  getScores: (assignmentId) => api.get(`/api/professor/scores/assignment/${assignmentId}`),

  // ── Changed: renamed from ollamaEvaluate to aiEvaluate ──
  // Route stays /ollama-evaluate — the controller now calls Groq internally.
  // BYOK only: X-User-AI-Key from sessionStorage is required — there is no
  // platform fallback, the backend rejects requests with no key.
  aiEvaluate: (submissionId) => api.post('/api/professor/ollama-evaluate', { submissionId }, { headers: getUserAIKeyHeader() }),

  // Keep old name as alias so nothing else breaks if referenced elsewhere
  ollamaEvaluate: (submissionId) => api.post('/api/professor/ollama-evaluate', { submissionId }, { headers: getUserAIKeyHeader() }),

  checkOllamaHealth: () => api.get('/api/professor/ollama-health'),

  createCodingQuestion: (data) => api.post('/api/professor/coding-questions', data),

  // Assessments — separate entity from Assignments, MCQ + coding, own flow.
  createAssessment: (data) => api.post('/api/professor/assessments', data),
  getAssessments: () => api.get('/api/professor/assessments'),
  getAssessmentById: (id) => api.get(`/api/professor/assessments/${id}`),
  updateAssessment: (id, data) => api.put(`/api/professor/assessments/${id}`, data),
  publishAssessment: (id) => api.post(`/api/professor/assessments/${id}/publish`),
  getAssessmentSubmissions: (id) => api.get(`/api/professor/assessments/${id}/submissions`),

  // BYOK header attached so generation uses the professor's own Groq key if
  // configured — falls back to platform key / NIM server-side if absent.
  generateAssessmentQuestions: (data) => api.post('/api/professor/generate-assessment-questions', data, { headers: getUserAIKeyHeader() }),
};

export const proctorAPI = {
  getEventTimeline: (submissionId, cursor) => api.get(`/api/events/${submissionId}`, { params: cursor ? { cursor } : {} }),
  getEvidenceForEvent: (eventId) => api.get(`/api/proctor/evidence/${eventId}`),
};

export const studentAPI = {
  joinAssignment: (code) => api.post('/api/student/join', { code }),
  getAssignments: () => api.get('/api/student/assignments'),
  getAssignmentById: (id) => api.get(`/api/student/assignments/${id}`),

  submitAssignment: (data) => api.post('/api/student/submit', data),
  getSubmissions: () => api.get('/api/student/submissions'),
  getSubmissionById: (id) => api.get(`/api/student/submissions/${id}`),
  getSubmissionByAssignment: (assignmentId) => api.get(`/api/student/submissions/assignment/${assignmentId}`),

  saveDraft: (data) => api.post('/api/student/drafts', data),
  getAllDrafts: () => api.get('/api/student/drafts'),
  getDraftsByAssignment: (assignmentId) => api.get(`/api/student/drafts/assignment/${assignmentId}`),
  getLatestDraft: (assignmentId) => api.get(`/api/student/drafts/assignment/${assignmentId}/latest`),

  getScores: () => api.get('/api/student/scores'),
  getScoreByAssignment: (assignmentId) => api.get(`/api/student/scores/assignment/${assignmentId}`),
  getScoreById: (id) => api.get(`/api/student/scores/${id}`),

  getCodingQuestions: (assignmentId) => api.get(`/api/student/coding-questions/${assignmentId}`),
  submitCode: (data) => api.post('/api/student/submit-code', data),

  // Assessments
  joinAssessment: (code) => api.post('/api/student/assessments/join', { code }),
  getAssessments: () => api.get('/api/student/assessments'),
  startAssessment: (id) => api.post(`/api/student/assessments/${id}/start`),
  getFullQuestionsForSubmit: (id) => api.get(`/api/student/assessments/${id}/full-questions`),
  // BYOK header attached so the coding-answer plausibility check (and the
  // session's integrity score) can use the student's own key if configured
  // — optional, submission still works and grades correctly without one.
  submitAssessment: (id, data) => api.post(`/api/student/assessments/${id}/submit`, data, { headers: getUserAIKeyHeader() }),
};

export const aiAPI = {
  testKey: (provider, key) => api.post('/api/ai/test-key', { provider, key }),
};

export default api;