const { callGroq } = require('./groqEvaluationService');

const MAX_ACTUAL_OUTPUT_LEN = 2000;

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in plausibility response');
  return JSON.parse(match[0]);
}

// Pure comparison — no AI involved, no ambiguity about correctness.
function gradeMcq(mcqAnswers, mcqQuestions) {
  const answerByQuestion = {};
  if (Array.isArray(mcqAnswers)) {
    mcqAnswers.forEach(a => {
      if (a && typeof a.questionId === 'string') answerByQuestion[a.questionId] = a.selectedOption;
    });
  }

  let mcqScore = 0;
  let mcqMaxScore = 0;
  const details = mcqQuestions.map(q => {
    mcqMaxScore += q.points;
    const selected = answerByQuestion[q.id];
    const correct = Number.isInteger(selected) && selected === q.correctAnswer;
    if (correct) mcqScore += q.points;
    return { questionId: q.id, selectedOption: Number.isInteger(selected) ? selected : null, correct, pointsAwarded: correct ? q.points : 0, maxPoints: q.points };
  });

  return { mcqScore, mcqMaxScore, details };
}

function sanitizeClaimedResults(claimedTestResults, testCases) {
  if (!Array.isArray(claimedTestResults)) return [];
  const validIds = new Set(testCases.map(tc => tc.id));
  return claimedTestResults
    .filter(r => r && typeof r === 'object' && validIds.has(r.testCaseId))
    .slice(0, testCases.length)
    .map(r => ({
      testCaseId: r.testCaseId,
      passed: !!r.passed,
      actualOutput: typeof r.actualOutput === 'string' ? r.actualOutput.slice(0, MAX_ACTUAL_OUTPUT_LEN) : ''
    }));
}

// Unlike the assignment flow, the client received full expectedOutput
// (including hidden cases) immediately before final submit — see
// assessmentSubmissionController.getFullQuestionsForSubmit — so a genuine
// client-computed 'passed' is trustworthy for scoring here. The AI
// plausibility check below is still run as a secondary integrity signal,
// not because the score itself is unverified.
async function checkPlausibility(code, language, passedCount, totalCount, userKey) {
  if (!userKey || totalCount === 0) return null;
  try {
    const prompt = `A student submitted this ${language} code for a coding question. Their code claims to pass ${passedCount}/${totalCount} test cases.

CODE:
"""
${code.substring(0, 3000)}
"""

Sanity-check whether this code's logic plausibly produces that pass rate (e.g. is it empty, unrelated to any reasonable problem, or obviously broken while claiming a high pass rate?).

Return ONLY a JSON object: {"consistent": <bool>, "concern": "<1 sentence if inconsistent, else null>"}`;

    const raw = await callGroq([
      { role: 'system', content: 'You are a rigorous code reviewer checking plausibility only. Always return valid JSON matching the schema exactly.' },
      { role: 'user', content: prompt }
    ], { maxTokens: 200, temperature: 0.1, userKey });

    return extractJson(raw);
  } catch (err) {
    console.error(`[AssessmentGrading] plausibility check failed: ${err.message}`);
    return null;
  }
}

// codingAnswers: [{ questionId, language, code, claimedTestResults }]
// userKey (optional): BYOK Groq key — if absent, scoring still works from
// local pass-rate tallies, just without the AI plausibility signal.
async function gradeCoding(codingAnswers, codingQuestions, userKey = null) {
  let codingScore = 0;
  let codingMaxScore = 0;
  const details = [];

  const answerByQuestion = {};
  if (Array.isArray(codingAnswers)) {
    codingAnswers.forEach(a => {
      if (a && typeof a.questionId === 'string') answerByQuestion[a.questionId] = a;
    });
  }

  for (const q of codingQuestions) {
    const maxPoints = q.testCases.reduce((sum, tc) => sum + tc.points, 0);
    codingMaxScore += maxPoints;

    const answer = answerByQuestion[q.id];
    if (!answer || typeof answer.code !== 'string' || !answer.code.trim()) {
      details.push({ questionId: q.id, pointsAwarded: 0, maxPoints, testResultPlausibility: null, attempted: false });
      continue;
    }

    const claimed = sanitizeClaimedResults(answer.claimedTestResults, q.testCases);
    const claimedById = {};
    claimed.forEach(c => { claimedById[c.testCaseId] = c; });

    let pointsAwarded = 0;
    let passedCount = 0;
    q.testCases.forEach(tc => {
      if (claimedById[tc.id]?.passed) {
        pointsAwarded += tc.points;
        passedCount += 1;
      }
    });
    codingScore += pointsAwarded;

    const plausibility = await checkPlausibility(answer.code, answer.language, passedCount, q.testCases.length, userKey);

    details.push({
      questionId: q.id,
      pointsAwarded,
      maxPoints,
      passedCount,
      totalTestCases: q.testCases.length,
      testResultPlausibility: plausibility,
      attempted: true
    });
  }

  return { codingScore, codingMaxScore, details };
}

// Sum of authored points across both sections — each point already
// represents the professor's intended weighting, so no extra normalization.
function computeTotalScore(mcqScore, codingScore) {
  return mcqScore + codingScore;
}

module.exports = { gradeMcq, gradeCoding, computeTotalScore };
