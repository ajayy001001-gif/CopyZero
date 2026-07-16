import { useEffect, useState } from 'react';
import { aiAPI } from '../../services/api';
import {
  getStoredAIKey,
  setStoredAIKey,
  clearStoredAIKey,
  hasStoredAIKey,
} from '../../lib/aiKeyStorage';

export default function ConfigureAIModal({ open, onClose, onStatusChange }) {
  const [provider, setProvider] = useState('groq');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { valid, error }
  const [saved, setSaved] = useState(hasStoredAIKey());
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    if (!open) return;
    setKeyInput(getStoredAIKey());
    setTestResult(null);
    fetchQuota();
  }, [open]);

  async function fetchQuota() {
    try {
      const response = await aiAPI.getHealth();
      setQuota(response.data.groq);
    } catch {
      setQuota(null);
    }
  }

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

  function handleUsePlatformKey() {
    clearStoredAIKey();
    setKeyInput('');
    setSaved(false);
    setTestResult(null);
    onStatusChange?.(false);
  }

  if (!open) return null;

  const quotaPercent = quota ? Math.round((quota.callsThisMinute / quota.limitPerMin) * 100) : 0;
  const quotaBusy = quota && quotaPercent > 80;

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

        {quota && (
          <div className="mb-4 text-xs text-[var(--color-text-secondary)]">
            Platform AI: {quota.callsThisMinute}/{quota.limitPerMin} calls used this minute
          </div>
        )}

        {quotaBusy && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{ background: 'rgba(255, 204, 0, 0.08)', border: '1px solid rgba(255, 204, 0, 0.3)', color: '#e6b800' }}
          >
            Platform AI is busy — paste your own Groq key below for instant evaluation.
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
            Provider
          </label>
          <div className="radio-group">
            <label
              className={`radio-item ${provider === 'groq' ? 'selected' : ''}`}
              onClick={() => setProvider('groq')}
            >
              <div className="radio-circle" />
              <span>Groq (your key)</span>
            </label>
            <label
              className={`radio-item ${provider === 'platform' ? 'selected' : ''}`}
              onClick={() => { setProvider('platform'); handleUsePlatformKey(); }}
            >
              <div className="radio-circle" />
              <span>Use platform key (limited)</span>
            </label>
          </div>
        </div>

        {provider === 'groq' && (
          <>
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
                  onClick={handleUsePlatformKey}
                  className="link text-xs ml-auto"
                >
                  Remove key
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
