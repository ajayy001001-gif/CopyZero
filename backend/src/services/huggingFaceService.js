const { HfInference } = require('@huggingface/inference');

/**
 * HuggingFace Service
 * Used by huggingFaceEvaluationController.js
 *
 * TWO SEPARATE MODELS:
 * 1. Plagiarism: jpwahle/longformer-base-plagiarism-detection → textClassification
 * 2. Content:    mistralai/Mistral-7B-Instruct-v0.3           → textGeneration
 */

const PLAGIARISM_MODEL = process.env.HUGGINGFACE_MODEL || 'jpwahle/longformer-base-plagiarism-detection';
const CONTENT_MODEL    = process.env.HUGGINGFACE_CONTENT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';

function getClient() {
  if (!process.env.HUGGINGFACE_API_TOKEN) {
    throw new Error('HUGGINGFACE_API_TOKEN is not set in .env');
  }
  return new HfInference(process.env.HUGGINGFACE_API_TOKEN);
}

// ─── PLAGIARISM CHECK ─────────────────────────────────────────────────────────
// Called by huggingFaceEvaluationController.autoEvaluateWithAI()
// Returns: { plagiarism_score, confidence, risk_level, suspicious_patterns, recommendations }
async function checkPlagiarism(text, previousDrafts = [], previousSubmissions = []) {
  const client = getClient();

  try {
    console.log(`Running plagiarism classification with: ${PLAGIARISM_MODEL}`);

    const result = await client.textClassification({
      model: PLAGIARISM_MODEL,
      inputs: text.substring(0, 8000)
    });

    console.log('Plagiarism model raw result:', JSON.stringify(result));

    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error('Empty response from plagiarism model');
    }

    const originalEntry = result.find(r =>
      r.label?.toUpperCase() === 'ORIGINAL' ||
      r.label?.toUpperCase() === 'NOT_PLAGIARIZED' ||
      r.label?.toUpperCase() === 'LABEL_0'
    );

    const plagiarizedEntry = result.find(r =>
      r.label?.toUpperCase() === 'PLAGIARIZED' ||
      r.label?.toUpperCase() === 'LABEL_1'
    );

    let originalityScore;
    if (originalEntry) {
      originalityScore = Math.round(originalEntry.score * 100);
    } else if (plagiarizedEntry) {
      originalityScore = Math.round((1 - plagiarizedEntry.score) * 100);
    } else {
      const highest = result.reduce((a, b) => a.score > b.score ? a : b);
      originalityScore = Math.round(highest.score * 100);
    }

    originalityScore = Math.max(0, Math.min(100, originalityScore));

    const riskLevel =
      originalityScore >= 80 ? 'none' :
      originalityScore >= 60 ? 'low'  :
      originalityScore >= 40 ? 'medium' : 'high';

    console.log(`Plagiarism check complete. Score: ${originalityScore}/100 (${riskLevel})`);

    return {
      plagiarism_score:    originalityScore,
      confidence:          originalityScore > 80 || originalityScore < 20 ? 'high' : 'medium',
      risk_level:          riskLevel,
      suspicious_patterns: [],
      recommendations:     originalityScore >= 70
        ? 'Submission appears original.'
        : originalityScore >= 40
          ? 'Some sections may need review.'
          : 'High plagiarism risk — manual review recommended.'
    };

  } catch (err) {
    console.error('checkPlagiarism error:', err.message);
    return checkPlagiarismHeuristic(text);
  }
}

function checkPlagiarismHeuristic(text) {
  const lower = text.toLowerCase();
  const suspicious = ['according to wikipedia', 'copied from', 'taken from', 'found online', 'source: wikipedia'];
  const hasCitations  = /\[\d+\]|\(\d{4}\)|et al\./i.test(text);
  const hasReferences = /references|bibliography|works cited/i.test(lower);
  const suspCount     = suspicious.filter(p => lower.includes(p)).length;

  let score = 70;
  if (suspCount > 0) score -= suspCount * 15;
  if (hasCitations)  score += 10;
  if (hasReferences) score += 10;
  score = Math.max(0, Math.min(100, score));

  return {
    plagiarism_score:    score,
    confidence:          'low',
    risk_level:          score >= 70 ? 'none' : score >= 40 ? 'medium' : 'high',
    suspicious_patterns: suspCount > 0 ? [`${suspCount} suspicious phrase(s) found`] : [],
    recommendations:     hasCitations ? 'Citations present.' : 'Consider adding citations.'
  };
}

