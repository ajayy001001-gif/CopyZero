import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { professorAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';

export default function CreateAssignment() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('code');
  const [dueDate, setDueDate] = useState('');
  const [plagiarismWeightage, setPlagiarismWeightage] = useState(30);
  const [criteriaWeightage, setCriteriaWeightage] = useState(70);
  const [criteria, setCriteria] = useState([
    { id: '1', name: 'Content Quality', points: 50 },
    { id: '2', name: 'Code Structure', points: 50 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const totalPoints = criteria.reduce((sum, c) => sum + c.points, 0);
  const isValid = totalPoints === 100;

  function addCriterion() {
    setCriteria([...criteria, {
      id: Date.now().toString(),
      name: '',
      points: 10
    }]);
  }

  function updateCriterion(id, field, value) {
    setCriteria(criteria.map(c =>
      c.id === id ? { ...c, [field]: field === 'points' ? parseInt(value) || 0 : value } : c
    ));
  }

  function removeCriterion(id) {
    setCriteria(criteria.filter(c => c.id !== id));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!isValid) {
      setError(`Rubric total must be 100 points (currently: ${totalPoints})`);
      return;
    }

    setLoading(true);

    try {
      const assignmentRes = await professorAPI.createAssignment({
        title,
        description,
        type,
        dueDate,
        plagiarismWeightage,
        criteriaWeightage,
      });

      const newAssignmentId = assignmentRes.data.assignment.id;

      await professorAPI.createRubric({
        assignmentId: newAssignmentId,
        criteria: criteria.map(c => ({ name: c.name, maxPoints: c.points })),
      });

      navigate('/professor/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="professor" />

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 page-enter">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create Assignment
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="page-stagger">
            {/* Title */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Assignment Title
              </label>
              <input
                type="text"
                required
                className="input-underline"
                placeholder="Enter assignment title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Description */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Description
              </label>
              <textarea
                required
                rows={4}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors resize-none"
                placeholder="Enter assignment description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Type Toggle */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Assignment Type
              </label>
              <div className="flex bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden w-fit">
                <button
                  type="button"
                  onClick={() => setType('code')}
                  className={`px-6 py-2 text-sm font-medium transition-colors ${type === 'code'
                    ? 'bg-white text-black'
                    : 'text-[var(--color-text-secondary)] hover:text-white'
                    }`}
                  disabled={loading}
                >
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => setType('essay')}
                  className={`px-6 py-2 text-sm font-medium transition-colors ${type === 'essay'
                    ? 'bg-white text-black'
                    : 'text-[var(--color-text-secondary)] hover:text-white'
                    }`}
                  disabled={loading}
                >
                  Essay
                </button>
              </div>
            </div>

            <div className="section-divider" />

            {/* Due Date & Weightages */}
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Due Date
                </label>
                <input
                  type="date"
                  required
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-3 text-white focus:border-white focus:outline-none transition-colors"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={loading}
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                  Weightages
                </label>
                <div className="relative pt-1 mt-1">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Plagiarism: <span className="text-white">{plagiarismWeightage}%</span>
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Criteria: <span className="text-white">{criteriaWeightage}%</span>
                    </span>
                  </div>
                  <div className="relative h-3 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                    <div
                      className="absolute top-0 left-0 h-full transition-all duration-200"
                      style={{ width: `${plagiarismWeightage}%`, backgroundColor: '#ff4d4f' }}
                    />
                    <div
                      className="absolute top-0 right-0 h-full transition-all duration-200"
                      style={{ width: `${criteriaWeightage}%`, backgroundColor: '#4ade80' }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={plagiarismWeightage}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setPlagiarismWeightage(val);
                      setCriteriaWeightage(100 - val);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={loading}
                    title="Drag to adjust split"
                  />
                </div>
              </div>
            </div>

            <div className="section-divider" />

            {/* Rubric Criteria */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <label className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Rubric Criteria
                </label>
                <span className={`text-sm ${isValid ? 'text-white' : 'text-[var(--color-accent-error)]'}`}>
                  Total: {totalPoints}/100
                </span>
              </div>

              <div className="space-y-3">
                {criteria.map((criterion, index) => (
                  <div
                    key={criterion.id}
                    className="flex gap-3 items-center"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <span className="text-sm text-[var(--color-text-tertiary)] w-6">
                      {index + 1}.
                    </span>
                    <input
                      type="text"
                      required
                      className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors"
                      placeholder="Criterion name"
                      value={criterion.name}
                      onChange={(e) => updateCriterion(criterion.id, 'name', e.target.value)}
                      disabled={loading}
                    />
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      className="w-24 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 text-sm text-white text-center focus:border-white focus:outline-none transition-colors"
                      value={criterion.points}
                      onChange={(e) => updateCriterion(criterion.id, 'points', e.target.value)}
                      disabled={loading}
                    />
                    <span className="text-sm text-[var(--color-text-secondary)]">pts</span>
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(criterion.id)}
                        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-error)] transition-colors"
                        disabled={loading}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCriterion}
                className="mt-4 w-full py-3 border border-dashed border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text-secondary)] hover:border-white hover:text-white transition-colors"
                disabled={loading}
              >
                + Add Criterion
              </button>
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-6 p-4 rounded-lg border"
                style={{
                  borderColor: 'var(--color-accent-error)',
                  background: 'rgba(255, 59, 48, 0.05)',
                  animation: 'shake 300ms ease-out'
                }}
              >
                <p className="text-sm" style={{ color: 'var(--color-accent-error)' }}>
                  {error}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/professor/dashboard')}
                className="btn-outline flex-1"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !isValid}
                className="btn-primary flex-1"
              >
                {loading ? <LoadingDots text="" /> : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
