import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import CodeEditor from '../../components/coding/CodeEditor';
import useBehavioralTracker from '../../hooks/useBehavioralTracker';
import useProctoring from '../../hooks/useProctoring';
import { executeCode, compareOutput } from '../../services/codeExecutionService';

export default function CodingExam() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [question, setQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [consented, setConsented] = useState(false);
  const [examStarted, setExamStarted] = useState(false);

  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { flushNow: flushBehavioral } = useBehavioralTracker({
    isExamActive: examStarted,
    submissionId: null,
    assignmentId
  });
  const {
    webcamStatus, screenStatus, blockedReason, webcamNotice,
    onSuspiciousBehavior, flushNow: flushProctoring
  } = useProctoring({ isExamActive: examStarted });

  useEffect(() => {
    fetchQuestion();
  }, [assignmentId]);

  // Mirrors the same tab-switch/fullscreen listeners useBehavioralTracker
  // already installs, purely to trigger screen-evidence capture at the same
  // moments — kept separate so useProctoring stays self-contained.
  useEffect(() => {
    if (!examStarted) return;
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
  }, [examStarted, onSuspiciousBehavior]);

  async function fetchQuestion() {
    try {
      const [assignRes, questionsRes] = await Promise.all([
        studentAPI.getAssignmentById(assignmentId),
        studentAPI.getCodingQuestions(assignmentId)
      ]);
      setAssignment(assignRes.data.assignment);
      const q = questionsRes.data.questions?.[0];
      if (!q) {
        setError('No coding question found for this assignment');
      } else {
        setQuestion(q);
        setLanguage(q.allowedLanguages[0]);
        setCode(q.starterCode?.[q.allowedLanguages[0]] || '');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load coding question');
    } finally {
      setLoading(false);
    }
  }

  function handleLanguageChange(lang) {
    setLanguage(lang);
    setCode(question.starterCode?.[lang] || '');
    setRunResults(null);
  }

  async function handleRunSampleTests() {
    if (!question) return;
    setRunning(true);
    setRunResults(null);

    const visibleCases = question.testCases.filter(tc => !tc.isHidden);
    const results = [];
    for (const tc of visibleCases) {
      const res = await executeCode({ language, code, stdin: tc.input, timeoutMs: question.timeLimitMs });
      const passed = res.status === 'success' && compareOutput(res.stdout, tc.expectedOutput);
      results.push({ testCaseId: tc.testCaseId, status: res.status, passed, actualOutput: res.stdout, expectedOutput: tc.expectedOutput, message: res.message });
    }
    setRunResults(results);
    setRunning(false);
  }

  async function handleSubmit() {
    if (!question) return;
    setSubmitting(true);
    setError('');

    try {
      // Run every test case (visible + hidden) so the professor sees actual
      // output on hidden cases too — but 'passed' can only be computed for
      // visible cases (expectedOutput was never sent for hidden ones), so
      // hidden-case results are honestly reported as unverified here.
      const claimedResults = [];
      for (const tc of question.testCases) {
        const res = await executeCode({ language, code, stdin: tc.input, timeoutMs: question.timeLimitMs });
        const passed = !tc.isHidden && res.status === 'success' && compareOutput(res.stdout, tc.expectedOutput);
        claimedResults.push({ testCaseId: tc.testCaseId, passed, actualOutput: res.status === 'success' ? res.stdout : `[${res.status}] ${res.message || ''}` });
      }

      const response = await studentAPI.submitCode({
        assignmentId,
        questionId: question.id,
        language,
        code,
        testResults: claimedResults,
        executedAt: new Date().toISOString()
      });

      const submissionId = response.data.submission?.id;
      await Promise.all([flushBehavioral(submissionId), flushProctoring(submissionId)]);
      navigate('/student/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit code');
    } finally {
      setSubmitting(false);
    }
  }

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

  if (error && !question) {
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

  // ── Pre-exam consent + permissions screen ─────────────────────────────
  if (!examStarted) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="student" />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="card max-w-lg w-full">
            <h1 className="text-xl font-semibold mb-3">{question.title}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              This exam requires webcam and screen sharing access for proctoring.
              Presence/count checks run locally in your browser every few
              seconds; flagged moments (no face detected, multiple faces, or
              screen sharing stopped) save a short snapshot or clip for your
              professor to review. Nothing is recorded continuously.
            </p>

            <label className="flex items-start gap-3 mb-6 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
                className="mt-1"
              />
              <span>I consent to webcam and screen monitoring during this exam.</span>
            </label>

            {blockedReason && (
              <p className="text-sm mb-4" style={{ color: 'var(--color-accent-error)' }}>{blockedReason}</p>
            )}

            <button
              onClick={() => setExamStarted(true)}
              disabled={!consented}
              className="btn-primary w-full"
            >
              Grant Access &amp; Start Exam
            </button>
          </div>
        </main>
      </div>
    );
  }

  const isBlocked = webcamStatus === 'denied' || screenStatus === 'denied';
  const webcamLoading = webcamStatus === 'requesting' || webcamStatus === 'loading_model';
  const webcamLabel = {
    requesting: 'requesting access',
    loading_model: 'preparing...',
    monitoring: 'monitoring',
    unavailable: 'unavailable',
    denied: 'denied'
  }[webcamStatus] || webcamStatus;
  const webcamDotColor = webcamStatus === 'monitoring'
    ? '#34c759'
    : webcamStatus === 'unavailable'
      ? '#ff9500'
      : webcamLoading
        ? '#8e8e93'
        : '#ff3b30';

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="student" />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {/* Persistent proctoring indicators — transparency, not just UX */}
          <div className="flex items-center gap-4 mb-6 text-xs text-[var(--color-text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: webcamDotColor }} />
              Webcam: {webcamLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: screenStatus === 'sharing' ? '#34c759' : '#ff3b30' }} />
              Screen: {screenStatus === 'sharing' ? 'sharing' : screenStatus}
            </span>
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

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight mb-2">{question.title}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap">{question.description}</p>
          </div>

          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">Language</label>
            {question.allowedLanguages.map(lang => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                className={`text-sm px-3 py-1 rounded-md border ${language === lang ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
              >
                {lang}
              </button>
            ))}
          </div>

          <CodeEditor value={code} onChange={setCode} disabled={submitting || isBlocked} />

          <div className="flex gap-4 mt-4 mb-6">
            <button onClick={handleRunSampleTests} disabled={running || submitting || isBlocked} className="btn-outline flex-1">
              {running ? 'Running...' : 'Run against sample tests'}
            </button>
            <button onClick={handleSubmit} disabled={submitting || running || isBlocked} className="btn-primary flex-1">
              {submitting ? <LoadingDots text="" /> : 'Submit'}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: 'var(--color-accent-error)', background: 'rgba(255, 59, 48, 0.05)' }}>
              <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{error}</p>
            </div>
          )}

          {runResults && (
            <div className="card">
              <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">Sample Test Results</h3>
              <div className="space-y-3">
                {runResults.map((r, i) => (
                  <div key={r.testCaseId} className="p-3 bg-[var(--color-surface)] rounded-lg text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">Test {i + 1}</span>
                      <span style={{ color: r.passed ? '#34c759' : 'var(--color-accent-error)' }}>
                        {r.status === 'timeout' ? 'Timed out' : r.status === 'error' ? 'Error' : r.passed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    {r.status !== 'success' && r.message && (
                      <p className="text-xs text-[var(--color-text-tertiary)]">{r.message}</p>
                    )}
                    {r.status === 'success' && !r.passed && (
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        <p>Expected: <span className="font-mono">{r.expectedOutput}</span></p>
                        <p>Actual: <span className="font-mono">{r.actualOutput}</span></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
