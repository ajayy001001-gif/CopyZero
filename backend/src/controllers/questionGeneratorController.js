const { generateMCQQuestions, generateCodingQuestions, stripHtml } = require('../services/questionGenerationService');
const { isValidUserKey } = require('../services/aiProviderService');

const MAX_MCQ = 10;
const MAX_CODING = 5;
const MAX_INPUT_LEN = 200;
const ALLOWED_DIFFICULTY = ['easy', 'medium', 'hard'];

// POST /api/professor/generate-assessment-questions — professor only.
// Returns generated questions for REVIEW only; nothing is saved here. The
// professor edits/verifies and adds them via PUT /assessments/:id.
async function generateAssessmentQuestions(req, res) {
  try {
    const { subject, topic, difficulty, mcqCount, codingCount } = req.body;

    // BYOK: same X-User-AI-Key format check as the evaluation flow. Present
    // but malformed → reject (don't silently ignore a copy-paste error).
    // Absent → generation uses the platform key / NIM fallback.
    const rawUserKey = req.headers['x-user-ai-key'];
    let userKey = null;
    if (rawUserKey) {
      if (!isValidUserKey('groq', rawUserKey)) {
        console.log('[Gen] user-provided key used: false (rejected — invalid format)');
        return res.status(400).json({ error: 'Invalid API key format' });
      }
      userKey = rawUserKey;
    }
    console.log(`[Gen] user-provided key used: ${!!userKey}`);

    const mcq = Number.isInteger(mcqCount) ? mcqCount : 0;
    const coding = Number.isInteger(codingCount) ? codingCount : 0;

    if (mcq < 0 || coding < 0 || mcq > MAX_MCQ || coding > MAX_CODING) {
      return res.status(400).json({ error: `mcqCount must be 0-${MAX_MCQ} and codingCount 0-${MAX_CODING}` });
    }
    if (mcq + coding === 0) {
      return res.status(400).json({ error: 'Request at least one question' });
    }

    // Strip HTML + length-cap the free-text inputs server-side before they
    // ever reach the model prompt.
    const cleanSubject = stripHtml(subject).slice(0, MAX_INPUT_LEN);
    const cleanTopic = stripHtml(topic).slice(0, MAX_INPUT_LEN);
    if (!cleanSubject || !cleanTopic) {
      return res.status(400).json({ error: 'subject and topic are required' });
    }
    const cleanDifficulty = ALLOWED_DIFFICULTY.includes(difficulty) ? difficulty : 'medium';

    const params = { subject: cleanSubject, topic: cleanTopic, difficulty: cleanDifficulty, userKey };

    let mcqQuestions = [];
    let codingQuestions = [];
    let mcqDropped = 0;
    let codingDropped = 0;

    if (mcq > 0) {
      const r = await generateMCQQuestions({ ...params, count: mcq });
      mcqQuestions = r.questions;
      mcqDropped = r.dropped;
    }
    if (coding > 0) {
      const r = await generateCodingQuestions({ ...params, count: coding });
      codingQuestions = r.questions;
      codingDropped = r.dropped;
    }

    if (mcqQuestions.length === 0 && codingQuestions.length === 0) {
      return res.status(502).json({ error: 'AI generation failed to produce any valid questions. Please try again.' });
    }

    return res.status(200).json({
      mcqQuestions,
      codingQuestions,
      warnings: { mcqDropped, codingDropped }
    });

  } catch (error) {
    // Provider errors/stack traces never leave the server.
    console.error('Generate questions error:', error.message);
    return res.status(500).json({ error: 'Failed to generate questions. Please try again shortly.' });
  }
}

module.exports = { generateAssessmentQuestions };
