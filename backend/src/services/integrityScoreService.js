const { callGroq } = require('./groqEvaluationService');
const { createDocument, collections } = require('./databaseService');

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in integrity score response');
  return JSON.parse(match[0]);
}

// Pure local computation — no AI call, just tallies from the stored event
// timeline for this submission.
function computeSignals(events) {
  const counts = {
    tabSwitchCount: 0,
    fullscreenExitCount: 0,
    copyAttemptCount: 0,
    pasteAttemptCount: 0,
    browserFocusLossCount: 0
  };
  let idleMs = 0;
  let examStart = null;
  let examEnd = null;

  const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sorted.forEach(e => {
    switch (e.eventType) {
      case 'tab_switch': counts.tabSwitchCount += 1; break;
      case 'fullscreen_exit': counts.fullscreenExitCount += 1; break;
      case 'copy_attempt': counts.copyAttemptCount += 1; break;
      case 'paste_attempt': counts.pasteAttemptCount += 1; break;
      case 'window_blur': counts.browserFocusLossCount += 1; break;
      case 'idle_long': idleMs += Number(e.metadata?.duration) || 0; break;
      case 'exam_start': if (!examStart) examStart = new Date(e.timestamp); break;
      case 'exam_submit': examEnd = new Date(e.timestamp); break;
      default: break;
    }
  });

  const examDurationMs = examStart && examEnd ? examEnd - examStart : null;
  const idleTimePercent = examDurationMs && examDurationMs > 0
    ? Math.min(100, Math.round((idleMs / examDurationMs) * 100))
    : 0;

  return { ...counts, idleTimePercent, totalEvents: events.length };
}

function heuristicIntegrityScore(signals, plagiarismScore, aiDetectionScore) {
  let score = 100;
  score -= signals.tabSwitchCount * 3;
  score -= signals.fullscreenExitCount * 5;
  score -= signals.copyAttemptCount * 4;
  score -= signals.pasteAttemptCount * 6;
  score -= signals.browserFocusLossCount * 2;
  score -= Math.round(signals.idleTimePercent / 5);
  if (typeof plagiarismScore === 'number') score = Math.min(score, plagiarismScore);
  if (typeof aiDetectionScore === 'number') score = Math.min(score, aiDetectionScore);
  score = Math.max(0, Math.min(100, score));

  const riskLevel = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high';

  return {
    overallScore: score,
    riskLevel,
    explanation: 'AI scoring was unavailable (quota reached or provider error), so this is a rule-based estimate from behavioral and content signals only.',
    breakdown: {
      tabSwitching: -(signals.tabSwitchCount * 3),
      focusLoss: -(signals.browserFocusLossCount * 2),
      copyPaste: -(signals.copyAttemptCount * 4 + signals.pasteAttemptCount * 6),
      idleTime: -Math.round(signals.idleTimePercent / 5),
      contentSignals: 0
    }
  };
}

// Kept intentionally small (400 max tokens, compact prompt) — this call
// shares the same Groq quota guard as evaluation, so every integrity score
// computed also counts against the site-wide daily cap.
async function computeIntegrityScore({ submissionId, events, plagiarismScore, aiDetectionScore }) {
  const signals = computeSignals(events || []);

  const prompt = `You are assessing exam-taking behavior for academic integrity, combining automated proctoring signals with plagiarism/AI-detection results.

BEHAVIORAL SIGNALS:
- Tab switches: ${signals.tabSwitchCount}
- Fullscreen exits: ${signals.fullscreenExitCount}
- Copy attempts: ${signals.copyAttemptCount}
- Paste attempts: ${signals.pasteAttemptCount}
- Browser focus loss: ${signals.browserFocusLossCount}
- Idle time: ${signals.idleTimePercent}% of session
- Total tracked events: ${signals.totalEvents}

CONTENT SIGNALS:
- Plagiarism score: ${typeof plagiarismScore === 'number' ? plagiarismScore + '/100 (100 = no concerns)' : 'not available'}
- AI-generated text score: ${typeof aiDetectionScore === 'number' ? aiDetectionScore + '/100 (100 = confidently human)' : 'not available'}

Return ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{
  "overallScore": <0-100, 100 = perfect integrity, 0 = extremely suspicious>,
  "riskLevel": "low" | "medium" | "high",
  "explanation": "<2-3 sentence plain-English explanation for the professor>",
  "breakdown": {
    "tabSwitching": <weighted contribution, negative if it hurt the score>,
    "focusLoss": <weighted contribution>,
    "copyPaste": <weighted contribution>,
    "idleTime": <weighted contribution>,
    "contentSignals": <weighted contribution>
  }
}`;

  let result;
  try {
    const raw = await callGroq([
      { role: 'system', content: 'You are a fair, evidence-based academic integrity analyst. Always return valid JSON only, matching the requested schema exactly.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 400, temperature: 0.2 });
    result = extractJson(raw);
  } catch (err) {
    console.error(`[Integrity] AI scoring failed for submission ${submissionId}: ${err.message}`);
    result = heuristicIntegrityScore(signals, plagiarismScore, aiDetectionScore);
  }

  const record = {
    submissionId,
    signals,
    overallScore: result.overallScore,
    riskLevel: result.riskLevel,
    explanation: result.explanation,
    breakdown: result.breakdown,
    plagiarismScore: typeof plagiarismScore === 'number' ? plagiarismScore : null,
    aiDetectionScore: typeof aiDetectionScore === 'number' ? aiDetectionScore : null,
    computedAt: new Date().toISOString()
  };

  // One integrity score per submission — use submissionId as the doc id so
  // re-computation (e.g. re-evaluation) overwrites cleanly.
  await createDocument(collections.INTEGRITY_SCORES, record, submissionId);
  return record;
}

module.exports = { computeIntegrityScore };
