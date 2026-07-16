const axios = require('axios');
const { callAI } = require('./aiProviderService');

// Question GENERATION provider chain — deliberately separate from the
// NIM/HF EVALUATION chain in aiProviderService. Generation prefers Groq
// (user's own key first, then a configured platform key with per-minute
// rate limiting), and only falls back to NIM/HF (via aiProviderService's
// callAI) when Groq is unavailable/rate-limited. Generation and evaluation
// can therefore run on entirely different providers.
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Buffered below Groq's free-tier ceiling (~30/min) so we back off before a
// real 429. Only the PLATFORM key is rate-limited here; a user's own key is
// their quota and bypasses this, exactly like the BYOK evaluation path.
const GROQ_GEN_LIMIT_PER_MIN = parseInt(process.env.GROQ_GEN_LIMIT_PER_MIN || '15', 10);

const MAX_TEXT_LEN = 1000;   // question / description
const MAX_OPTION_LEN = 500;  // mirrors assessmentController MAX_OPTION_LEN
const MAX_FIELD_LEN = 2000;  // test-case IO / starter code — same DoS cap used elsewhere
const MAX_TITLE_LEN = 200;
const DEFAULT_CODING_TOTAL_POINTS = 100;

const groqUsage = { callCount: 0, windowStart: Date.now() };

function rollGroqWindow() {
  if (Date.now() - groqUsage.windowStart >= 60 * 1000) {
    groqUsage.callCount = 0;
    groqUsage.windowStart = Date.now();
  }
}
function canCallPlatformGroq() {
  rollGroqWindow();
  return groqUsage.callCount < GROQ_GEN_LIMIT_PER_MIN;
}
function recordPlatformGroqCall() {
  groqUsage.callCount += 1;
}

// No DOMPurify in this codebase (and it needs jsdom server-side) — the
// established defense here is React's default escaping plus server-side
// type/length validation. We additionally strip any HTML tags from
// AI-generated text so nothing tag-shaped is ever stored, then the existing
// assessmentController normalize functions re-apply the same length caps on
// save. Never rendered via dangerouslySetInnerHTML.
function stripHtml(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').trim();
}

function extractJsonArray(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in AI response');
  return JSON.parse(match[0]);
}

async function callGroqRaw(messages, { maxTokens, temperature, apiKey }) {
  const client = axios.create({
    baseURL: GROQ_BASE_URL,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 45000
  });
  const { data } = await client.post('/chat/completions', {
    model: GROQ_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false
  });
  return data.choices?.[0]?.message?.content || '';
}

// Returns { content, provider }. userKey is assumed already format-validated
// by the controller (same X-User-AI-Key check as the evaluation flow).
async function callGenerationAI(messages, { userKey = null, maxTokens = 3000, temperature = 0.4 } = {}) {
  // 1) User's own Groq key — their quota, no platform rate limit.
  if (userKey) {
    try {
      const content = await callGroqRaw(messages, { maxTokens, temperature, apiKey: userKey });
      console.log('[Gen] used Groq (user key)');
      return { content, provider: 'groq' };
    } catch (err) {
      console.error(`[Gen] Groq (user key) failed (${err.response?.status || err.message}), falling back to NIM/HF`);
    }
  } else if (process.env.GROQ_API_KEY && canCallPlatformGroq()) {
    // 2) Platform Groq key, rate-limited per minute.
    recordPlatformGroqCall();
    try {
      const content = await callGroqRaw(messages, { maxTokens, temperature, apiKey: process.env.GROQ_API_KEY });
      console.log('[Gen] used Groq (platform key)');
      return { content, provider: 'groq' };
    } catch (err) {
      console.error(`[Gen] Groq (platform key) failed (${err.response?.status || err.message}), falling back to NIM/HF`);
    }
  } else {
    console.log('[Gen] Groq unavailable or rate-limited, using NIM/HF fallback');
  }

  // 3) Fall back to the existing NIM→HF chain — reuse callAI, no separate path.
  const result = await callAI(messages, { maxTokens, temperature });
  if (result.degraded || !result.content) {
    throw new Error('All generation providers unavailable');
  }
  console.log(`[Gen] used ${result.provider} (fallback)`);
  return { content: result.content, provider: result.provider };
}

