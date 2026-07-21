import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import EventTimeline from '../../components/proctoring/EventTimeline';

const RISK_COLOR = { low: '#34c759', medium: '#ff9500', high: '#ff3b30' };

function IntegrityPanel({ integrity }) {
  if (!integrity) {
    return <p className="text-xs text-[var(--color-text-tertiary)]">No integrity score computed for this attempt.</p>;
  }
  const s = integrity.signals || {};
  const color = RISK_COLOR[integrity.riskLevel] || 'var(--color-text-secondary)';
  const isHeuristic = integrity.isHeuristic || integrity.scoringProvider === 'heuristic';
  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div>
          <span className="text-2xl font-light">{integrity.overallScore}</span>
          <span className="text-sm text-[var(--color-text-tertiary)]">/100</span>
        </div>
        <span className="text-xs px-2 py-1 rounded-md" style={{ background: `${color}22`, color }}>
          {integrity.riskLevel} risk
        </span>
        {isHeuristic && (
          <span className="text-xs px-2 py-1 rounded-md border border-[var(--color-border)] text-[var(--color-text-tertiary)] bg-[var(--color-surface)]">
            Score calculated using basic heuristic fallback (AI service unavailable)
          </span>
        )}
      </div>
      {integrity.explanation && (
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">{integrity.explanation}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Signal label="Tab switches" value={s.tabSwitchCount} />
        <Signal label="Focus loss" value={s.browserFocusLossCount} />
        <Signal label="Copy attempts" value={s.copyAttemptCount} />
        <Signal label="Paste attempts" value={s.pasteAttemptCount} />
        <Signal label="Fullscreen exits" value={s.fullscreenExitCount} />
        <Signal label="Idle %" value={s.idleTimePercent} />
        <Signal label="No-face checks" value={s.webcamNoFaceCount} flag={s.webcamNoFaceCount > 0} />
        <Signal label="Multi-face checks" value={s.webcamMultipleFacesCount} flag={s.webcamMultipleFacesCount > 0} />
        <Signal label="Screen-share stops" value={s.screenShareStoppedCount} flag={s.screenShareStoppedCount > 0} />
      </div>
      {integrity.testResultPlausibility && integrity.testResultPlausibility.consistent === false && (
        <p className="text-xs mt-3" style={{ color: '#ff3b30' }}>
          ⚠ Coding test-result plausibility flagged: {integrity.testResultPlausibility.concern || 'code logic may not match claimed results'}
        </p>
      )}
    </div>
  );
}

function Signal({ label, value, flag }) {
  return (
    <div className="p-2 bg-[var(--color-surface)] rounded-md">
      <p className="text-[var(--color-text-tertiary)]">{label}</p>
      <p style={{ color: flag ? '#ff3b30' : undefined }}>{value ?? 0}</p>
    </div>
  );
}

export default function AssessmentResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchResults() {
    try {
      const res = await professorAPI.getAssessmentSubmissions(id);
      setTitle(res.data.assessmentTitle || 'Assessment');
      setSubmissions(res.data.submissions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="professor" />
        <main className="flex-1 flex items-center justify-center">
          <LoadingDots text="Loading results..." />
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

          <h1 className="text-2xl font-semibold tracking-tight mb-1">Results</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mb-8">{title}</p>

          {error && (
            <div className="mb-6 p-4 rounded-lg border" style={{ borderColor: 'var(--color-accent-error)', background: 'rgba(255, 59, 48, 0.05)' }}>
              <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>{error}</p>
            </div>
          )}

          {submissions.length === 0 ? (
            <div className="card text-center py-16">
              <p className="text-[var(--color-text-secondary)]">No attempts yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map(sub => {
                const isOpen = expanded === sub.id;
                const inProgress = sub.status === 'in_progress';
                return (
                  <div key={sub.id} className="card">
                    <button
                      onClick={() => setExpanded(isOpen ? null : sub.id)}
                      className="w-full flex justify-between items-center text-left"
                    >
                      <div>
                        <p className="font-medium">{sub.studentName}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {inProgress ? 'In progress' : `Submitted ${sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : ''}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        {!inProgress && (
                          <div className="flex items-center gap-4 text-sm text-right">
                            <div>
                              <p className="text-[var(--color-text-tertiary)] text-xs">MCQ</p>
                              <p>{sub.mcqScore ?? 0}/{sub.mcqMaxScore ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-[var(--color-text-tertiary)] text-xs">Coding</p>
                              <p>{sub.codingScore ?? 0}/{sub.codingMaxScore ?? 0}</p>
                            </div>
                            <div>
                              <p className="text-[var(--color-text-tertiary)] text-xs">Total</p>
                              <p className="text-lg font-light">{sub.totalScore ?? 0}</p>
                            </div>
                          </div>
                        )}
                        {sub.integrityScore && (
                          <span
                            className="text-xs px-2 py-1 rounded-md whitespace-nowrap"
                            style={{
                              background: `${RISK_COLOR[sub.integrityScore.riskLevel] || '#8e8e93'}22`,
                              color: RISK_COLOR[sub.integrityScore.riskLevel] || '#8e8e93'
                            }}
                          >
                            integrity {sub.integrityScore.overallScore}
                          </span>
                        )}
                        <span className="text-[var(--color-text-tertiary)]">{isOpen ? '−' : '+'}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-6">
                        {/* Coding per-question breakdown */}
                        {sub.codingDetails?.length > 0 && (
                          <div>
                            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Coding breakdown</p>
                            <div className="space-y-2">
                              {sub.codingDetails.map((d, i) => (
                                <div key={i} className="flex justify-between text-sm p-2 bg-[var(--color-surface)] rounded">
                                  <span>Question {i + 1} {d.attempted === false && <span className="text-[var(--color-text-tertiary)]">(not attempted)</span>}</span>
                                  <span>
                                    {d.pointsAwarded ?? 0}/{d.maxPoints ?? 0}
                                    {typeof d.passedCount === 'number' && (
                                      <span className="text-[var(--color-text-tertiary)]"> · {d.passedCount}/{d.totalTestCases} tests</span>
                                    )}
                                    {d.testResultPlausibility?.consistent === false && (
                                      <span style={{ color: '#ff3b30' }}> · ⚠ flagged</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Integrity */}
                        <div>
                          <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Integrity</p>
                          <IntegrityPanel integrity={sub.integrityScore} />
                        </div>

                        {/* Proctoring timeline + evidence (reused component) */}
                        <div>
                          <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Proctoring Timeline</p>
                          <EventTimeline submissionId={sub.id} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
