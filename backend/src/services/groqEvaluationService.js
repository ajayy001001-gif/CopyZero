const axios = require('axios');

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// BYOK only — there is no platform-funded Groq key. Every call requires the
// caller's own key, already format-validated upstream. No shared quota to
// protect here, since nothing is ever billed to the platform.
function getGroqClient(apiKey) {
  if (!apiKey) throw new Error('GROQ_USER_KEY_REQUIRED');
  return axios.create({
    baseURL: GROQ_BASE_URL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
}

async function callGroq(messages, { maxTokens = 800, temperature = 0.2, userKey = null } = {}) {
  const client = getGroqClient(userKey);
  const { data } = await client.post('/chat/completions', {
    model: GROQ_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false
  });
  return data.choices?.[0]?.message?.content || '';
}

// Used by POST /api/ai/test-key — never logs or returns the key itself.
async function testGroqKey(key) {
  try {
    await callGroq([
      { role: 'system', content: 'Reply with only the word OK.' },
      { role: 'user', content: 'ping' }
    ], { maxTokens: 1, temperature: 0, userKey: key });
    return true;
  } catch (err) {
    console.error(`[AI] Groq test-key check failed (${err.response?.status || err.message})`);
    return false;
  }
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Groq response');
  return JSON.parse(match[0]);
}

// Single combined call: plagiarism signal + AI-text signal + criteria scoring.
// Submission text and comparison set are both truncated to keep token usage
// (and therefore the caller's own quota burn) low.
async function analyzeSubmission(text, criteria, otherSubmissions = [], userKey = null) {
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. ${c.name} (${c.maxPoints}pts)${c.description ? ': ' + c.description : ''}`)
    .join('\n');

  const othersBlock = otherSubmissions.length
    ? otherSubmissions
        .slice(0, 3)
        .map((o, i) => `--- Other submission ${i + 1} ---\n${(o.text || '').substring(0, 800)}`)
        .join('\n\n')
    : '(No other submissions to compare against yet.)';

  const userPrompt = `You are evaluating a student's assignment submission for academic integrity and quality.

CRITERIA:
${criteriaList}

SUBMISSION TO EVALUATE:
"""
${text.substring(0, 3000)}
"""

OTHER STUDENTS' SUBMISSIONS FOR THE SAME ASSIGNMENT (for plagiarism comparison only):
${othersBlock}

Return ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{
  "studentPlagiarismScore": <0-100, 100 = no similarity concerns with the other submissions>,
  "similarSubmissionsFound": <integer count of submissions above with concerning similarity>,
  "maxSimilarityNote": "<one sentence on the closest match, or 'none' if no concerns>",
  "aiGeneratedTextScore": <0-100, 100 = confidently human-written, 0 = confidently AI-generated>,
  "aiLikelihoodPercent": <0-100>,
  "aiVerdict": "<Likely human | Possibly AI-assisted | Likely AI-generated>",
  "criteriaScores": [{"name": "<criterion name>", "score": <0-100>, "reasoning": "<1 concise sentence>"}],
  "overallQuality": <0-100>,
  "strengths": ["<point>"],
  "improvements": ["<point>"],
  "detailedFeedback": "<2-3 sentences, specific to this submission>"
}`;

  const raw = await callGroq([
    { role: 'system', content: 'You are a rigorous, fair academic integrity and content-quality evaluator. Always return valid JSON only, matching the requested schema exactly. Base every score on evidence in the text provided, never invent details.' },
    { role: 'user', content: userPrompt }
  ], { userKey });

  return extractJson(raw);
}

function combine(analysis) {
  const final = Math.min(analysis.studentPlagiarismScore, analysis.aiGeneratedTextScore);
  const risk = final >= 80 ? 'none' : final >= 60 ? 'low' : final >= 40 ? 'medium' : 'high';
  const details = `Student: ${analysis.studentPlagiarismScore}/100 (${analysis.similarSubmissionsFound} similar found — ${analysis.maxSimilarityNote}). AI: ${analysis.aiGeneratedTextScore}/100 (${analysis.aiLikelihoodPercent}% AI, ${analysis.aiVerdict}). Final: ${final}/100 (${risk} risk).`;
  return { score: final, riskLevel: risk, details, analysis };
}

// cfg.userKey is required — callers must validate format and reject before
// reaching here (see groqEvaluationController.js).
async function evaluateSubmissionWithGroq(data, cfg = {}) {
  const analysis = await analyzeSubmission(data.text, data.criteria, data.otherSubmissions || [], cfg.userKey || null);
  const plag = combine(analysis);

  const pw = data.plagiarismWeightage || 30;
  const cw = data.criteriaWeightage || 70;
  const pc = (plag.score / 100) * (pw / 100) * 10;
  const avgCriteria = analysis.criteriaScores.reduce((s, c) => s + c.score, 0) / analysis.criteriaScores.length;
  const cc = (avgCriteria / 100) * (cw / 100) * 10;
  const finalScore = parseFloat((pc + cc).toFixed(2));

  const breakdown = {
    plagiarismScore: plag.score,
    plagiarismComponent: parseFloat(pc.toFixed(2)),
    avgCriteriaScore: parseFloat(avgCriteria.toFixed(2)),
    criteriaComponent: parseFloat(cc.toFixed(2)),
    plagiarismWeightage: pw,
    criteriaWeightage: cw
  };

  const result = {
    plagiarism: { score: plag.score, analysis: plag.analysis, details: plag.details },
    contentAnalysis: {
      criteriaScores: analysis.criteriaScores,
      overallQuality: analysis.overallQuality,
      strengths: analysis.strengths,
      improvements: analysis.improvements,
      detailedFeedback: analysis.detailedFeedback
    },
    finalScore,
    breakdown,
    timestamp: new Date().toISOString(),
    usingGroq: true,
    usingUserKey: true,
    model: GROQ_MODEL
  };

  result.feedback = buildFeedback(result);
  return result;
}

function buildFeedback(r) {
  let f = '=== AI EVALUATION (Groq — Llama 3.1 8B Instant) ===\n\n';
  f += `FINAL: ${r.finalScore}/10\n\n`;
  f += `PLAGIARISM/INTEGRITY: ${r.plagiarism.score}/100 — ${r.plagiarism.details}\n\n`;
  f += 'CONTENT:\n';
  r.contentAnalysis.criteriaScores.forEach(c => { f += `- ${c.name}: ${c.score}/100 — ${c.reasoning}\n`; });
  f += `  Avg: ${r.breakdown.avgCriteriaScore}/100 | Component: ${r.breakdown.criteriaComponent}/10\n\n`;
  if (r.contentAnalysis.strengths?.length) f += 'STRENGTHS: ' + r.contentAnalysis.strengths.join(', ') + '\n';
  if (r.contentAnalysis.improvements?.length) f += 'IMPROVEMENTS: ' + r.contentAnalysis.improvements.join(', ') + '\n';
  if (r.contentAnalysis.detailedFeedback) f += `\n${r.contentAnalysis.detailedFeedback}\n`;
  f += `\n---\nModel: ${r.model}\n`;
  return f;
}

// Only tests if a key is supplied — there's no platform key to fall back to.
async function checkGroqStatus(userKey = null) {
  if (!userKey) {
    return { running: false, model: GROQ_MODEL, error: 'No key provided — bring your own Groq key to use AI evaluation' };
  }
  try {
    await callGroq([
      { role: 'system', content: 'Reply with only the word OK.' },
      { role: 'user', content: 'ping' }
    ], { maxTokens: 5, temperature: 0, userKey });
    return { running: true, model: GROQ_MODEL };
  } catch (e) {
    return { running: false, model: GROQ_MODEL, error: e.message };
  }
}

module.exports = { evaluateSubmissionWithGroq, checkGroqStatus, callGroq, testGroqKey, GROQ_MODEL };
