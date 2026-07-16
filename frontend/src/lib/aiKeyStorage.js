// BYOK key storage — sessionStorage ONLY, never localStorage. sessionStorage
// clears automatically when the tab closes, so the key never survives a
// browser restart. Never sent anywhere except as the X-User-AI-Key header on
// evaluation requests (see services/api.js).
const KEY_STORAGE_KEY = 'copyzero_ai_key';
const PROVIDER_STORAGE_KEY = 'copyzero_ai_provider';

export function getStoredAIKey() {
  try {
    return sessionStorage.getItem(KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function getStoredAIProvider() {
  try {
    return sessionStorage.getItem(PROVIDER_STORAGE_KEY) || 'groq';
  } catch {
    return 'groq';
  }
}

export function setStoredAIKey(key, provider = 'groq') {
  try {
    sessionStorage.setItem(KEY_STORAGE_KEY, key);
    sessionStorage.setItem(PROVIDER_STORAGE_KEY, provider);
  } catch {
    // sessionStorage unavailable (private browsing etc.) — BYOK simply
    // won't be available this session, evaluation still falls back fine.
  }
}

export function clearStoredAIKey() {
  try {
    sessionStorage.removeItem(KEY_STORAGE_KEY);
    sessionStorage.removeItem(PROVIDER_STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function hasStoredAIKey() {
  return !!getStoredAIKey();
}

// Used by api.js to attach the header only on evaluation requests.
export function getUserAIKeyHeader() {
  const key = getStoredAIKey();
  return key ? { 'X-User-AI-Key': key } : {};
}
