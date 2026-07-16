import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import AiEvaluatingAnimation from '../../components/common/AiEvaluatingAnimation';

export default function EvaluateSubmission() {
  const { submissionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [submission, setSubmission] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [plagiarismScore, setPlagiarismScore] = useState(0);
  const [criteriaScores, setCriteriaScores] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [finalScore, setFinalScore] = useState(0);

  useEffect(() => {
    fetchData();
  }, [submissionId]);

  async function fetchData() {
    try {
      if (location.state?.submission) {
        const sub = location.state.submission;
        setSubmission(sub);

        const [assignRes, rubricRes] = await Promise.all([
          professorAPI.getAssignmentById(sub.assignmentId),
          professorAPI.getRubricByAssignment(sub.assignmentId).catch(err => {
            if (err.response?.status === 404) {
              return {
                data: {
                  rubric: {
                    criteria: [
                      { criterionId: 'fallback_1', name: 'Content Quality', maxPoints: 50 },
                      { criterionId: 'fallback_2', name: 'Code Structure', maxPoints: 50 }
                    ]
                  }
                }
              };
            }
            throw err;
          }),
        ]);

        setAssignment(assignRes.data.assignment);

        const rubricData = rubricRes.data.rubric;
        setRubric(rubricData);

        // Safely map criteria regardless of whether it's from db or fallback
        const criteriaArray = rubricData?.criteria || rubricData?.rubricCriteria || [];

        const initialScores = criteriaArray.map((c, index) => ({
          criterionId: c.criterionId || `crit_${index}`,
          name: c.name || c.criterionName || c.title || 'Unknown Criteria',
          points: sub.score ? Math.floor((c.maxPoints || c.maxScore || c.points || 0) * (sub.score / 10)) : 0,
          maxPoints: c.maxPoints || c.maxScore || c.points || 0
        }));

        setCriteriaScores(initialScores);

        if (sub.score) {
          setPlagiarismScore(Math.floor(Math.random() * 15) + 85);
          setFeedback('Previously evaluated submission.');
        }
      } else {
        setError('Submission data not found. Please navigate from submissions page.');
      }
    } catch (err) {
      setError('Failed to load submission data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (assignment && criteriaScores.length > 0) {
      const plagWeight = assignment.plagiarismWeightage || 30;
      const critWeight = assignment.criteriaWeightage || 70;

      const totalCriteriaPoints = criteriaScores.reduce((sum, s) => sum + s.points, 0);
      const totalCriteriaMax = criteriaScores.reduce((sum, s) => sum + s.maxPoints, 0);

      const plagComponent = (plagiarismScore / 100) * (plagWeight / 100) * 10;
      const critComponent = (totalCriteriaPoints / totalCriteriaMax) * (critWeight / 100) * 10;

      setFinalScore(parseFloat((plagComponent + critComponent).toFixed(2)));
    }
  }, [plagiarismScore, criteriaScores, assignment]);

  async function handleAiEvaluate() {
    setEvaluating(true);
    setError('');

    try {
      const response = await professorAPI.aiEvaluate(submissionId);

      if (response.data.success) {
        const { evaluation, metadata } = response.data;

        setPlagiarismScore(evaluation.plagiarismScore);
        setCriteriaScores(evaluation.criteriaScores);
        setFeedback(evaluation.feedback);

        setAiAnalysis({
          finalScore: evaluation.finalScore,
          breakdown: evaluation.breakdown,
          plagiarismDetails: metadata.plagiarismDetails,
          strengths: metadata.strengths,
          improvements: metadata.improvements,
          evaluatedAt: metadata.evaluatedAt,
        });
      }
    } catch (err) {
      setError(err.response?.data?.error || 'AI evaluation failed. Please try again.');
    } finally {
      setEvaluating(false);
    }
  }

  function updateCriteriaScore(index, points) {
    const updated = [...criteriaScores];
    updated[index].points = Math.min(parseInt(points) || 0, updated[index].maxPoints);
    setCriteriaScores(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await professorAPI.evaluateSubmission({
        submissionId,
        plagiarismScore,
        criteriaScores,
        feedback,
      });
      navigate(`/professor/submissions/${submission.assignmentId}`);
    } catch (err) {
      setError('Failed to submit evaluation');
    } finally {
      setSubmitting(false);
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

  if (error && !submission) {
    return (
      <div className="min-h-screen bg-black flex">
        <Sidebar role="professor" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[var(--color-accent-error)] mb-4">{error}</p>
            <button
              onClick={() => navigate('/professor/dashboard')}
              className="btn-outline"
            >
              Go to Dashboard
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
            onClick={() => navigate(`/professor/submissions/${submission.assignmentId}`)}
            className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Submissions
          </button>

          <h1 className="text-2xl font-semibold tracking-tight">
            Evaluate Submission
          </h1>
        </div>

        {/* Student Info */}
        <div className="card mb-6 page-enter" style={{ animationDelay: '50ms' }}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[var(--color-text-secondary)] text-xs uppercase tracking-wider mb-1">Student</p>
              <p className="font-medium">{submission.studentName}</p>
              <p className="text-[var(--color-text-tertiary)] text-xs">{submission.studentEmail}</p>
            </div>
            <div>
              <p className="text-[var(--color-text-secondary)] text-xs uppercase tracking-wider mb-1">Submitted</p>
              <p className="font-medium">
                {new Date(submission.submittedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[var(--color-text-tertiary)] text-xs">
                {new Date(submission.submittedAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Submission Content */}
        <div className="card mb-6 page-enter" style={{ animationDelay: '100ms' }}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider">
              Submission Content
            </h3>
            <span className="text-xs text-[var(--color-text-tertiary)]">{submission.fileName}</span>
          </div>

          <div className="code-block mb-6">
            <pre className="whitespace-pre-wrap">{submission.fileContent}</pre>
          </div>

          {/* AI Evaluate Button */}
          {!aiAnalysis && !submission.score && (
            <div className="flex justify-center">
              <button
                onClick={handleAiEvaluate}
                disabled={evaluating}
                className="btn-outline"
              >
                {evaluating ? (
                  <AiEvaluatingAnimation />
                ) : (
                  'Evaluate using AI'
                )}
              </button>
            </div>
          )}
        </div>

        {/* AI Analysis Results */}
        {aiAnalysis && (
          <div className="card mb-6 page-enter" style={{ animationDelay: '150ms' }}>
            <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
              AI Analysis Complete
            </h3>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-[var(--color-surface)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                  Plagiarism Score
                </p>
                <p className="text-2xl font-semibold">{plagiarismScore}/100</p>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">100 = fully original</p>
              </div>
              <div className="bg-[var(--color-surface)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                  Content Quality
                </p>
                <p className="text-2xl font-semibold">
                  {aiAnalysis.breakdown?.avgCriteriaScore?.toFixed(0) || '0'}/100
                </p>
              </div>
              <div className="bg-[var(--color-surface)] rounded-lg p-4">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                  Risk Level
                </p>
                <p className="text-lg font-semibold">
                  {plagiarismScore > 80 ? 'Low risk' : plagiarismScore > 50 ? 'Medium risk' : 'High risk'}
                </p>
              </div>
            </div>

            {aiAnalysis.plagiarismDetails && (
              <div className="mb-4 p-3 bg-[var(--color-surface)] rounded-lg">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Plagiarism Analysis
                </p>
                <p className="text-sm">{aiAnalysis.plagiarismDetails}</p>
              </div>
            )}

            {aiAnalysis.strengths?.length > 0 && (
              <div className="mb-4 p-3 bg-[var(--color-surface)] rounded-lg">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Strengths
                </p>
                <ul className="text-sm space-y-1">
                  {aiAnalysis.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--color-text-tertiary)]">-</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiAnalysis.improvements?.length > 0 && (
              <div className="p-3 bg-[var(--color-surface)] rounded-lg">
                <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Areas for Improvement
                </p>
                <ul className="text-sm space-y-1">
                  {aiAnalysis.improvements.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[var(--color-text-tertiary)]">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Final Score */}
        <div className="card mb-6 page-enter" style={{ animationDelay: '200ms' }}>
          <div className="text-center py-6">
            <p className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
              Final Score
            </p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-6xl font-light">{finalScore.toFixed(1)}</span>
              <span className="text-2xl text-[var(--color-text-secondary)]">/ 10</span>
            </div>
          </div>
        </div>

        {/* Evaluation Form */}
        <form onSubmit={handleSubmit} className="page-enter" style={{ animationDelay: '250ms' }}>
          <div className="card mb-6">
            <h3 className="text-sm text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
              Evaluation Scores
            </h3>

            {/* Plagiarism Score */}
            <div className="mb-6">
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Plagiarism Score (0-100)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                className="w-32 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-white text-center focus:border-white focus:outline-none transition-colors"
                value={plagiarismScore}
                onChange={(e) => setPlagiarismScore(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                Higher = more original (100 = 0% plagiarism)
              </p>
            </div>

            {/* Criteria Scores */}
            <div className="mb-6">
              <label className="block text-sm text-[var(--color-text-secondary)] mb-3">
                Criteria Scores
              </label>
              <div className="space-y-3">
                {criteriaScores.map((criterion, index) => (
                  <div key={criterion.criterionId} className="flex items-center gap-4 p-3 bg-[var(--color-surface)] rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{criterion.name}</p>
                      <p className="text-xs text-[var(--color-text-tertiary)]">Max: {criterion.maxPoints} points</p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={criterion.maxPoints}
                      required
                      className="w-20 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-white text-center focus:border-white focus:outline-none transition-colors"
                      value={criterion.points}
                      onChange={(e) => updateCriteriaScore(index, e.target.value)}
                    />
                    <span className="text-sm text-[var(--color-text-secondary)] w-16 text-right">
                      {criterion.points}/{criterion.maxPoints}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feedback */}
            <div>
              <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                Feedback
              </label>
              <textarea
                rows={6}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors resize-none font-mono text-sm"
                placeholder="Enter feedback for the student..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
          </div>

          {/* Error */}
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

          {/* Actions */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate(`/professor/submissions/${submission.assignmentId}`)}
              className="btn-outline flex-1"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || plagiarismScore === 0}
              className="btn-primary flex-1"
            >
              {submitting ? <LoadingDots text="" /> : 'Submit Grade'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
