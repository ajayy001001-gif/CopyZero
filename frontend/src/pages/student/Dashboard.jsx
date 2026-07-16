import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function StudentDashboard() {
  const [activeTab, setActiveTab] = useState('assignments'); // default preserves original behavior
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const [assessments, setAssessments] = useState([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState('');
  const [assessmentJoinCode, setAssessmentJoinCode] = useState('');
  const [assessmentJoining, setAssessmentJoining] = useState(false);
  const [assessmentJoinError, setAssessmentJoinError] = useState('');
  const [assessmentJoinSuccess, setAssessmentJoinSuccess] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
    fetchAssessments();
  }, []);

  async function fetchAssignments() {
    try {
      const response = await studentAPI.getAssignments();
      setAssignments(response.data.assignments);
    } catch (err) {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssessments() {
    try {
      const response = await studentAPI.getAssessments();
      setAssessments(response.data.assessments);
    } catch (err) {
      setAssessmentsError('Failed to load assessments');
    } finally {
      setAssessmentsLoading(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setJoinError('');
    setJoinSuccess('');

    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoining(true);
    try {
      const response = await studentAPI.joinAssignment(code);
      setJoinSuccess(`Joined "${response.data.assignment.title}"`);
      setJoinCode('');
      fetchAssignments();
    } catch (err) {
      setJoinError(err.response?.data?.error || 'Failed to join assignment');
    } finally {
      setJoining(false);
    }
  }

  async function handleJoinAssessment(e) {
    e.preventDefault();
    setAssessmentJoinError('');
    setAssessmentJoinSuccess('');

    const code = assessmentJoinCode.trim().toUpperCase();
    if (!code) return;

    setAssessmentJoining(true);
    try {
      const response = await studentAPI.joinAssessment(code);
      setAssessmentJoinSuccess(`Joined "${response.data.assessment.title}"`);
      setAssessmentJoinCode('');
      fetchAssessments();
    } catch (err) {
      setAssessmentJoinError(err.response?.data?.error || 'Failed to join assessment');
    } finally {
      setAssessmentJoining(false);
    }
  }

  const pendingCount = assignments.filter(a => !a.submitted).length;
  const submittedCount = assignments.filter(a => a.submitted).length;

  function getDaysRemaining(dueDate) {
    const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  }

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="student" />

      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="mb-6 page-enter">
          <h1 className="text-2xl font-semibold tracking-tight">
            {activeTab === 'assignments' ? 'Assignments' : 'Assessments'}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`text-sm px-4 py-2 rounded-md border ${activeTab === 'assignments' ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
          >
            Assignments
          </button>
          <button
            onClick={() => setActiveTab('assessments')}
            className={`text-sm px-4 py-2 rounded-md border ${activeTab === 'assessments' ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
          >
            Assessments
          </button>
        </div>

        {activeTab === 'assignments' && (
        <>
        {/* Join with code */}
        <form onSubmit={handleJoin} className="card mb-6 page-enter">
          <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Join with code
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3"
              maxLength={6}
              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors font-mono tracking-widest uppercase"
              disabled={joining}
            />
            <button
              type="submit"
              className="btn-outline text-sm px-6"
              disabled={joining || joinCode.trim().length !== 6}
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError && (
            <p className="text-sm mt-2" style={{ color: 'var(--color-accent-error)' }}>
              {joinError}
            </p>
          )}
          {joinSuccess && (
            <p className="text-sm mt-2 text-[var(--color-text-secondary)]">
              {joinSuccess}
            </p>
          )}
        </form>

        {error && (
          <div
            className="mb-6 p-4 rounded-lg border"
            style={{
              borderColor: 'var(--color-accent-error)',
              background: 'rgba(255, 59, 48, 0.05)'
            }}
          >
            <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>
              {error}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingDots text="Loading assignments..." />
          </div>
        ) : assignments.length === 0 ? (
          <div className="card text-center py-16 page-enter">
            <p className="text-[var(--color-text-secondary)]">
              No assignments available
            </p>
          </div>
        ) : (
          <>
            {/* Assignment Cards */}
            <div className="grid gap-4 mb-12 page-stagger">
              {assignments.map((assignment, index) => {
                const daysRemaining = getDaysRemaining(assignment.dueDate);
                const isUrgent = daysRemaining <= 2 && !assignment.submitted;

                return (
                  <div
                    key={assignment.id}
                    className="card"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`status-dot ${assignment.submitted ? 'status-submitted' : 'status-pending'}`} />
                        <h3 className="text-lg font-semibold">
                          {assignment.title}
                        </h3>
                      </div>
                      <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">
                        {assignment.type}
                      </span>
                    </div>

                    {assignment.description && (
                      <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2">
                        {assignment.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mb-4">
                      <span>
                        Due: {new Date(assignment.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                      {!assignment.submitted && (
                        <>
                          <span className="text-[var(--color-border)]">·</span>
                          <span className={isUrgent ? 'text-[var(--color-accent-error)]' : ''}>
                            {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Overdue'}
                          </span>
                        </>
                      )}
                      {assignment.submitted && (
                        <>
                          <span className="text-[var(--color-border)]">·</span>
                          <span>Submitted</span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      {assignment.score ? (
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-light">{assignment.score}</span>
                          <span className="text-sm text-[var(--color-text-secondary)]">/ 10</span>
                        </div>
                      ) : (
                        <div />
                      )}

                      {assignment.submitted ? (
                        <button
                          onClick={() => navigate(`/student/assignments/${assignment.id}/view`)}
                          className="btn-outline text-sm py-2 px-4"
                        >
                          View
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/student/assignments/${assignment.id}/${assignment.type === 'code' ? 'code' : 'submit'}`)}
                          className={`text-sm py-2 px-4 ${isUrgent ? 'btn-primary' : 'btn-outline'}`}
                        >
                          Submit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overview */}
            <div className="page-enter" style={{ animationDelay: '300ms' }}>
              <div className="section-divider mb-6" />
              <h2 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
                Overview
              </h2>
              <div className="flex gap-12">
                <div className="stat-item">
                  <p className="stat-value">{pendingCount}</p>
                  <p className="stat-label">Pending</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value">{submittedCount}</p>
                  <p className="stat-label">Submitted</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value">{assignments.length}</p>
                  <p className="stat-label">Total</p>
                </div>
              </div>
            </div>
          </>
        )}
        </>
        )}

        {activeTab === 'assessments' && (
          <>
            {/* Join with code */}
            <form onSubmit={handleJoinAssessment} className="card mb-6 page-enter">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Join with code
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={assessmentJoinCode}
                  onChange={(e) => setAssessmentJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. A1B2C3"
                  maxLength={6}
                  className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors font-mono tracking-widest uppercase"
                  disabled={assessmentJoining}
                />
                <button
                  type="submit"
                  className="btn-outline text-sm px-6"
                  disabled={assessmentJoining || assessmentJoinCode.trim().length !== 6}
                >
                  {assessmentJoining ? 'Joining...' : 'Join'}
                </button>
              </div>
              {assessmentJoinError && (
                <p className="text-sm mt-2" style={{ color: 'var(--color-accent-error)' }}>{assessmentJoinError}</p>
              )}
              {assessmentJoinSuccess && (
                <p className="text-sm mt-2 text-[var(--color-text-secondary)]">{assessmentJoinSuccess}</p>
              )}
            </form>

            {assessmentsError && (
              <div
                className="mb-6 p-4 rounded-lg border"
                style={{ borderColor: 'var(--color-accent-error)', background: 'rgba(255, 59, 48, 0.05)' }}
              >
                <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{assessmentsError}</p>
              </div>
            )}

            {assessmentsLoading ? (
              <div className="flex justify-center py-20">
                <LoadingDots text="Loading assessments..." />
              </div>
            ) : assessments.length === 0 ? (
              <div className="card text-center py-16 page-enter">
                <p className="text-[var(--color-text-secondary)]">No assessments joined yet</p>
              </div>
            ) : (
              <div className="grid gap-4 mb-12 page-stagger">
                {assessments.map((assessment, index) => {
                  const completed = assessment.attemptStatus === 'submitted' || assessment.attemptStatus === 'evaluated';
                  return (
                    <div key={assessment.id} className="card" style={{ animationDelay: `${index * 50}ms` }}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`status-dot ${completed ? 'status-submitted' : 'status-pending'}`} />
                          <h3 className="text-lg font-semibold">{assessment.title}</h3>
                        </div>
                        <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">
                          {assessment.durationMinutes} min
                        </span>
                      </div>
                      {assessment.description && (
                        <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2">{assessment.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {(assessment.mcqQuestions?.length || 0)} MCQ · {(assessment.codingQuestions?.length || 0)} coding
                        </span>
                        <button
                          onClick={() => navigate(`/student/assessments/${assessment.id}`)}
                          disabled={completed}
                          className={`text-sm py-2 px-4 ${completed ? 'btn-outline opacity-50' : 'btn-primary'}`}
                        >
                          {completed ? 'Completed' : assessment.attemptStatus === 'in_progress' ? 'Resume' : 'Start'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
