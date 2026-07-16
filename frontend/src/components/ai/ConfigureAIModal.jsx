import { useEffect, useState } from 'react';
import { aiAPI } from '../../services/api';
import {
  getStoredAIKey,
  setStoredAIKey,
  clearStoredAIKey,
  hasStoredAIKey,
} from '../../lib/aiKeyStorage';

// BYOK only — there is no platform-funded Groq key. AI evaluation (and the
// AI-assisted integrity score) simply won't run without a key configured
// here; the rest of the app works fine without one.
export default function ConfigureAIModal({ open, onClose, onStatusChange }) {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { valid, error }
  const [saved, setSaved] = useState(hasStoredAIKey());

  useEffect(() => {
    if (!open) return;
    setKeyInput(getStoredAIKey());
    setTestResult(null);
  }, [open]);

  async function handleTestConnection() {
    if (!keyInput.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const response = await aiAPI.testKey('groq', keyInput.trim());
      if (response.data.valid) {
        setStoredAIKey(keyInput.trim(), 'groq');
        setSaved(true);
        setTestResult({ valid: true });
        onStatusChange?.(true);
      } else {
        setTestResult({ valid: false, error: 'Key rejected by Groq' });
      }
    } catch (err) {
      setTestResult({ valid: false, error: err.response?.data?.error || 'Could not verify key' });
    } finally {
      setTesting(false);
    }
  }

  function handleRemoveKey() {
    clearStoredAIKey();
    setKeyInput('');
    setSaved(false);
    setTestResult(null);
    onStatusChange?.(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-semibold">Configure AI</h2>
          <button onClick={onClose} className="text-[var(--color-text-tertiary)] hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
        >
          AI evaluation requires your own Groq API key — this site does not
          use a shared platform key. Get a free key at{' '}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="link">
            console.groq.com/keys
          </a>.
        </div>

        <div className="mb-4">
          <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Groq API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_..."
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-4 py-2 pr-16 text-white placeholder-[var(--color-text-tertiary)] focus:border-white focus:outline-none transition-colors font-mono text-sm"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-tertiary)] hover:text-white"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
          Your key is only stored in this browser tab and never sent to our servers
          except to make AI calls. It clears when you close the tab.
        </p>

        <button
          onClick={handleTestConnection}
          disabled={testing || !keyInput.trim()}
          className="btn-outline w-full text-sm py-2 mb-2"
        >
          {testing ? 'Testing...' : 'Test connection'}
        </button>

        {testResult && (
          <p
            className="text-sm mb-2"
            style={{ color: testResult.valid ? 'var(--color-accent-success, #34c759)' : 'var(--color-accent-error)' }}
          >
            {testResult.valid ? 'AI ready — key verified' : testResult.error}
          </p>
        )}

        {saved && (
          <div className="flex items-center gap-2 mt-3">
            <span className="w-2 h-2 rounded-full" style={{ background: '#34c759' }} />
            <span className="text-sm text-[var(--color-text-secondary)]">AI ready (your key)</span>
            <button
              onClick={handleRemoveKey}
              className="link text-xs ml-auto"
            >
              Remove key
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
