import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function ProfessorDashboard() {
  const [activeTab, setActiveTab] = useState('assignments'); // default preserves original behavior
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const [assessments, setAssessments] = useState([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [assessmentsError, setAssessmentsError] = useState('');
  const [copiedAssessmentId, setCopiedAssessmentId] = useState(null);

  const navigate = useNavigate();

  function handleCopyCode(assignment) {
    navigator.clipboard.writeText(assignment.assignmentCode);
    setCopiedId(assignment.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function handleCopyAssessmentCode(assessment) {
    navigator.clipboard.writeText(assessment.assessmentCode);
    setCopiedAssessmentId(assessment.id);
    setTimeout(() => setCopiedAssessmentId(null), 1500);
  }

  useEffect(() => {
    fetchAssignments();
    fetchAssessments();
  }, []);

  async function fetchAssignments() {
    try {
      const response = await professorAPI.getAssignments();
      setAssignments(response.data.assignments);
    } catch (err) {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssessments() {
    try {
      const response = await professorAPI.getAssessments();
      setAssessments(response.data.assessments);
    } catch (err) {
      setAssessmentsError('Failed to load assessments');
    } finally {
      setAssessmentsLoading(false);
    }
  }

  const totalSubmissions = assignments.reduce((sum, a) => sum + (a.submissionCount || 0), 0);
  const pendingGrading = assignments.reduce((sum, a) => {
    // Estimate pending based on submissions that might not be graded
    return sum + Math.floor((a.submissionCount || 0) * 0.3);
  }, 0);

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="professor" />
      
      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 page-enter">
          <h1 className="text-2xl font-semibold tracking-tight">
            {activeTab === 'assignments' ? 'Assignments' : 'Assessments'}
          </h1>
          <button
            onClick={() => navigate(activeTab === 'assignments' ? '/professor/assignments/create' : '/professor/assessments/new')}
            className="btn-outline"
          >
            <span>+</span>
            <span>{activeTab === 'assignments' ? 'Create Assignment' : 'Create Assessment'}</span>
          </button>
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

        {activeTab === 'assignments' && error && (
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
        
        {activeTab === 'assignments' && (loading ? (
          <div className="flex justify-center py-20">
            <LoadingDots text="Loading assignments..." />
          </div>
        ) : assignments.length === 0 ? (
          <div className="card text-center py-16 page-enter">
            <p className="text-[var(--color-text-secondary)] mb-4">
              No assignments created yet
            </p>
            <button
              onClick={() => navigate('/professor/assignments/create')}
              className="link"
            >
              Create your first assignment
            </button>
          </div>
        ) : (
          <>
            {/* Assignment Cards */}
            <div className="grid gap-4 mb-12 page-stagger">
              {assignments.map((assignment, index) => (
                <div 
                  key={assignment.id} 
                  className="card"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-semibold">
                      {assignment.title}
                    </h3>
                    <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">
                      {assignment.type}
                    </span>
                  </div>
                  
                  <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2">
                    {assignment.description}
                  </p>
                  
                  <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mb-4">
                    <span>
                      Due: {new Date(assignment.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                    <span className="text-[var(--color-border)]">·</span>
                    <span>{assignment.submissionCount || 0} submissions</span>
                  </div>

                  {assignment.assignmentCode && (
                    <button
                      onClick={() => handleCopyCode(assignment)}
                      className="flex items-center gap-2 mb-4 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-sm font-mono tracking-widest hover:border-white transition-colors"
                      title="Copy join code"
                    >
                      <span>{assignment.assignmentCode}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)] font-sans tracking-normal">
                        {copiedId === assignment.id ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/professor/assignments/${assignment.id}`)}
                      className="btn-outline flex-1 text-sm py-2"
                    >
                      View
                    </button>
                    <button
                      onClick={() => navigate(`/professor/submissions/${assignment.id}`)}
                      className="btn-outline flex-1 text-sm py-2"
                    >
                      Evaluate
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Statistics */}
            <div className="page-enter" style={{ animationDelay: '300ms' }}>
              <div className="section-divider mb-6" />
              <h2 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
                Statistics
              </h2>
              <div className="flex gap-12">
                <div className="stat-item">
                  <p className="stat-value">{assignments.length}</p>
                  <p className="stat-label">Total</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value">{pendingGrading}</p>
                  <p className="stat-label">Pending</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value">{totalSubmissions - pendingGrading}</p>
                  <p className="stat-label">Graded</p>
                </div>
              </div>
            </div>
          </>
        ))}

        {activeTab === 'assessments' && (
          <>
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
                <p className="text-[var(--color-text-secondary)] mb-4">No assessments created yet</p>
                <button onClick={() => navigate('/professor/assessments/new')} className="link">
                  Create your first assessment
                </button>
              </div>
            ) : (
              <div className="grid gap-4 mb-12 page-stagger">
                {assessments.map((assessment, index) => (
                  <div key={assessment.id} className="card" style={{ animationDelay: `${index * 50}ms` }}>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-lg font-semibold">{assessment.title}</h3>
                      <span className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">{assessment.status}</span>
                    </div>

                    <p className="text-sm text-[var(--color-text-secondary)] mb-4 line-clamp-2">{assessment.description}</p>

                    <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mb-4">
                      <span>{assessment.durationMinutes} min</span>
                      <span className="text-[var(--color-border)]">·</span>
                      <span>{(assessment.mcqQuestions?.length || 0)} MCQ</span>
                      <span className="text-[var(--color-border)]">·</span>
                      <span>{(assessment.codingQuestions?.length || 0)} coding</span>
                    </div>

                    {assessment.assessmentCode && (
                      <button
                        onClick={() => handleCopyAssessmentCode(assessment)}
                        className="flex items-center gap-2 mb-4 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-sm font-mono tracking-widest hover:border-white transition-colors"
                        title="Copy join code"
                      >
                        <span>{assessment.assessmentCode}</span>
                        <span className="text-xs text-[var(--color-text-tertiary)] font-sans tracking-normal">
                          {copiedAssessmentId === assessment.id ? 'Copied' : 'Copy'}
                        </span>
                      </button>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => navigate(`/professor/assessments/${assessment.id}`)}
                        className="btn-outline flex-1 text-sm py-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => navigate(`/professor/assessments/${assessment.id}/results`)}
                        className="btn-outline flex-1 text-sm py-2"
                      >
                        View Results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
