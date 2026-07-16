import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function Submissions() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [assignmentId]);

  async function fetchData() {
    try {
      const [subRes, assignRes] = await Promise.all([
        professorAPI.getSubmissions(assignmentId),
        professorAPI.getAssignmentById(assignmentId),
      ]);
      setSubmissions(subRes.data.submissions);
      setAssignment(assignRes.data.assignment);
    } catch (err) {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }

  function handleExportCSV() {
    const csvContent = [
      ['#', 'Student', 'Email', 'Submitted At', 'Score', 'Status'].join(','),
      ...submissions.map((s, i) => [
        String(i + 1).padStart(3, '0'),
        s.studentName,
        s.studentEmail,
        new Date(s.submittedAt).toLocaleString(),
        s.score ?? '-',
        s.status,
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assignment?.title || 'submissions'}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="professor" />

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-2 page-enter">
            <button
              onClick={() => navigate('/professor/dashboard')}
              className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to Dashboard
            </button>

            <h1 className="text-2xl font-semibold tracking-tight">
              {assignment?.title || 'Assignment'}
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Due: {assignment?.dueDate && new Date(assignment.dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>

          {/* Submissions header */}
          <div className="flex justify-between items-center mb-6 page-enter" style={{ animationDelay: '100ms' }}>
            <h2 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider">
              Submissions ({submissions.length})
            </h2>
            <button
              onClick={handleExportCSV}
              className="btn-outline text-sm py-2 px-4"
              disabled={submissions.length === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
          </div>
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
            <LoadingDots text="Loading submissions..." />
          </div>
        ) : submissions.length === 0 ? (
          <div className="card text-center py-16 page-enter">
            <p className="text-[var(--color-text-secondary)]">
              No submissions yet
            </p>
          </div>
        ) : (
          <div className="page-enter max-w-5xl mx-auto" style={{ animationDelay: '150ms' }}>
            <div className="card">
              <div className="overflow-x-auto">
                <table className="data-table w-full text-left">
                  <thead>
                    <tr>
                      <th className="w-16">#</th>
                      <th>Student</th>
                      <th className="w-24">Score</th>
                      <th className="w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((submission, index) => (
                      <tr key={submission.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="text-[var(--color-text-tertiary)] py-4">
                          {String(index + 1).padStart(3, '0')}
                        </td>
                        <td className="py-4">
                          <p className="font-medium">{submission.studentName}</p>
                          <p className="text-xs text-[var(--color-text-tertiary)]">{submission.studentEmail}</p>
                        </td>
                        <td className="py-4">
                          {submission.score ? (
                            <span className="text-lg font-semibold">{submission.score}</span>
                          ) : (
                            <span className="text-[var(--color-text-tertiary)]">—</span>
                          )}
                        </td>
                        <td className="py-4">
                          <button
                            onClick={() => navigate(`/professor/evaluate/${submission.id}`, {
                              state: { submission }
                            })}
                            className="btn-outline text-xs py-1.5 px-3"
                          >
                            {submission.score ? 'View' : 'Evaluate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
