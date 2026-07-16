import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

const EMPTY_TEST_CASE = { input: '', expectedOutput: '', isHidden: false, points: 10 };

export default function AssignmentDetails() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCodingForm, setShowCodingForm] = useState(false);
  const [cqTitle, setCqTitle] = useState('');
  const [cqDescription, setCqDescription] = useState('');
  const [cqTimeLimitMs, setCqTimeLimitMs] = useState(5000);
  const [cqLanguages, setCqLanguages] = useState(['python', 'javascript']);
  const [cqStarterPython, setCqStarterPython] = useState('');
  const [cqStarterJs, setCqStarterJs] = useState('');
  const [cqTestCases, setCqTestCases] = useState([{ ...EMPTY_TEST_CASE }]);
  const [cqSaving, setCqSaving] = useState(false);
  const [cqError, setCqError] = useState('');
  const [cqSuccess, setCqSuccess] = useState('');

  useEffect(() => {
    fetchAssignmentData();
  }, [assignmentId]);

  function updateTestCase(index, field, value) {
    setCqTestCases(prev => prev.map((tc, i) => i === index ? { ...tc, [field]: value } : tc));
  }

  function addTestCase() {
    if (cqTestCases.length >= 20) return;
    setCqTestCases(prev => [...prev, { ...EMPTY_TEST_CASE }]);
  }

  function removeTestCase(index) {
    setCqTestCases(prev => prev.filter((_, i) => i !== index));
  }

  function toggleLanguage(lang) {
    setCqLanguages(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]);
  }

  async function handleCreateCodingQuestion(e) {
    e.preventDefault();
    setCqError('');
    setCqSuccess('');

    if (!cqTitle.trim()) {
      setCqError('Title is required');
      return;
    }
    if (cqLanguages.length === 0) {
      setCqError('Select at least one language');
      return;
    }
    if (cqTestCases.some(tc => !tc.input.trim() && !tc.expectedOutput.trim())) {
      setCqError('Every test case needs input and expected output');
      return;
    }

    setCqSaving(true);
    try {
      await professorAPI.createCodingQuestion({
        assignmentId,
        title: cqTitle,
        description: cqDescription,
        starterCode: { python: cqStarterPython, javascript: cqStarterJs },
        testCases: cqTestCases.map(tc => ({ ...tc, points: Number(tc.points) || 0 })),
        timeLimitMs: Number(cqTimeLimitMs) || 5000,
        allowedLanguages: cqLanguages
      });
      setCqSuccess('Coding question saved');
      setShowCodingForm(false);
    } catch (err) {
      setCqError(err.response?.data?.error || 'Failed to save coding question');
    } finally {
      setCqSaving(false);
    }
  }

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

          {/* Coding question (only for code-type assignments) */}
          {assignment.type === 'code' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Coding Question
                </h3>
                <button onClick={() => setShowCodingForm(v => !v)} className="link text-sm">
                  {showCodingForm ? 'Cancel' : 'Add / Edit Question'}
                </button>
              </div>

              {cqSuccess && !showCodingForm && (
                <p className="text-sm text-[var(--color-text-secondary)]">{cqSuccess}</p>
              )}

              {showCodingForm && (
                <form onSubmit={handleCreateCodingQuestion} className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Title</label>
                    <input
                      type="text"
                      value={cqTitle}
                      onChange={(e) => setCqTitle(e.target.value)}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white focus:border-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Description</label>
                    <textarea
                      rows={3}
                      value={cqDescription}
                      onChange={(e) => setCqDescription(e.target.value)}
                      className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 text-white resize-none focus:border-white focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cqLanguages.includes('python')} onChange={() => toggleLanguage('python')} />
                      Python
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={cqLanguages.includes('javascript')} onChange={() => toggleLanguage('javascript')} />
                      JavaScript
                    </label>
                    <div className="ml-auto flex items-center gap-2 text-sm">
                      <span className="text-[var(--color-text-secondary)]">Time limit (ms)</span>
                      <input
                        type="number"
                        min={1000}
                        max={10000}
                        value={cqTimeLimitMs}
                        onChange={(e) => setCqTimeLimitMs(e.target.value)}
                        className="w-24 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-white"
                      />
                    </div>
                  </div>

                  {cqLanguages.includes('python') && (
                    <div>
                      <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Python starter code</label>
                      <textarea
                        rows={4}
                        value={cqStarterPython}
                        onChange={(e) => setCqStarterPython(e.target.value)}
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 text-white font-mono text-sm resize-none focus:border-white focus:outline-none"
                      />
                    </div>
                  )}

                  {cqLanguages.includes('javascript') && (
                    <div>
                      <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">JavaScript starter code</label>
                      <textarea
                        rows={4}
                        value={cqStarterJs}
                        onChange={(e) => setCqStarterJs(e.target.value)}
                        className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 text-white font-mono text-sm resize-none focus:border-white focus:outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Test Cases ({cqTestCases.length}/20)
                      </label>
                      <button type="button" onClick={addTestCase} className="link text-sm">+ Add test case</button>
                    </div>
                    <div className="space-y-3">
                      {cqTestCases.map((tc, i) => (
                        <div key={i} className="p-3 bg-[var(--color-bg-secondary)] rounded-lg space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--color-text-tertiary)]">Test {i + 1}</span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 text-xs">
                                <input type="checkbox" checked={tc.isHidden} onChange={(e) => updateTestCase(i, 'isHidden', e.target.checked)} />
                                Hidden
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={tc.points}
                                onChange={(e) => updateTestCase(i, 'points', e.target.value)}
                                className="w-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-white text-xs"
                              />
                              {cqTestCases.length > 1 && (
                                <button type="button" onClick={() => removeTestCase(i)} className="text-xs text-[var(--color-accent-error)]">
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            placeholder="Input (stdin)"
                            value={tc.input}
                            onChange={(e) => updateTestCase(i, 'input', e.target.value)}
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                          />
                          <textarea
                            rows={2}
                            placeholder="Expected output"
                            value={tc.expectedOutput}
                            onChange={(e) => updateTestCase(i, 'expectedOutput', e.target.value)}
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {cqError && (
                    <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{cqError}</p>
                  )}

                  <button type="submit" disabled={cqSaving} className="btn-primary w-full">
                    {cqSaving ? 'Saving...' : 'Save Coding Question'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
