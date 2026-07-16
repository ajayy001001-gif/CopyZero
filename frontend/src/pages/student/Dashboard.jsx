import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function StudentDashboard() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchAssignments();
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
        <div className="mb-8 page-enter">
          <h1 className="text-2xl font-semibold tracking-tight">
            Assignments
          </h1>
        </div>

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
                          onClick={() => navigate(`/student/assignments/${assignment.id}/submit`)}
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
      </main>
    </div>
  );
}
