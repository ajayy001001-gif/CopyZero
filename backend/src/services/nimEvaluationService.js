const aiProviderService = require('./aiProviderService');

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in AI response');
  return JSON.parse(match[0]);
}

function buildPrompt(text, criteria, otherSubmissions) {
  const criteriaList = criteria
    .map((c, i) => `${i + 1}. ${c.name} (${c.maxPoints}pts)${c.description ? ': ' + c.description : ''}`)
    .join('\n');

  const othersBlock = otherSubmissions.length
    ? otherSubmissions
        .slice(0, 5)
        .map((o, i) => `--- Other submission ${i + 1} ---\n${(o.text || '').substring(0, 1500)}`)
        .join('\n\n')
    : '(No other submissions to compare against yet.)';

  return `You are evaluating a student's assignment submission for academic integrity and quality.

CRITERIA:
${criteriaList}

SUBMISSION TO EVALUATE:
"""
${text.substring(0, 6000)}
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
}

// Lightweight placeholder scores used only when every AI provider is
// unavailable/rate-limited — keeps the response shape identical so the rest
// of the scoring pipeline (combine/weighting/feedback) doesn't need to
// special-case a missing analysis.
function degradedAnalysis(text, criteria) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const baseScore = wordCount > 300 ? 70 : 55;
  return {
    studentPlagiarismScore: 70,
    similarSubmissionsFound: 0,
    maxSimilarityNote: 'Automated comparison unavailable — all AI providers were rate-limited.',
    aiGeneratedTextScore: 65,
    aiLikelihoodPercent: 35,
    aiVerdict: 'Unknown — heuristic fallback',
    criteriaScores: criteria.map(c => ({
      name: c.name,
      score: baseScore,
      reasoning: 'Heuristic placeholder — AI providers unavailable, re-run evaluation later.'
    })),
    overallQuality: baseScore,
    strengths: ['Submission received.'],
    improvements: ['Re-run evaluation once an AI provider is available for a full review.'],
    detailedFeedback: 'All AI providers were rate-limited or unavailable, so this is a heuristic placeholder score, not a full evaluation. Re-run once capacity is available.'
  };
}

// Single combined call: plagiarism signal + AI-text signal + criteria
// scoring. Routed through aiProviderService, which transparently tries NIM
// then HuggingFace and never throws.
async function analyzeSubmission(text, criteria, otherSubmissions = [], userKey = null, userKeyProvider = null) {
  const prompt = buildPrompt(text, criteria, otherSubmissions);

  const result = await aiProviderService.callAI([
    { role: 'system', content: 'You are a rigorous, fair academic integrity and content-quality evaluator. Always return valid JSON only, matching the requested schema exactly. Base every score on evidence in the text provided, never invent details.' },
    { role: 'user', content: prompt }
  ], { maxTokens: 1500, temperature: 0.2, userKey, userKeyProvider });

  if (result.degraded) {
    return { analysis: degradedAnalysis(text, criteria), provider: 'degraded', degraded: true };
  }

  try {
    return { analysis: extractJson(result.content), provider: result.provider, degraded: false };
  } catch (err) {
    // Malformed JSON from a provider is treated the same as unavailable —
    // never surface the raw model output to the caller.
    console.error(`[AI] Failed to parse ${result.provider} response as JSON: ${err.message}`);
    return { analysis: degradedAnalysis(text, criteria), provider: 'degraded', degraded: true };
  }
}

function combine(analysis) {
  const final = Math.min(analysis.studentPlagiarismScore, analysis.aiGeneratedTextScore);
  const risk = final >= 80 ? 'none' : final >= 60 ? 'low' : final >= 40 ? 'medium' : 'high';
  const details = `Student: ${analysis.studentPlagiarismScore}/100 (${analysis.similarSubmissionsFound} similar found — ${analysis.maxSimilarityNote}). AI: ${analysis.aiGeneratedTextScore}/100 (${analysis.aiLikelihoodPercent}% AI, ${analysis.aiVerdict}). Final: ${final}/100 (${risk} risk).`;
  return { score: final, riskLevel: risk, details, analysis };
}

async function evaluateSubmission(data, cfg = {}) {
  const { analysis, provider, degraded } = await analyzeSubmission(
    data.text, data.criteria, data.otherSubmissions || [], cfg.userKey || null, cfg.userKeyProvider || null
  );
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
    provider,
    degraded,
    usingNim: provider === 'nim',
    usingHuggingFace: provider === 'huggingface'
  };

  result.feedback = buildFeedback(result);
  return result;
}

function buildFeedback(r) {
  const providerLabel = r.degraded
    ? 'DEGRADED — all AI providers unavailable'
    : r.usingNim ? 'NVIDIA NIM — DeepSeek V4 Flash' : 'HuggingFace (fallback)';
  let f = `=== AI EVALUATION (${providerLabel}) ===\n\n`;
  f += `FINAL: ${r.finalScore}/10\n\n`;
  f += `PLAGIARISM/INTEGRITY: ${r.plagiarism.score}/100 — ${r.plagiarism.details}\n\n`;
  f += 'CONTENT:\n';
  r.contentAnalysis.criteriaScores.forEach(c => { f += `- ${c.name}: ${c.score}/100 — ${c.reasoning}\n`; });
  f += `  Avg: ${r.breakdown.avgCriteriaScore}/100 | Component: ${r.breakdown.criteriaComponent}/10\n\n`;
  if (r.contentAnalysis.strengths?.length) f += 'STRENGTHS: ' + r.contentAnalysis.strengths.join(', ') + '\n';
  if (r.contentAnalysis.improvements?.length) f += 'IMPROVEMENTS: ' + r.contentAnalysis.improvements.join(', ') + '\n';
  if (r.contentAnalysis.detailedFeedback) f += `\n${r.contentAnalysis.detailedFeedback}\n`;
  return f;
}

async function checkNimStatus() {
  const status = aiProviderService.getProviderStatus();
  return {
    running: status.nim.available,
    model: process.env.NVIDIA_NIM_MODEL || 'deepseek-ai/deepseek-v4-flash',
    error: status.nim.available ? null : 'NIM unavailable or rate-limited'
  };
}

module.exports = {
  evaluateSubmission,
  // Back-compat alias — same provider-agnostic function, old name kept so
  // any existing import site keeps working.
  evaluateSubmissionWithNim: evaluateSubmission,
  checkNimStatus
};
