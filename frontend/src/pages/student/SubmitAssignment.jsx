import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentAPI } from '../../services/api';
import Sidebar from '../../components/layout/Sidebar';
import LoadingDots from '../../components/common/LoadingDots';
import BlockchainAnimation from '../../components/common/BlockchainAnimation';

export default function SubmitAssignment() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState(null);
  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [useBlockchain, setUseBlockchain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    fetchAssignment();
  }, [assignmentId]);

  // Auto-save draft
  useEffect(() => {
    const interval = setInterval(() => {
      if (content || file) {
        setLastSaved(new Date());
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [content, file]);

  async function fetchAssignment() {
    try {
      const response = await studentAPI.getAssignmentById(assignmentId);
      setAssignment(response.data.assignment);
    } catch (err) {
      setError('Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e) {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      // Read file content
      const reader = new FileReader();
      reader.onload = (event) => {
        setContent(event.target.result);
      };
      reader.readAsText(droppedFile);
    }
  }

  function handleFileSelect(e) {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        setContent(event.target.result);
      };
      reader.readAsText(selectedFile);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!content.trim()) {
      setError('Please enter submission content');
      return;
    }

    setSubmitting(true);

    if (useBlockchain) {
      setVerifying(true);
      // Simulate blockchain verification
      await new Promise(resolve => setTimeout(resolve, 3000));
      setVerifying(false);
      setVerified(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      await studentAPI.submitAssignment({
        assignmentId,
        fileContent: content,
        fileName: file ? file.name : 'text_submission.txt',
        fileType: file ? file.name.substring(file.name.lastIndexOf('.')) : '.txt',
        submissionType: useBlockchain ? 'blockchain' : 'direct',
      });
      navigate('/student/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to submit assignment');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSaveDraft() {
    setLastSaved(new Date());
    // In real app, save to backend/localStorage
  }

  const daysRemaining = assignment ?
    Math.ceil((new Date(assignment.dueDate) - new Date()) / (1000 * 60 * 60 * 24)) :
    0;

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

  return (
    <div className="min-h-screen bg-black flex">
      <Sidebar role="student" />

      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 page-enter">
            <button
              onClick={() => navigate('/student/dashboard')}
              className="text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors flex items-center gap-1 mb-4"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to Dashboard
            </button>

            <h1 className="text-2xl font-semibold tracking-tight">
              Submit Assignment
            </h1>
            <p className="text-lg mt-1">{assignment?.title}</p>
            {assignment?.description && (
              <p className="text-sm mt-2 text-[var(--color-text-secondary)] mb-2 whitespace-pre-wrap">
                {assignment.description}
              </p>
            )}
            <p className={`text-sm mt-1 ${daysRemaining <= 2 ? 'text-[var(--color-accent-error)]' : 'text-[var(--color-text-tertiary)]'}`}>
              Due: {new Date(assignment?.dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })} ({daysRemaining} days remaining)
            </p>
          </div>

          <form onSubmit={handleSubmit} className="page-stagger">
            {/* File Upload */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                File Upload
              </label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="file-upload"
                onClick={() => document.getElementById('file-input').click()}
              >
                <input
                  id="file-input"
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".txt,.pdf,.doc,.docx,.cpp,.c,.java,.py,.js,.jsx,.ts,.tsx,.html,.css"
                />

                {file ? (
                  <div className="text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-[var(--color-text-tertiary)]">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 text-[var(--color-text-tertiary)]">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-[var(--color-text-secondary)]">
                      Drop file here or click to upload
                    </p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                      Supports: PDF, DOC, TXT, Code files
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                Content
              </label>
              <textarea
                required
                rows={12}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors resize-none font-mono text-sm"
                placeholder="Enter your submission content here..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Submission Method */}
            <div className="mb-6">
              <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">
                Submission Method
              </label>
              <div className="radio-group">
                <label
                  className={`radio-item ${!useBlockchain ? 'selected' : ''}`}
                  onClick={() => setUseBlockchain(false)}
                >
                  <div className="radio-circle" />
                  <span>Direct submission</span>
                </label>
                <label
                  className={`radio-item ${useBlockchain ? 'selected' : ''}`}
                  onClick={() => setUseBlockchain(true)}
                >
                  <div className="radio-circle" />
                  <span>Blockchain verification</span>
                </label>
              </div>
            </div>

            {/* Blockchain Animation */}
            {verifying && (
              <div className="card mb-6 text-center">
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  Verifying on chain
                </p>
                <BlockchainAnimation
                  isActive={true}
                  blockNumber={12345678}
                />
              </div>
            )}

            {verified && (
              <div className="card mb-6 text-center success-glow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-sm">Verified on chain</p>
              </div>
            )}

            {/* Draft saved info */}
            {lastSaved && (
              <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
                Draft saved {Math.floor((new Date() - lastSaved) / 60000)} minutes ago
              </p>
            )}

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
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleSaveDraft}
                className="btn-outline flex-1"
                disabled={submitting}
              >
                Save Draft
              </button>
              <button
                type="submit"
                disabled={submitting || !content.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? (
                  useBlockchain ? (
                    <LoadingDots text="Submitting..." />
                  ) : (
                    <LoadingDots text="" />
                  )
                ) : (
                  'Submit Assignment'
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
