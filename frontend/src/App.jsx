import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Auth Pages
import Login from './pages/Login';
import Signup from './pages/Signup';

// Professor Pages
import ProfessorDashboard from './pages/professor/Dashboard';
import CreateAssignment from './pages/professor/CreateAssignment';
import AssignmentDetails from './pages/professor/AssignmentDetails';
import Submissions from './pages/professor/Submissions';
import EvaluateSubmission from './pages/professor/EvaluateSubmission';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import SubmitAssignment from './pages/student/SubmitAssignment';
import ViewSubmission from './pages/student/ViewSubmission';
import Scores from './pages/student/Scores';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Professor Routes */}
          <Route
            path="/professor/dashboard"
            element={
              <ProtectedRoute allowedRoles={['professor']}>
                <ProfessorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/assignments/create"
            element={
              <ProtectedRoute allowedRoles={['professor']}>
                <CreateAssignment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/assignments/:assignmentId"
            element={
              <ProtectedRoute allowedRoles={['professor']}>
                <AssignmentDetails />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/submissions/:assignmentId"
            element={
              <ProtectedRoute allowedRoles={['professor']}>
                <Submissions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/professor/evaluate/:submissionId"
            element={
              <ProtectedRoute allowedRoles={['professor']}>
                <EvaluateSubmission />
              </ProtectedRoute>
            }
          />

          {/* Student Routes */}
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId/submit"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <SubmitAssignment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/assignments/:assignmentId/view"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <ViewSubmission />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/scores"
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <Scores />
              </ProtectedRoute>
            }
          />
          {/* Unauthorized */}
          <Route
            path="/unauthorized"
            element={
              <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xl text-[var(--color-accent-error)] mb-4">Unauthorized Access</p>
                  <a href="/login" className="link">Back to Login</a>
                </div>
              </div>
            }
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                  <p className="text-xl mb-4">Page Not Found</p>
                  <a href="/" className="link">Go Home</a>
                </div>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