// ── MCQ ────────────────────────────────────────────────────────────────────
function validateMcq(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = stripHtml(raw.question).slice(0, MAX_TEXT_LEN);
  if (!question) return null;

  if (!Array.isArray(raw.options) || raw.options.length !== 4) return null;
  const options = raw.options.map(o => stripHtml(o).slice(0, MAX_OPTION_LEN));
  if (options.some(o => !o)) return null;
  const lower = options.map(o => o.toLowerCase());
  if (new Set(lower).size !== 4) return null; // no duplicates

  const correctAnswer = raw.correctAnswer;
  if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) return null;

  return {
    question,
    options,
    correctAnswer,
    explanation: stripHtml(raw.explanation).slice(0, MAX_TEXT_LEN),
    points: 10
  };
}

function mcqPrompt(subject, topic, difficulty, count, stricter) {
  const base = `Generate ${count} multiple-choice question(s) on the subject "${subject}", topic "${topic}", at "${difficulty}" difficulty.
Return ONLY a JSON array, no markdown fences, no commentary, in exactly this shape:
[{"question": "<text>", "options": ["<opt1>","<opt2>","<opt3>","<opt4>"], "correctAnswer": <integer 0-3, the index of the correct option>, "explanation": "<1-2 sentences>"}]
Rules: exactly 4 options per question, all four distinct, and correctAnswer MUST be an integer from 0 to 3 indexing into that question's options array.`;
  if (stricter) {
    return `Your previous response was invalid (wrong number of options, duplicate options, or a correctAnswer that was not an integer 0-3). Regenerate STRICTLY.\n${base}`;
  }
  return base;
}

async function generateMCQQuestions({ subject, topic, difficulty, count, userKey = null }) {
  async function attempt(stricter) {
    const { content } = await callGenerationAI([
      { role: 'system', content: 'You are an exam author. You return only valid JSON arrays matching the requested schema exactly. Never include markdown fences or prose.' },
      { role: 'user', content: mcqPrompt(subject, topic, difficulty, count, stricter) }
    ], { userKey, maxTokens: Math.min(4000, 300 * count + 300), temperature: 0.5 });
    let parsed;
    try { parsed = extractJsonArray(content); } catch { return { valid: [], total: count }; }
    if (!Array.isArray(parsed)) return { valid: [], total: count };
    const valid = parsed.map(validateMcq).filter(Boolean);
    return { valid, total: parsed.length };
  }

  let { valid, total } = await attempt(false);
  // Retry ONCE if anything was malformed (or nothing came back valid).
  if (valid.length < count) {
    const retry = await attempt(true);
    if (retry.valid.length > valid.length) { valid = retry.valid; total = retry.total; }
  }

  const kept = valid.slice(0, count);
  return { questions: kept, dropped: Math.max(0, count - kept.length) };
}

// ── Coding ──────────────────────────────────────────────────────────────────
function normalizePoints(testCases) {
  // If points are missing/invalid, distribute DEFAULT_CODING_TOTAL_POINTS
  // evenly (remainder on the last case) so the sum is always sensible.
  const allValid = testCases.every(tc => typeof tc.points === 'number' && tc.points > 0);
  const sum = testCases.reduce((s, tc) => s + (typeof tc.points === 'number' ? tc.points : 0), 0);
  if (allValid && sum > 0) return testCases;
  const per = Math.floor(DEFAULT_CODING_TOTAL_POINTS / testCases.length);
  return testCases.map((tc, i) => ({
    ...tc,
    points: i === testCases.length - 1 ? DEFAULT_CODING_TOTAL_POINTS - per * (testCases.length - 1) : per
  }));
}

