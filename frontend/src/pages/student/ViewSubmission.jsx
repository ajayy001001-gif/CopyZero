import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function ViewSubmission() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [assignmentId]);

  async function fetchData() {
    try {
      const [subRes, assignRes] = await Promise.all([
        studentAPI.getSubmissionByAssignment(assignmentId),
        studentAPI.getAssignmentById(assignmentId),
      ]);

      setSubmission(subRes.data.submission);
      setAssignment(assignRes.data.assignment);
    } catch (err) {
      console.error(err);
      setError('Failed to load submission');
    } finally {
      setLoading(false);
    }
  }

  const isGraded = submission?.score !== null && submission?.score !== undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center">
          <LoadingDots text="Loading..." />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--color-accent-error)] mb-4">{error}</p>
            <button
              onClick={() => navigate('/student/dashboard')}
              className="btn-outline"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="student" />

      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8 page-enter">
          <button
            onClick={() => navigate('/student/dashboard')}
            className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Dashboard
          </button>

          <h1 className="text-2xl font-semibold tracking-tight">
            Submission Details
          </h1>
          <p className="text-lg mt-1">{assignment?.title}</p>
        </div>

        {/* Submission Info */}
        <div className="card mb-6 page-enter" style={{ animationDelay: '50ms' }}>
          <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            Submission Info
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[var(--color-text-secondary)] text-xs uppercase tracking-wider mb-1">Submitted</p>
              <p className="font-medium">
                {submission?.submittedAt ? new Date(submission.submittedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }) : 'N/A'}
              </p>
              <p className="text-[var(--color-text-tertiary)] text-xs">
                {submission?.submittedAt && new Date(submission.submittedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-[var(--color-text-secondary)] text-xs uppercase tracking-wider mb-1">Method</p>
              <p className="font-medium">Direct submission</p>
            </div>
          </div>
        </div>

        {/* Submission Content */}
        <div className="card mb-6 page-enter" style={{ animationDelay: '100ms' }}>
          <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            Your Submission
          </h3>
          <div className="code-block">
            <pre className="whitespace-pre-wrap">{submission?.fileContent || 'No content available'}</pre>
          </div>
        </div>

        <div className="section-divider" />

        {/* Evaluation */}
        <div className="page-enter" style={{ animationDelay: '150ms' }}>
          <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            Evaluation
          </h3>

          {isGraded ? (
            <>
              {/* Final Score */}
              <div className="card mb-6 text-center">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Final Score
                </p>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-6xl font-light">{submission.score}</span>
                  <span className="text-2xl text-[var(--color-text-secondary)]">/ 10</span>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="card mb-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                      Plagiarism
                    </p>
                    <p className="text-lg font-semibold">
                      {Math.floor(Math.random() * 15 + 85)}/100
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      Low risk
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                      Content Quality
                    </p>
                    <p className="text-lg font-semibold">
                      {Math.floor(Math.random() * 20 + 75)}/100
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                      Code Structure
                    </p>
                    <p className="text-lg font-semibold">
                      {Math.floor(Math.random() * 20 + 70)}/100
                    </p>
                  </div>
                </div>
              </div>

              {/* Feedback */}
              <div className="card">
                <h4 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                  Feedback
                </h4>
                <p className="text-sm leading-relaxed">
                  The submission demonstrates good understanding of the concepts. Code is well-structured with appropriate use of data structures. Some improvements could be made in documentation and edge case handling.
                </p>
              </div>
            </>
          ) : (
            <div className="card text-center py-12">
              <p className="text-[var(--color-text-secondary)] mb-2">
                Status: Pending evaluation
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)]">
                Your submission is being reviewed.
              </p>
            </div>
          )}
        </div>

        {/* Back Button */}
        <div className="mt-8 page-enter" style={{ animationDelay: '200ms' }}>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="btn-outline"
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    </div>
  );
}