// ─── ASSIGNMENT EVALUATION ────────────────────────────────────────────────────
// Called by huggingFaceEvaluationController.autoEvaluateWithAI()
// Returns: { criteria_scores: { [name]: { score, max_score, feedback } }, overall_feedback, grade }
async function evaluateAssignment(assignmentDescription, rubric, studentSubmission) {
  const client = getClient();

  const criteriaList = rubric.criteria
    .map(c => `- ${c.name} (max ${c.maxPoints} pts)${c.description ? ': ' + c.description : ''}`)
    .join('\n');

  const prompt = `<s>[INST] You are a strict academic evaluator. Evaluate this student submission and return ONLY a JSON object — no explanation, no markdown, no extra text.

Assignment: ${(assignmentDescription || '').substring(0, 500)}

Rubric criteria:
${criteriaList}

Student submission:
"""
${(studentSubmission || '').substring(0, 3000)}
"""

Return exactly this JSON (no other text):
{
  "criteria_scores": {
    ${rubric.criteria.map(c =>
      `"${c.name}": { "score": <0 to ${c.maxPoints}>, "max_score": ${c.maxPoints}, "feedback": "<one sentence>" }`
    ).join(',\n    ')}
  },
  "overall_feedback": "<2-3 sentences of constructive feedback>",
  "grade": "<A/B/C/D/F>"
}
[/INST]`;

  try {
    console.log(`Running content evaluation with: ${CONTENT_MODEL}`);

    const response = await client.textGeneration({
      model: CONTENT_MODEL,
      inputs: prompt,
      parameters: { max_new_tokens: 600, temperature: 0.2, return_full_text: false }
    });

    const jsonMatch = response.generated_text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('Content evaluation complete.');
      return {
        criteria_scores:  parsed.criteria_scores  || {},
        overall_feedback: parsed.overall_feedback || 'Evaluation complete.',
        grade:            parsed.grade            || 'N/A'
      };
    }
    throw new Error('No valid JSON in AI response');

  } catch (err) {
    console.error('evaluateAssignment error:', err.message);
    return buildFallbackEvaluation(rubric, studentSubmission);
  }
}

function buildFallbackEvaluation(rubric, text) {
  const wordCount     = (text || '').split(/\s+/).length;
  const hasCitations  = /\[\d+\]|\(\d{4}\)|et al\./i.test(text || '');
  const hasReferences = /references|bibliography|works cited/i.test((text || '').toLowerCase());

  const criteriaScores = {};
  rubric.criteria.forEach(c => {
    let score = Math.round(c.maxPoints * 0.65);
    const name = c.name.toLowerCase();
    if (name.includes('content') || name.includes('quality')) {
      score = wordCount > 500 ? Math.round(c.maxPoints * 0.85)
            : wordCount > 300 ? Math.round(c.maxPoints * 0.70)
            : Math.round(c.maxPoints * 0.50);
    } else if (name.includes('citation') || name.includes('reference')) {
      score = hasCitations && hasReferences ? Math.round(c.maxPoints * 0.90)
            : hasCitations                  ? Math.round(c.maxPoints * 0.65)
            : Math.round(c.maxPoints * 0.20);
    }
    criteriaScores[c.name] = {
      score,
      max_score: c.maxPoints,
      feedback:  'Heuristic evaluation (AI unavailable).'
    };
  });

  return {
    criteria_scores:  criteriaScores,
    overall_feedback: `${wordCount} words. ${hasCitations ? 'Citations present.' : 'No citations.'} ${hasReferences ? 'References included.' : 'No references.'}`,
    grade: 'N/A'
  };
}

module.exports = {
  checkPlagiarism,
  evaluateAssignment
};