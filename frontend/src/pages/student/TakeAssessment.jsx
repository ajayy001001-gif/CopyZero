import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import CodeEditor from '../../components/coding/CodeEditor';
import useBehavioralTracker from '../../hooks/useBehavioralTracker';
import useProctoring from '../../hooks/useProctoring';
import { executeCode, compareOutput } from '../../services/codeExecutionService';

export default function TakeAssessment() {
  const { id: assessmentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [consented, setConsented] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const [submissionId, setSubmissionId] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const [remainingMs, setRemainingMs] = useState(null);

  const [section, setSection] = useState('mcq'); // 'mcq' | 'coding'
  const [mcqAnswers, setMcqAnswers] = useState({}); // questionId -> selectedOption
  const [codingState, setCodingState] = useState({}); // questionId -> { language, code, runResults, running }

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const { flushNow: flushBehavioral } = useBehavioralTracker({
    isExamActive: sessionStarted,
    submissionId,
    contextType: 'assessment'
  });
  const {
    webcamStatus, screenStatus, blockedReason, webcamNotice,
    onSuspiciousBehavior, flushNow: flushProctoring
  } = useProctoring({ isExamActive: sessionStarted, contextType: 'assessment' });

  useEffect(() => {
    if (!sessionStarted) return;
    function onVisibility() {
      if (document.visibilityState === 'hidden') onSuspiciousBehavior('tab_switch');
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement) onSuspiciousBehavior('fullscreen_exit');
    }
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [sessionStarted, onSuspiciousBehavior]);

  // Single countdown timer for the whole session — not per question/section.
  useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => {
      const remaining = deadline - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  async function handleStart() {
    setError('');
    try {
      const res = await studentAPI.startAssessment(assessmentId);
      const sub = res.data.submission;
      setSubmissionId(sub.id);
      setAssessment(res.data.assessment);
      setDeadline(new Date(sub.startedAt).getTime() + sub.durationMinutes * 60 * 1000);
      const initialCoding = {};
      (res.data.assessment.codingQuestions || []).forEach(q => {
        const lang = q.allowedLanguages[0];
        initialCoding[q.id] = { language: lang, code: q.starterCode?.[lang] || '', runResults: null, running: false };
      });
      setCodingState(initialCoding);
      setSessionStarted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start assessment');
    }
  }

  useEffect(() => {
    fetchAssessmentPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId]);

  async function fetchAssessmentPreview() {
    try {
      const res = await studentAPI.getAssessments();
      const found = (res.data.assessments || []).find(a => a.id === assessmentId);
      if (!found) {
        setError('Assessment not found or not joined yet');
      } else if (found.attemptStatus === 'submitted' || found.attemptStatus === 'evaluated') {
        setError('You have already completed this assessment');
      }
    } catch {
      // Non-fatal — Start will surface any real error.
    } finally {
      setLoading(false);
    }
  }

  function selectMcqOption(questionId, optionIndex) {
    setMcqAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  }

  function updateCode(questionId, code) {
    setCodingState(prev => ({ ...prev, [questionId]: { ...prev[questionId], code } }));
  }

  function changeLanguage(questionId, language, question) {
    setCodingState(prev => ({
      ...prev,
      [questionId]: { ...prev[questionId], language, code: question.starterCode?.[language] || '', runResults: null }
    }));
  }

  async function handleRunSampleTests(question) {
    const state = codingState[question.id];
    setCodingState(prev => ({ ...prev, [question.id]: { ...prev[question.id], running: true } }));

    const visibleCases = question.testCases.filter(tc => !tc.isHidden);
    const results = [];
    for (const tc of visibleCases) {
      const res = await executeCode({ language: state.language, code: state.code, stdin: tc.input, timeoutMs: question.timeLimitMs });
      const passed = res.status === 'success' && compareOutput(res.stdout, tc.expectedOutput);
      results.push({ testCaseId: tc.id, status: res.status, passed, actualOutput: res.stdout, expectedOutput: tc.expectedOutput, message: res.message });
    }

    setCodingState(prev => ({ ...prev, [question.id]: { ...prev[question.id], runResults: results, running: false } }));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError('');

    try {
      // Right before final submit: fetch full test cases (hidden included —
      // safe since only one attempt is ever allowed) and run every coding
      // question against ALL of its test cases for a genuine pass/fail,
      // reusing the same client-side execution used for sample tests.
      let fullCodingQuestions = [];
      try {
        const res = await studentAPI.getFullQuestionsForSubmit(assessmentId);
        fullCodingQuestions = res.data.codingQuestions || [];
      } catch {
        // If this fails, fall back to whatever sample-test results we have.
      }

      const codingAnswers = [];
      for (const q of (assessment?.codingQuestions || [])) {
        const state = codingState[q.id];
        if (!state) continue;
        const full = fullCodingQuestions.find(fq => fq.id === q.id);
        const testCases = full ? full.testCases : q.testCases;

        const claimedTestResults = [];
        for (const tc of testCases) {
          if (tc.expectedOutput == null) continue; // couldn't fetch full set — skip rather than guess
          const res = await executeCode({ language: state.language, code: state.code, stdin: tc.input, timeoutMs: q.timeLimitMs });
          const passed = res.status === 'success' && compareOutput(res.stdout, tc.expectedOutput);
          claimedTestResults.push({ testCaseId: tc.id, passed, actualOutput: res.status === 'success' ? res.stdout : `[${res.status}] ${res.message || ''}` });
        }

        codingAnswers.push({ questionId: q.id, language: state.language, code: state.code, claimedTestResults });
      }

      const mcqAnswersPayload = Object.entries(mcqAnswers).map(([questionId, selectedOption]) => ({ questionId, selectedOption }));

      const response = await studentAPI.submitAssessment(assessmentId, { mcqAnswers: mcqAnswersPayload, codingAnswers });

      await Promise.all([flushBehavioral(submissionId), flushProctoring(submissionId)]);

      setResult(response.data.submission);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  }

  const remainingLabel = useMemo(() => {
    if (remainingMs == null) return '';
    const total = Math.max(0, Math.floor(remainingMs / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [remainingMs]);

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

  if (result) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="card max-w-md w-full text-center">
            <h1 className="text-xl font-semibold mb-4">Assessment Submitted</h1>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-2xl font-light">{result.mcqScore}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">MCQ / {result.mcqMaxScore}</p>
              </div>
              <div>
                <p className="text-2xl font-light">{result.codingScore}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">Coding / {result.codingMaxScore}</p>
              </div>
              <div>
                <p className="text-2xl font-light">{result.totalScore}</p>
                <p className="text-xs text-[var(--color-text-tertiary)]">Total</p>
              </div>
            </div>
            <button onClick={() => navigate('/student/dashboard')} className="btn-primary w-full">
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (error && !sessionStarted) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--color-accent-error)] mb-4">{error}</p>
            <button onClick={() => navigate('/student/dashboard')} className="btn-outline">Go to Dashboard</button>
          </div>
        </main>
      </div>
    );
  }

  if (!sessionStarted) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="card max-w-lg w-full">
            <h1 className="text-xl font-semibold mb-3">Start Assessment</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              This assessment requires webcam and screen sharing access for
              proctoring, held for the entire session — MCQ and coding
              sections both run under the same timer and the same monitoring
              session. Presence/count checks run locally in your browser;
              flagged moments save a short snapshot or clip for your
              professor to review. Once started, you have one attempt.
            </p>
            <label className="flex items-start gap-3 mb-6 text-sm cursor-pointer">
              <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-1" />
              <span>I consent to webcam and screen monitoring during this assessment.</span>
            </label>
            {error && <p className="text-sm mb-4" style={{ color: 'var(--color-accent-error)' }}>{error}</p>}
            <button onClick={handleStart} disabled={!consented} className="btn-primary w-full">
              Grant Access &amp; Start Assessment
            </button>
          </div>
        </main>
      </div>
    );
  }

  const isBlocked = webcamStatus === 'denied' || screenStatus === 'denied';
  const mcqQuestions = assessment?.mcqQuestions || [];
  const codingQuestions = assessment?.codingQuestions || [];
  // Fall back to whichever section actually has questions, so an assessment
  // with only coding (or only MCQ) isn't stuck on an empty default section
  // with no tab to switch away from.
  const effectiveSection = mcqQuestions.length === 0
    ? 'coding'
    : codingQuestions.length === 0
      ? 'mcq'
      : section;

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="student" />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Timer + proctoring indicators */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4 text-xs text-[var(--color-text-tertiary)]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: webcamStatus === 'monitoring' ? '#34c759' : webcamStatus === 'unavailable' ? '#ff9500' : '#ff3b30' }} />
                Webcam: {webcamStatus}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: screenStatus === 'sharing' ? '#34c759' : '#ff3b30' }} />
                Screen: {screenStatus}
              </span>
            </div>
            <div className="text-lg font-mono">{remainingLabel}</div>
          </div>

          {isBlocked && (
            <div className="card mb-6 text-center" style={{ borderColor: 'var(--color-accent-error)' }}>
              <p style={{ color: 'var(--color-accent-error)' }}>{blockedReason}</p>
            </div>
          )}
          {!isBlocked && webcamNotice && (
            <div className="card mb-6 text-center" style={{ borderColor: '#ff9500' }}>
              <p style={{ color: '#ff9500' }}>{webcamNotice}</p>
            </div>
          )}

          {/* Section tabs */}
          {mcqQuestions.length > 0 && codingQuestions.length > 0 && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setSection('mcq')}
                className={`text-sm px-4 py-2 rounded-md border ${section === 'mcq' ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
              >
                MCQ ({mcqQuestions.length})
              </button>
              <button
                onClick={() => setSection('coding')}
                className={`text-sm px-4 py-2 rounded-md border ${section === 'coding' ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
              >
                Coding ({codingQuestions.length})
              </button>
            </div>
          )}

          {effectiveSection === 'mcq' && mcqQuestions.length > 0 && (
            <div className="space-y-4 mb-8">
              {mcqQuestions.map((q, qi) => (
                <div key={q.id} className="card">
                  <p className="font-medium mb-4">{qi + 1}. {q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-3 p-2 rounded-md hover:bg-[var(--color-surface)] cursor-pointer">
                        <input
                          type="radio"
                          checked={mcqAnswers[q.id] === oi}
                          onChange={() => selectMcqOption(q.id, oi)}
                          disabled={isBlocked}
                        />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {effectiveSection === 'coding' && codingQuestions.map(q => {
            const state = codingState[q.id] || { language: q.allowedLanguages[0], code: '', runResults: null, running: false };
            return (
              <div key={q.id} className="mb-8">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-1">{q.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{q.description}</p>
                </div>
                <div className="mb-4 flex items-center gap-3">
                  {q.allowedLanguages.map(lang => (
                    <button
                      key={lang}
                      onClick={() => changeLanguage(q.id, lang, q)}
                      className={`text-sm px-3 py-1 rounded-md border ${state.language === lang ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <CodeEditor value={state.code} onChange={(code) => updateCode(q.id, code)} disabled={submitting || isBlocked} />
                <div className="mt-4 mb-2">
                  <button
                    onClick={() => handleRunSampleTests(q)}
                    disabled={state.running || submitting || isBlocked}
                    className="btn-outline text-sm"
                  >
                    {state.running ? 'Running...' : 'Run against sample tests'}
                  </button>
                </div>
                {state.runResults && (
                  <div className="space-y-2 mb-6">
                    {state.runResults.map((r, i) => (
                      <div key={r.testCaseId} className="p-3 bg-[var(--color-surface)] rounded-lg text-sm flex justify-between">
                        <span>Test {i + 1}</span>
                        <span style={{ color: r.passed ? '#34c759' : 'var(--color-accent-error)' }}>
                          {r.status === 'timeout' ? 'Timed out' : r.status === 'error' ? 'Error' : r.passed ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: 'var(--color-accent-error)', background: 'rgba(255, 59, 48, 0.05)' }}>
              <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{error}</p>
            </div>
          )}

          <button onClick={handleSubmit} disabled={submitting || isBlocked} className="btn-primary w-full">
            {submitting ? <LoadingDots text="Submitting..." /> : 'Submit Assessment'}
          </button>
        </div>
      </main>
    </div>
  );
}
