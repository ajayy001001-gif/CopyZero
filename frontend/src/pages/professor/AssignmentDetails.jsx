import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function AssignmentDetails() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAssignmentData();
  }, [assignmentId]);

  async function fetchAssignmentData() {
    try {
      setLoading(true);
      const [assignmentRes, rubricRes, submissionsRes] = await Promise.all([
        professorAPI.getAssignmentById(assignmentId),
        professorAPI.getRubricByAssignment(assignmentId).catch(() => ({ data: { rubric: null } })),
        professorAPI.getSubmissions(assignmentId).catch(() => ({ data: { submissions: [] } }))
      ]);

      setAssignment(assignmentRes.data.assignment);
      setRubric(rubricRes.data.rubric);
      setSubmissionCount(submissionsRes.data.submissions?.length || 0);
    } catch (err) {
      setError('Failed to load assignment details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="professor" />
        <main className="flex-1 flex items-center justify-center">
          <LoadingDots text="Loading..." />
        </main>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="professor" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--color-accent-error)] mb-4">{error || 'Assignment not found'}</p>
            <button
              onClick={() => navigate('/professor/dashboard')}
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
      <Sidebar role="professor" />

      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="mb-8 page-enter">
          <button
            onClick={() => navigate('/professor/dashboard')}
            className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Dashboard
          </button>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {assignment.title}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {assignment.type} · {assignment.status}
              </p>
            </div>
            <button
              onClick={() => navigate(`/professor/submissions/${assignmentId}`)}
              className="btn-outline"
            >
              View Submissions
            </button>
          </div>
        </div>

        {/* Assignment Details */}
        <div className="grid gap-6 page-stagger">
          {/* Description */}
          <div className="card">
            <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
              Description
            </h3>
            <p className="text-sm leading-relaxed">
              {assignment.description}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card">
              <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Due Date
              </h3>
              <p className="font-medium">
                {new Date(assignment.dueDate).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                {new Date(assignment.dueDate).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            <div className="card">
              <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Submissions
              </h3>
              <p className="font-medium text-2xl">{submissionCount}</p>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Total received
              </p>
            </div>

            <div className="card">
              <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Weightages
              </h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Plagiarism</span>
                  <span>{assignment.plagiarismWeightage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-secondary)]">Content</span>
                  <span>{assignment.criteriaWeightage}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rubric */}
          <div className="card">
            <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
              Rubric Criteria
            </h3>
            <div className="space-y-3">
              {(rubric?.criteria || rubric?.rubricCriteria || []).length > 0 ? (
                (rubric.criteria || rubric.rubricCriteria).map((criterion, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center py-2 border-b border-[var(--color-border)] last:border-0"
                  >
                    <span className="text-sm">{criterion.name || criterion.criterionName || criterion.title}</span>
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {criterion.points || criterion.maxPoints || criterion.maxScore} points
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-sm text-[var(--color-text-secondary)]">
                  No rubric criteria defined.
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--color-border)] flex justify-between">
              <span className="text-sm text-[var(--color-text-secondary)]">Total</span>
              <span className="font-medium">
                {(rubric?.criteria || rubric?.rubricCriteria || []).reduce((sum, c) => sum + (c.points || c.maxPoints || c.maxScore || 0), 0)} points
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
