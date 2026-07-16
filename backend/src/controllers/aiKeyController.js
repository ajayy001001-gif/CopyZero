const { isValidUserKey, testNimKey } = require('../services/aiProviderService');
const { testGroqKey } = require('../services/groqEvaluationService');

// POST /api/ai/test-key — validates format, then makes a minimal (1 token)
// test call using the caller's own key. The key is never logged, never
// stored, and never echoed back in the response.
async function testKey(req, res) {
  try {
    const { provider, key } = req.body;

    if (provider !== 'groq' && provider !== 'nim') {
      return res.status(400).json({ valid: false, error: 'Invalid provider' });
    }
    if (!isValidUserKey(provider, key)) {
      return res.status(400).json({ valid: false, error: 'Invalid key format' });
    }

    const valid = provider === 'groq' ? await testGroqKey(key) : await testNimKey(key);

    return res.status(200).json({ valid, provider });

  } catch (error) {
    console.error('Test AI key error:', error.message);
    return res.status(500).json({ valid: false, error: 'Failed to test key' });
  }
}

module.exports = { testKey };
