const axios = require('axios');
const { HfInference } = require('@huggingface/inference');

// Single gateway all AI chat-completion calls go through: NIM (primary) →
// HuggingFace (fallback) → degraded heuristic response. Per-minute limits are
// buffered below the providers' actual free-tier ceilings (NIM ~40/min,
// HF ~30/min) so we back off before a 429 actually happens.
// Fallback behavior verified by temporarily setting NIM_LIMIT_PER_MIN = 1 and
// making 2 calls: 1st used NIM, 2nd logged the rate-limit fallback message
// and correctly attempted HuggingFace before degrading (no HF token
// configured locally). Limit restored to 35 afterward.
const NIM_LIMIT_PER_MIN = 35;
const HF_LIMIT_PER_MIN = 20;

const NIM_BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL = process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-flash';
const HF_MODEL = process.env.HUGGINGFACE_CONTENT_MODEL || 'HuggingFaceH4/zephyr-7b-beta';

// BYOK (Bring Your Own Key) format validation — shared by every controller
// that accepts an X-User-AI-Key header or the /api/ai/test-key endpoint.
// Reject anything that doesn't match rather than passing it through.
const GROQ_KEY_REGEX = /^gsk_[A-Za-z0-9]{50,}$/;
const NIM_KEY_REGEX = /^nvapi-[A-Za-z0-9_-]{30,}$/;

function isValidUserKey(provider, key) {
  if (typeof key !== 'string') return false;
  if (provider === 'groq') return GROQ_KEY_REGEX.test(key);
  if (provider === 'nim') return NIM_KEY_REGEX.test(key);
  return false;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function freshWindow() {
  return { callCount: 0, windowStart: Date.now(), totalCallsToday: 0, dayKey: todayKey() };
}

const usage = {
  nim: freshWindow(),
  huggingface: freshWindow()
};

function rollWindow(provider) {
  const u = usage[provider];
  const now = Date.now();
  if (now - u.windowStart >= 60 * 1000) {
    u.callCount = 0;
    u.windowStart = now;
  }
  const key = todayKey();
  if (u.dayKey !== key) {
    u.totalCallsToday = 0;
    u.dayKey = key;
  }
}

function canCall(provider, limit) {
  rollWindow(provider);
  return usage[provider].callCount < limit;
}

function recordCall(provider) {
  const u = usage[provider];
  u.callCount += 1;
  u.totalCallsToday += 1;
}

// Used by GET /api/health/ai — never include keys or raw errors here.
function getProviderStatus() {
  rollWindow('nim');
  rollWindow('huggingface');
  return {
    nim: {
      available: usage.nim.callCount < NIM_LIMIT_PER_MIN && !!process.env.NVIDIA_NIM_API_KEY,
      callsThisMinute: usage.nim.callCount,
      totalToday: usage.nim.totalCallsToday
    },
    huggingFace: {
      available: usage.huggingface.callCount < HF_LIMIT_PER_MIN && !!process.env.HUGGINGFACE_API_TOKEN,
      callsThisMinute: usage.huggingface.callCount,
      totalToday: usage.huggingface.totalCallsToday
    }
  };
}

// Testing only — not used by any request path.
function resetRateLimits() {
  usage.nim = freshWindow();
  usage.huggingface = freshWindow();
}

async function callNimRaw(messages, { maxTokens, temperature, userKey }) {
  const key = userKey || process.env.NVIDIA_NIM_API_KEY;
  if (!key) throw new Error('NVIDIA_NIM_API_KEY missing');
  const client = axios.create({
    baseURL: NIM_BASE_URL,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
  const { data } = await client.post('/chat/completions', {
    model: NIM_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false
  });
  return data.choices?.[0]?.message?.content || '';
}

// Used by POST /api/ai/test-key — never logs or returns the key.
async function testNimKey(key) {
  try {
    await callNimRaw([
      { role: 'system', content: 'Reply with only the word OK.' },
      { role: 'user', content: 'ping' }
    ], { maxTokens: 1, temperature: 0, userKey: key });
    return true;
  } catch (err) {
    console.error(`[AI] NIM test-key check failed (${err.response?.status || err.message})`);
    return false;
  }
}

async function callHfRaw(messages, { maxTokens, temperature }) {
  if (!process.env.HUGGINGFACE_API_TOKEN) throw new Error('HUGGINGFACE_API_TOKEN missing');
  const client = new HfInference(process.env.HUGGINGFACE_API_TOKEN);
  const r = await client.chatCompletion({
    model: HF_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature
  });
  return r.choices?.[0]?.message?.content || '';
}

/**
 * Unified entry point for every AI chat-completion call in the app.
 * Tries NIM, falls back to HuggingFace on timeout/429/5xx/missing key/rate
 * limit, and falls back to a degraded flag (never throws) if both are
 * unavailable. Provider errors are logged server-side only — callers must
 * never forward err.message/stack to an HTTP response.
 */
async function callAI(messages, options = {}) {
  const { maxTokens = 800, temperature = 0.2, userKey = null, userKeyProvider = null } = options;

  // BYOK: a validated user-supplied key bypasses our rate limiting entirely
  // (it's their quota, not ours) and is used for this call only — nothing is
  // stored or logged beyond a boolean.
  if (userKey && userKeyProvider === 'nim') {
    console.log('[AI] user-provided key used: true (nim)');
    try {
      const content = await callNimRaw(messages, { maxTokens, temperature, userKey });
      return { content, provider: 'nim', degraded: false, userKeyUsed: true };
    } catch (err) {
      console.error(`[AI] NIM call with user-provided key failed (${err.response?.status || err.message})`);
      return { content: null, provider: 'degraded', degraded: true, reason: 'user_key_failed' };
    }
  }

  if (canCall('nim', NIM_LIMIT_PER_MIN)) {
    recordCall('nim');
    try {
      const content = await callNimRaw(messages, { maxTokens, temperature });
      return { content, provider: 'nim', degraded: false };
    } catch (err) {
      console.error(`[AI] NIM call failed (${err.response?.status || err.code || err.message}), falling back to HuggingFace`);
    }
  } else {
    console.log('[AI] NIM rate limit reached, falling back to HuggingFace');
  }

  if (canCall('huggingface', HF_LIMIT_PER_MIN)) {
    recordCall('huggingface');
    try {
      const content = await callHfRaw(messages, { maxTokens, temperature });
      return { content, provider: 'huggingface', degraded: false };
    } catch (err) {
      console.error(`[AI] HuggingFace call failed (${err.message}) — no providers available`);
    }
  } else {
    console.log('[AI] HuggingFace rate limit also reached — no providers available');
  }

  console.error('[AI] All providers unavailable or rate-limited — returning degraded response');
  return { content: null, provider: 'degraded', degraded: true, reason: 'all_providers_rate_limited' };
}

module.exports = {
  callAI,
  getProviderStatus,
  resetRateLimits,
  isValidUserKey,
  testNimKey,
  GROQ_KEY_REGEX,
  NIM_KEY_REGEX,
  NIM_LIMIT_PER_MIN,
  HF_LIMIT_PER_MIN
};
