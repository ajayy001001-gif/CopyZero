import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import GenerateQuestionsPanel from '../../components/assessment/GenerateQuestionsPanel';

const EMPTY_MCQ = { question: '', options: ['', '', '', ''], correctAnswer: 0, points: 10, explanation: '' };
const EMPTY_TEST_CASE = { input: '', expectedOutput: '', isHidden: false, points: 10 };
const EMPTY_CODING = {
  title: '', description: '', starterCode: { python: '', javascript: '' },
  testCases: [{ ...EMPTY_TEST_CASE }], allowedLanguages: ['python', 'javascript'], timeLimitMs: 5000
};

// isNew: no assessmentId yet — this is the create flow. Once saved, the
// page keeps working in "edit" mode against the returned id (no route
// change needed — save just starts including id in subsequent PUT calls).
export default function AssessmentBuilder() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const isNew = !routeId || routeId === 'new';

  const [assessmentId, setAssessmentId] = useState(isNew ? null : routeId);
  const [status, setStatus] = useState('draft');
  const [assessmentCode, setAssessmentCode] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [codingQuestions, setCodingQuestions] = useState([]);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isNew) fetchAssessment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  async function fetchAssessment() {
    try {
      const res = await professorAPI.getAssessmentById(routeId);
      const a = res.data.assessment;
      setAssessmentId(a.id);
      setStatus(a.status);
      setAssessmentCode(a.assessmentCode);
      setTitle(a.title);
      setDescription(a.description || '');
      setDurationMinutes(a.durationMinutes);
      setMcqQuestions(a.mcqQuestions || []);
      setCodingQuestions(a.codingQuestions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }

  function updateMcq(index, field, value) {
    setMcqQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }
  function updateMcqOption(qIndex, optIndex, value) {
    setMcqQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const options = [...q.options];
      options[optIndex] = value;
      return { ...q, options };
    }));
  }
  function addMcq() {
    if (mcqQuestions.length >= 50) return;
    setMcqQuestions(prev => [...prev, { ...EMPTY_MCQ, options: [...EMPTY_MCQ.options] }]);
  }
  function removeMcq(index) {
    setMcqQuestions(prev => prev.filter((_, i) => i !== index));
  }

  function updateCoding(index, field, value) {
    setCodingQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  }
  function updateCodingStarter(index, lang, value) {
    setCodingQuestions(prev => prev.map((q, i) => i === index ? { ...q, starterCode: { ...q.starterCode, [lang]: value } } : q));
  }
  function toggleCodingLanguage(index, lang) {
    setCodingQuestions(prev => prev.map((q, i) => {
      if (i !== index) return q;
      const langs = q.allowedLanguages.includes(lang)
        ? q.allowedLanguages.filter(l => l !== lang)
        : [...q.allowedLanguages, lang];
      return { ...q, allowedLanguages: langs };
    }));
  }
  function addCoding() {
    if (codingQuestions.length >= 20) return;
    setCodingQuestions(prev => [...prev, {
      ...EMPTY_CODING,
      starterCode: { ...EMPTY_CODING.starterCode },
      testCases: [{ ...EMPTY_TEST_CASE }],
      allowedLanguages: [...EMPTY_CODING.allowedLanguages]
    }]);
  }
  // Called by GenerateQuestionsPanel when the professor adds a reviewed
  // AI-generated question. They land in the same state arrays as manually
  // authored ones and go through the same save/normalize/publish path.
  function handleAddGeneratedMcq(mcq) {
    if (mcqQuestions.length >= 50) return;
    setMcqQuestions(prev => [...prev, mcq]);
  }
  function handleAddGeneratedCoding(coding) {
    if (codingQuestions.length >= 20) return;
    setCodingQuestions(prev => [...prev, coding]);
  }
  function removeCoding(index) {
    setCodingQuestions(prev => prev.filter((_, i) => i !== index));
  }
  function updateTestCase(qIndex, tcIndex, field, value) {
    setCodingQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex) return q;
      const testCases = q.testCases.map((tc, j) => j === tcIndex ? { ...tc, [field]: value } : tc);
      return { ...q, testCases };
    }));
  }
  function addTestCase(qIndex) {
    setCodingQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || q.testCases.length >= 20) return q;
      return { ...q, testCases: [...q.testCases, { ...EMPTY_TEST_CASE }] };
    }));
  }
  function removeTestCase(qIndex, tcIndex) {
    setCodingQuestions(prev => prev.map((q, i) => {
      if (i !== qIndex || q.testCases.length <= 1) return q;
      return { ...q, testCases: q.testCases.filter((_, j) => j !== tcIndex) };
    }));
  }

  async function handleSave() {
    setError('');
    setSuccess('');
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { title, description, durationMinutes, mcqQuestions, codingQuestions };
      if (assessmentId) {
        const res = await professorAPI.updateAssessment(assessmentId, payload);
        setMcqQuestions(res.data.assessment.mcqQuestions);
        setCodingQuestions(res.data.assessment.codingQuestions);
      } else {
        const res = await professorAPI.createAssessment(payload);
        setAssessmentId(res.data.assessment.id);
        setAssessmentCode(res.data.assessment.assessmentCode);
        setStatus(res.data.assessment.status);
        setMcqQuestions(res.data.assessment.mcqQuestions);
        setCodingQuestions(res.data.assessment.codingQuestions);
        navigate(`/professor/assessments/${res.data.assessment.id}`, { replace: true });
      }
      setSuccess('Saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!assessmentId) return;
    setPublishing(true);
    setError('');
    try {
      await handleSave();
      const res = await professorAPI.publishAssessment(assessmentId);
      setStatus(res.data.assessment.status);
      setSuccess('Published — students can now join with the code below.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to publish assessment');
    } finally {
      setPublishing(false);
    }
  }

  function handleCopyCode() {
    if (!assessmentCode) return;
    navigator.clipboard.writeText(assessmentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="professor" />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/professor/dashboard')}
            className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Dashboard
          </button>

          <div className="flex justify-between items-start mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isNew && !assessmentId ? 'Create Assessment' : 'Edit Assessment'}
            </h1>
            {assessmentCode && (
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-sm font-mono tracking-widest hover:border-white transition-colors"
              >
                <span>{assessmentCode}</span>
                <span className="text-xs text-[var(--color-text-tertiary)] font-sans tracking-normal">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {status !== 'draft' && (
            <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)] mb-4">Status: {status}</p>
          )}

          {/* Basic details */}
          <div className="card mb-6 space-y-4">
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white focus:border-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-3 text-white resize-none focus:border-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Duration (minutes) — single timer for the whole assessment
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 30)}
                className="w-32 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white focus:border-white focus:outline-none"
              />
            </div>
          </div>

          {/* Generate with AI (review-only; adds into the arrays below) */}
          <GenerateQuestionsPanel onAddMcq={handleAddGeneratedMcq} onAddCoding={handleAddGeneratedCoding} />

          {/* MCQ Questions */}
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider">
                MCQ Questions ({mcqQuestions.length}/50)
              </h3>
              <button onClick={addMcq} className="link text-sm">+ Add MCQ</button>
            </div>
            <div className="space-y-4">
              {mcqQuestions.map((q, qi) => (
                <div key={qi} className="p-4 bg-[var(--color-bg-secondary)] rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--color-text-tertiary)]">Question {qi + 1}</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        value={q.points}
                        onChange={(e) => updateMcq(qi, 'points', Number(e.target.value))}
                        className="w-16 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-white text-xs"
                      />
                      <button onClick={() => removeMcq(qi)} className="text-xs text-[var(--color-accent-error)]">Remove</button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Question text"
                    value={q.question}
                    onChange={(e) => updateMcq(qi, 'question', e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm resize-none focus:border-white focus:outline-none"
                  />
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={q.correctAnswer === oi}
                          onChange={() => updateMcq(qi, 'correctAnswer', oi)}
                        />
                        <input
                          type="text"
                          placeholder={`Option ${oi + 1}`}
                          value={opt}
                          onChange={(e) => updateMcqOption(qi, oi, e.target.value)}
                          className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-white text-sm focus:border-white focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)]">Select the radio button next to the correct answer.</p>
                </div>
              ))}
              {mcqQuestions.length === 0 && (
                <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">No MCQ questions yet.</p>
              )}
            </div>
          </div>

          {/* Coding Questions */}
          <div className="card mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider">
                Coding Questions ({codingQuestions.length}/20)
              </h3>
              <button onClick={addCoding} className="link text-sm">+ Add coding question</button>
            </div>
            <div className="space-y-6">
              {codingQuestions.map((q, qi) => (
                <div key={qi} className="p-4 bg-[var(--color-bg-secondary)] rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[var(--color-text-tertiary)]">Coding Question {qi + 1}</span>
                    <button onClick={() => removeCoding(qi)} className="text-xs text-[var(--color-accent-error)]">Remove</button>
                  </div>
                  <input
                    type="text"
                    placeholder="Title"
                    value={q.title}
                    onChange={(e) => updateCoding(qi, 'title', e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
                  />
                  <textarea
                    rows={2}
                    placeholder="Description"
                    value={q.description}
                    onChange={(e) => updateCoding(qi, 'description', e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm resize-none focus:border-white focus:outline-none"
                  />
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={q.allowedLanguages.includes('python')} onChange={() => toggleCodingLanguage(qi, 'python')} />
                      Python
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={q.allowedLanguages.includes('javascript')} onChange={() => toggleCodingLanguage(qi, 'javascript')} />
                      JavaScript
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-[var(--color-text-secondary)] text-xs">Time limit (ms)</span>
                      <input
                        type="number"
                        min={1000}
                        max={10000}
                        value={q.timeLimitMs}
                        onChange={(e) => updateCoding(qi, 'timeLimitMs', Number(e.target.value))}
                        className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-white text-xs"
                      />
                    </div>
                  </div>
                  {q.allowedLanguages.includes('python') && (
                    <textarea
                      rows={3}
                      placeholder="Python starter code"
                      value={q.starterCode.python}
                      onChange={(e) => updateCodingStarter(qi, 'python', e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                    />
                  )}
                  {q.allowedLanguages.includes('javascript') && (
                    <textarea
                      rows={3}
                      placeholder="JavaScript starter code"
                      value={q.starterCode.javascript}
                      onChange={(e) => updateCodingStarter(qi, 'javascript', e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                    />
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                        Test Cases ({q.testCases.length}/20)
                      </span>
                      <button onClick={() => addTestCase(qi)} className="link text-xs">+ Add test case</button>
                    </div>
                    <div className="space-y-2">
                      {q.testCases.map((tc, ti) => (
                        <div key={ti} className="p-3 bg-[var(--color-surface)] rounded-lg space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-[var(--color-text-tertiary)]">Test {ti + 1}</span>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 text-xs">
                                <input type="checkbox" checked={tc.isHidden} onChange={(e) => updateTestCase(qi, ti, 'isHidden', e.target.checked)} />
                                Hidden
                              </label>
                              <input
                                type="number"
                                min={0}
                                value={tc.points}
                                onChange={(e) => updateTestCase(qi, ti, 'points', Number(e.target.value))}
                                className="w-16 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-2 py-1 text-white text-xs"
                              />
                              {q.testCases.length > 1 && (
                                <button onClick={() => removeTestCase(qi, ti)} className="text-xs text-[var(--color-accent-error)]">Remove</button>
                              )}
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            placeholder="Input (stdin)"
                            value={tc.input}
                            onChange={(e) => updateTestCase(qi, ti, 'input', e.target.value)}
                            className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                          />
                          <textarea
                            rows={2}
                            placeholder="Expected output"
                            value={tc.expectedOutput}
                            onChange={(e) => updateTestCase(qi, ti, 'expectedOutput', e.target.value)}
                            className="w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded px-3 py-2 text-white font-mono text-xs resize-none focus:border-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {codingQuestions.length === 0 && (
                <p className="text-sm text-[var(--color-text-tertiary)] text-center py-4">No coding questions yet.</p>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: 'var(--color-accent-error)', background: 'rgba(255, 59, 48, 0.05)' }}>
              <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{error}</p>
            </div>
          )}
          {success && (
            <p className="text-sm mb-6 text-[var(--color-text-secondary)]">{success}</p>
          )}

          <div className="flex gap-4">
            <button onClick={handleSave} disabled={saving} className="btn-outline flex-1">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || !assessmentId || status === 'active'}
              className="btn-primary flex-1"
            >
              {publishing ? 'Publishing...' : status === 'active' ? 'Published' : 'Save & Publish'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