function validateCoding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = stripHtml(raw.title).slice(0, MAX_TITLE_LEN);
  if (!title) return null;

  if (!Array.isArray(raw.testCases) || raw.testCases.length < 2 || raw.testCases.length > 8) return null;

  const testCases = [];
  for (const tc of raw.testCases) {
    if (!tc || typeof tc !== 'object') return null;
    if (typeof tc.input !== 'string' || tc.input.length > MAX_FIELD_LEN) return null;
    if (typeof tc.expectedOutput !== 'string' || tc.expectedOutput.length > MAX_FIELD_LEN) return null;
    testCases.push({
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      isHidden: !!tc.isHidden,
      points: typeof tc.points === 'number' ? tc.points : null
    });
  }
  // Require at least one hidden AND one visible test case.
  if (!testCases.some(tc => tc.isHidden) || !testCases.some(tc => !tc.isHidden)) return null;

  let languages = Array.isArray(raw.allowedLanguages)
    ? raw.allowedLanguages.filter(l => l === 'python' || l === 'javascript')
    : [];
  if (languages.length === 0) languages = ['python', 'javascript'];

  return {
    title,
    description: stripHtml(raw.description).slice(0, MAX_FIELD_LEN),
    starterCode: {
      python: typeof raw.starterCode?.python === 'string' ? raw.starterCode.python.slice(0, MAX_FIELD_LEN) : '',
      javascript: typeof raw.starterCode?.javascript === 'string' ? raw.starterCode.javascript.slice(0, MAX_FIELD_LEN) : ''
    },
    testCases: normalizePoints(testCases),
    allowedLanguages: languages,
    timeLimitMs: 5000,
    // CRITICAL: Groq authored both the problem AND its own expected outputs,
    // which may be wrong. We cannot execute code server-side (no Node
    // sandbox, by earlier architecture decision), so every AI-generated
    // coding question is flagged unverified until the professor test-runs a
    // known-good solution against these cases in the review UI.
    aiGenerated: true,
    verified: false
  };
}

function codingPrompt(subject, topic, difficulty, count, stricter) {
  const base = `Generate ${count} programming question(s) on the subject "${subject}", topic "${topic}", at "${difficulty}" difficulty.
Return ONLY a JSON array, no markdown fences, no commentary, in exactly this shape:
[{"title": "<short title>", "description": "<problem statement, describe stdin input format and stdout output format precisely>", "starterCode": {"python": "<stub>", "javascript": "<stub>"}, "testCases": [{"input": "<stdin>", "expectedOutput": "<exact stdout>", "isHidden": <bool>, "points": <number>}], "allowedLanguages": ["python","javascript"]}]
Rules: 2 to 8 test cases per question, with AT LEAST ONE hidden (isHidden:true) and AT LEAST ONE visible (isHidden:false). Test-case input is exactly what is fed to stdin; expectedOutput is exactly what the program should print to stdout. Points across a question's test cases should sum to about 100.`;
  if (stricter) {
    return `Your previous response was invalid (needs 2-8 test cases, at least one hidden and one visible, and valid string input/expectedOutput). Regenerate STRICTLY.\n${base}`;
  }
  return base;
}

async function generateCodingQuestions({ subject, topic, difficulty, count, userKey = null }) {
  async function attempt(stricter) {
    const { content } = await callGenerationAI([
      { role: 'system', content: 'You are an exam author. You return only valid JSON arrays matching the requested schema exactly. Never include markdown fences or prose.' },
      { role: 'user', content: codingPrompt(subject, topic, difficulty, count, stricter) }
    ], { userKey, maxTokens: Math.min(6000, 900 * count + 400), temperature: 0.4 });
    let parsed;
    try { parsed = extractJsonArray(content); } catch { return { valid: [], total: count }; }
    if (!Array.isArray(parsed)) return { valid: [], total: count };
    const valid = parsed.map(validateCoding).filter(Boolean);
    return { valid, total: parsed.length };
  }

  let { valid } = await attempt(false);
  if (valid.length < count) {
    const retry = await attempt(true);
    if (retry.valid.length > valid.length) valid = retry.valid;
  }

  const kept = valid.slice(0, count);
  return { questions: kept, dropped: Math.max(0, count - kept.length) };
}

module.exports = { generateMCQQuestions, generateCodingQuestions, stripHtml };
