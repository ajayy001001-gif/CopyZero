import { useState } from 'react';
import { professorAPI } from '../../services/api';
import CodeEditor from '../coding/CodeEditor';
import { executeCode, compareOutput } from '../../services/codeExecutionService';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

// "Generate with AI" panel for the assessment builder. Generated questions
// are shown for review/edit — nothing is saved until the professor clicks
// "Add to Assessment", which hands the (possibly edited) question up to the
// builder via onAddMcq / onAddCoding. Coding questions are gated behind a
// verification step because the AI authored its own (possibly wrong) test
// cases.
export default function GenerateQuestionsPanel({ onAddMcq, onAddCoding }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [mcqCount, setMcqCount] = useState(3);
  const [codingCount, setCodingCount] = useState(1);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState(null);

  const [mcqs, setMcqs] = useState([]);
  const [codings, setCodings] = useState([]);

  async function handleGenerate() {
    setError('');
    setWarnings(null);
    if (!subject.trim() || !topic.trim()) {
      setError('Subject and topic are required');
      return;
    }
    if (mcqCount + codingCount === 0) {
      setError('Request at least one question');
      return;
    }
    setGenerating(true);
    try {
      const res = await professorAPI.generateAssessmentQuestions({
        subject: subject.trim(),
        topic: topic.trim(),
        difficulty,
        mcqCount: Number(mcqCount),
        codingCount: Number(codingCount)
      });
      setMcqs((res.data.mcqQuestions || []).map(q => ({ ...q, _added: false })));
      setCodings((res.data.codingQuestions || []).map(q => ({
        ...q,
        _added: false,
        _verifying: false,
        _language: q.allowedLanguages[0] || 'python',
        _solution: q.starterCode?.[q.allowedLanguages[0] || 'python'] || '',
        _running: false,
        _runResults: null
      })));
      const w = res.data.warnings || {};
      if ((w.mcqDropped || 0) > 0 || (w.codingDropped || 0) > 0) {
        setWarnings(`${w.mcqDropped || 0} MCQ and ${w.codingDropped || 0} coding question(s) were dropped as malformed and not returned.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // ── MCQ editing ──────────────────────────────────────────────────────────
  function updateMcq(i, field, value) {
    setMcqs(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  }
  function updateMcqOption(i, oi, value) {
    setMcqs(prev => prev.map((q, idx) => {
      if (idx !== i) return q;
      const options = [...q.options];
      options[oi] = value;
      return { ...q, options };
    }));
  }
  function addMcqToAssessment(i) {
    const q = mcqs[i];
    onAddMcq({
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      points: q.points ?? 10,
      explanation: q.explanation || ''
    });
    setMcqs(prev => prev.map((x, idx) => idx === i ? { ...x, _added: true } : x));
  }

  // ── Coding editing + verification ────────────────────────────────────────
  function updateCoding(i, field, value) {
    setCodings(prev => prev.map((q, idx) => idx === i ? { ...q, [field]: value, verified: false } : q));
  }
  function updateTestCase(i, ti, field, value) {
    setCodings(prev => prev.map((q, idx) => {
      if (idx !== i) return q;
      const testCases = q.testCases.map((tc, j) => j === ti ? { ...tc, [field]: value } : tc);
      // Any edit to a test case invalidates a prior verification.
      return { ...q, testCases, verified: false, _runResults: null };
    }));
  }
  function setSolution(i, code) {
    setCodings(prev => prev.map((q, idx) => idx === i ? { ...q, _solution: code } : q));
  }
  function setLanguage(i, language) {
    setCodings(prev => prev.map((q, idx) => idx === i ? { ...q, _language: language, _solution: q.starterCode?.[language] || '' } : q));
  }
  function toggleVerifying(i) {
    setCodings(prev => prev.map((q, idx) => idx === i ? { ...q, _verifying: !q._verifying } : q));
  }

  // Runs the professor's solution against ALL test cases (visible + hidden —
  // the author sees everything). Verification passes only if every case
  // passes, which is what proves the AI's expected outputs are actually
  // correct for a working solution.
  async function runVerification(i) {
    const q = codings[i];
    setCodings(prev => prev.map((x, idx) => idx === i ? { ...x, _running: true } : x));
    const results = [];
    for (const tc of q.testCases) {
      const res = await executeCode({ language: q._language, code: q._solution, stdin: tc.input, timeoutMs: q.timeLimitMs || 5000 });
      const passed = res.status === 'success' && compareOutput(res.stdout, tc.expectedOutput);
      results.push({ passed, status: res.status, isHidden: tc.isHidden, actual: res.stdout, expected: tc.expectedOutput, message: res.message });
    }
    const allPassed = results.length > 0 && results.every(r => r.passed);
    setCodings(prev => prev.map((x, idx) => idx === i ? { ...x, _running: false, _runResults: results, verified: allPassed } : x));
  }

  function overrideVerification(i) {
    // Explicit professor override — recorded in the console log. The
    // question is still marked verified so publish is allowed, but the
    // professor is taking responsibility for the AI's test cases.
    const q = codings[i];
    if (!window.confirm('Override verification? You are marking these AI-generated test cases as correct without a passing solution. This is logged.')) return;
    console.warn(`[assessment] professor overrode verification for AI-generated coding question "${q.title}"`);
    setCodings(prev => prev.map((x, idx) => idx === i ? { ...x, verified: true, _overridden: true } : x));
  }

  function addCodingToAssessment(i) {
    const q = codings[i];
    if (!q.verified) return;
    onAddCoding({
      title: q.title,
      description: q.description,
      starterCode: q.starterCode,
      testCases: q.testCases.map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput, isHidden: !!tc.isHidden, points: tc.points })),
      allowedLanguages: q.allowedLanguages,
      timeLimitMs: q.timeLimitMs || 5000,
      // Provenance + verification survive to storage so the backend publish
      // guard is satisfied and the question is traceable as AI-authored.
      aiGenerated: true,
      verified: true
    });
    setCodings(prev => prev.map((x, idx) => idx === i ? { ...x, _added: true } : x));
  }

  return (
    <div className="card mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex justify-between items-center w-full"
      >
        <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider">Generate with AI</h3>
        <span className="text-[var(--color-text-tertiary)] text-sm">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {/* Generation inputs */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input
              type="text" placeholder="Subject (e.g. Data Structures)"
              value={subject} onChange={(e) => setSubject(e.target.value)}
              className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
            />
            <input
              type="text" placeholder="Topic (e.g. arrays)"
              value={topic} onChange={(e) => setTopic(e.target.value)}
              className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-sm focus:border-white focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Difficulty</span>
              <select
                value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-white text-sm focus:border-white focus:outline-none"
              >
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">MCQ</span>
              <input type="number" min={0} max={10} value={mcqCount}
                onChange={(e) => setMcqCount(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                className="w-16 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-white text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-secondary)]">Coding</span>
              <input type="number" min={0} max={5} value={codingCount}
                onChange={(e) => setCodingCount(Math.max(0, Math.min(5, parseInt(e.target.value) || 0)))}
                className="w-16 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-white text-sm" />
            </div>
            <button onClick={handleGenerate} disabled={generating} className="btn-primary text-sm ml-auto">
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>

          {error && <p className="text-sm mb-3" style={{ color: 'var(--color-accent-error)' }}>{error}</p>}
          {warnings && <p className="text-sm mb-3" style={{ color: '#ff9500' }}>{warnings}</p>}

          {/* MCQ review */}
          {mcqs.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Generated MCQs</p>
              <div className="space-y-3">
                {mcqs.map((q, i) => (
                  <div key={i} className="p-3 bg-[var(--color-bg-secondary)] rounded-lg space-y-2">
                    <textarea rows={2} value={q.question} onChange={(e) => updateMcq(i, 'question', e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm resize-none focus:border-white focus:outline-none" />
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input type="radio" checked={q.correctAnswer === oi} onChange={() => updateMcq(i, 'correctAnswer', oi)} />
                        <input type="text" value={opt} onChange={(e) => updateMcqOption(i, oi, e.target.value)}
                          className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-white text-sm focus:border-white focus:outline-none" />
                      </div>
                    ))}
                    <div className="flex justify-end">
                      {q._added ? (
                        <span className="text-xs text-[var(--color-text-tertiary)]">Added ✓</span>
                      ) : (
                        <button onClick={() => addMcqToAssessment(i)} className="btn-outline text-xs py-1.5 px-4">Add to Assessment</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coding review */}
          {codings.length > 0 && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Generated Coding Questions</p>
              <div className="space-y-4">
                {codings.map((q, i) => (
                  <div key={i} className="p-3 bg-[var(--color-bg-secondary)] rounded-lg space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <input type="text" value={q.title} onChange={(e) => updateCoding(i, 'title', e.target.value)}
                        className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm focus:border-white focus:outline-none" />
                      {q.verified ? (
                        <span className="text-xs px-2 py-1 rounded-md whitespace-nowrap" style={{ background: 'rgba(52,199,89,0.12)', color: '#34c759' }}>
                          {q._overridden ? 'Override ✓' : 'Verified ✓'}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-md whitespace-nowrap" style={{ background: 'rgba(255,149,0,0.12)', color: '#ff9500' }}>
                          ⚠ Unverified — test before publishing
                        </span>
                      )}
                    </div>
                    <textarea rows={2} value={q.description} onChange={(e) => updateCoding(i, 'description', e.target.value)}
                      className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-white text-sm resize-none focus:border-white focus:outline-none" />

                    {/* Test cases (editable) */}
                    <div className="space-y-2">
                      {q.testCases.map((tc, ti) => (
                        <div key={ti} className="grid grid-cols-2 gap-2">
                          <textarea rows={1} value={tc.input} placeholder="input"
                            onChange={(e) => updateTestCase(i, ti, 'input', e.target.value)}
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-white font-mono text-xs resize-none focus:border-white focus:outline-none" />
                          <div className="flex gap-1">
                            <textarea rows={1} value={tc.expectedOutput} placeholder="expected output"
                              onChange={(e) => updateTestCase(i, ti, 'expectedOutput', e.target.value)}
                              className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-white font-mono text-xs resize-none focus:border-white focus:outline-none" />
                            <span className="text-xs text-[var(--color-text-tertiary)] self-center whitespace-nowrap">{tc.isHidden ? 'hidden' : 'visible'} · {tc.points}p</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => toggleVerifying(i)} className="btn-outline text-xs py-1.5 px-4">
                        {q._verifying ? 'Hide verify panel' : 'Verify Now'}
                      </button>
                    </div>

                    {q._verifying && (
                      <div className="space-y-2 border-t border-[var(--color-border)] pt-3">
                        <div className="flex items-center gap-2">
                          {q.allowedLanguages.map(lang => (
                            <button key={lang} onClick={() => setLanguage(i, lang)}
                              className={`text-xs px-3 py-1 rounded-md border ${q._language === lang ? 'border-white' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}>
                              {lang}
                            </button>
                          ))}
                          <span className="text-xs text-[var(--color-text-tertiary)] ml-2">Paste a correct solution and run it against all generated test cases.</span>
                        </div>
                        <CodeEditor value={q._solution} onChange={(code) => setSolution(i, code)} disabled={q._running} />
                        <div className="flex gap-2">
                          <button onClick={() => runVerification(i)} disabled={q._running} className="btn-outline text-xs py-1.5 px-4">
                            {q._running ? 'Running...' : 'Run all test cases'}
                          </button>
                          <button onClick={() => overrideVerification(i)} className="text-xs py-1.5 px-4 text-[var(--color-text-tertiary)] hover:text-white">
                            Override (I vouch for these)
                          </button>
                        </div>
                        {q._runResults && (
                          <div className="space-y-1">
                            {q._runResults.map((r, ri) => (
                              <div key={ri} className="flex justify-between text-xs p-2 bg-[var(--color-surface)] rounded">
                                <span>Test {ri + 1} ({r.isHidden ? 'hidden' : 'visible'})</span>
                                <span style={{ color: r.passed ? '#34c759' : 'var(--color-accent-error)' }}>
                                  {r.status === 'timeout' ? 'Timed out' : r.status === 'error' ? 'Error' : r.passed ? 'Passed' : 'Failed'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end">
                      {q._added ? (
                        <span className="text-xs text-[var(--color-text-tertiary)]">Added ✓</span>
                      ) : (
                        <button
                          onClick={() => addCodingToAssessment(i)}
                          disabled={!q.verified}
                          className={`text-xs py-1.5 px-4 ${q.verified ? 'btn-outline' : 'btn-outline opacity-40 cursor-not-allowed'}`}
                          title={q.verified ? '' : 'Verify (or override) before adding'}
                        >
                          Add to Assessment
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
