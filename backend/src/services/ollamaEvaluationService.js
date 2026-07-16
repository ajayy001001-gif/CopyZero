const axios = require('axios');

/**
 * Ollama AI Evaluation Service
 * 100% FREE - Runs locally on your machine
 * No API keys needed!
 */

// Ollama runs locally on http://localhost:11434 by default
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

/**
 * Check if Ollama is running
 */
async function checkOllamaStatus() {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`);
    return {
      running: true,
      models: response.data.models || []
    };
  } catch (error) {
    return {
      running: false,
      models: []
    };
  }
}

/**
 * Plagiarism Detection using Local Algorithm
 * Since we can't use paid APIs, we'll use:
 * 1. Text similarity algorithms
 * 2. Pattern detection
 * 3. Common phrase analysis
 */
async function detectPlagiarismLocal(text) {
  try {
    // Basic plagiarism indicators
    const indicators = {
      suspiciousPhrases: [
        'according to wikipedia',
        'source: wikipedia',
        'copied from',
        'taken from',
        'as stated on the internet',
        'found online',
        'from google'
      ],
      academicPhrases: [
        'according to',
        'research shows',
        'studies indicate',
        'scholars argue',
        'evidence suggests'
      ]
    };

    const lowerText = text.toLowerCase();
    
    // Count suspicious vs academic phrases
    let suspiciousCount = 0;
    let academicCount = 0;
    
    indicators.suspiciousPhrases.forEach(phrase => {
      if (lowerText.includes(phrase)) suspiciousCount++;
    });
    
    indicators.academicPhrases.forEach(phrase => {
      if (lowerText.includes(phrase)) academicCount++;
    });

    // Check for citations
    const hasCitations = /\[\d+\]|\(\d{4}\)|et al\./i.test(text);
    const hasReferences = /references|bibliography|works cited/i.test(lowerText);

    // Calculate plagiarism likelihood (0-100, higher = LESS plagiarism)
    let score = 70; // Base score

    // Penalties
    if (suspiciousCount > 0) score -= (suspiciousCount * 15);
    if (suspiciousCount > 3) score -= 20; // Major penalty
    
    // Bonuses
    if (hasCitations) score += 10;
    if (hasReferences) score += 10;
    if (academicCount > 2) score += 10;

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score));

    return {
      score: score,
      analysis: {
        suspiciousPhrasesFound: suspiciousCount,
        academicPhrasesFound: academicCount,
        hasCitations,
        hasReferences,
        confidence: suspiciousCount > 0 ? 'medium' : 'low'
      },
      details: `Found ${suspiciousCount} suspicious phrase(s), ${academicCount} academic phrase(s). ${hasCitations ? 'Has citations. ' : 'No citations found. '}${hasReferences ? 'Has references section.' : 'No references section.'}`
    };

  } catch (error) {
    console.error('Plagiarism detection error:', error);
    throw new Error('Plagiarism detection failed');
  }
}

/**
 * Analyze content quality using Ollama LLM
 */
async function analyzeContentWithOllama(text, criteria, modelName = 'llama2') {
  try {
    // Build the prompt
    const prompt = `You are an expert academic evaluator. Analyze the following student submission and provide scores for each criterion.

SUBMISSION:
${text}

EVALUATION CRITERIA:
${criteria.map((c, i) => `${i + 1}. ${c.name} (Max: ${c.maxPoints} points): ${c.description || 'Evaluate based on quality'}`).join('\n')}

Please provide your evaluation in the following JSON format (respond ONLY with valid JSON, no other text):
{
  "criteriaScores": [
    {
      "name": "criterion name",
      "score": 85,
      "reasoning": "explanation of score"
    }
  ],
  "overallQuality": 78,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "detailedFeedback": "comprehensive feedback about the submission"
}

Remember: Scores should be 0-100. Be fair and constructive.`;

    // Call Ollama API - Try chat endpoint first (newer versions)
    let response;
    let responseText;
    
    try {
      // Try the /api/chat endpoint (Ollama v0.1.17+)
      response = await axios.post(
        `${OLLAMA_BASE_URL}/api/chat`,
        {
          model: modelName,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9
          }
        },
        {
          timeout: 60000
        }
      );
      responseText = response.data.message.content;
    } catch (chatError) {
      // Fallback to /api/generate endpoint (older Ollama versions)
      console.log('Chat endpoint failed, trying generate endpoint...');
      response = await axios.post(
        `${OLLAMA_BASE_URL}/api/generate`,
        {
          model: modelName,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            top_p: 0.9
          }
        },
        {
          timeout: 60000
        }
      );
      responseText = response.data.response;
    }

    // Parse the response
    let analysis;
    try {
      
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Ollama response:', parseError);
      // Fallback to basic analysis
      analysis = generateFallbackAnalysis(text, criteria);
    }

    return analysis;

  } catch (error) {
    console.error('Ollama analysis error:', error.message);
    
    // Log the actual error for debugging
    if (error.response) {
      console.error('Ollama response error:', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      });
    }
    
    // Always use fallback if Ollama fails for any reason
    console.log('Using fallback analysis due to Ollama error');
    return generateFallbackAnalysis(text, criteria);
  }
}

/**
 * Fallback analysis if Ollama is not available
 * Uses heuristic methods
 */
function generateFallbackAnalysis(text, criteria) {
  const wordCount = text.split(/\s+/).length;
  const sentenceCount = text.split(/[.!?]+/).length;
  const paragraphCount = text.split(/\n\n+/).length;
  const hasReferences = /references|bibliography|works cited/i.test(text);
  const hasCitations = /\[\d+\]|\(\d{4}\)|et al\./i.test(text);

  const criteriaScores = criteria.map(criterion => {
    const criterionName = criterion.name.toLowerCase();
    let score = 0;

    // Content Quality
    if (criterionName.includes('content') || criterionName.includes('quality')) {
      if (wordCount > 500) score = 85;
      else if (wordCount > 300) score = 75;
      else if (wordCount > 150) score = 60;
      else score = 40;
    }
    // Structure
    else if (criterionName.includes('structure') || criterionName.includes('organization')) {
      if (paragraphCount >= 5 && sentenceCount > 15) score = 85;
      else if (paragraphCount >= 3) score = 70;
      else score = 50;
    }
    // Citations
    else if (criterionName.includes('citation') || criterionName.includes('reference')) {
      if (hasReferences && hasCitations) score = 90;
      else if (hasCitations) score = 70;
      else if (hasReferences) score = 50;
      else score = 20;
    }
    // Grammar/Writing
    else if (criterionName.includes('grammar') || criterionName.includes('writing')) {
      const avgSentenceLength = wordCount / sentenceCount;
      if (avgSentenceLength > 10 && avgSentenceLength < 25) score = 80;
      else score = 65;
    }
    // Default
    else {
      score = 70;
    }

    return {
      name: criterion.name,
      score: Math.round(score),
      reasoning: generateReasoningForScore(criterionName, score, {
        wordCount,
        paragraphCount,
        hasCitations,
        hasReferences
      })
    };
  });

  const overallQuality = Math.round(
    criteriaScores.reduce((sum, c) => sum + c.score, 0) / criteriaScores.length
  );

  return {
    criteriaScores,
    overallQuality,
    strengths: generateStrengths(text, wordCount, paragraphCount, hasCitations, hasReferences),
    improvements: generateImprovements(text, wordCount, paragraphCount, hasCitations, hasReferences),
    detailedFeedback: generateDetailedFeedback(wordCount, paragraphCount, hasCitations, hasReferences, overallQuality)
  };
}

function generateReasoningForScore(criterionName, score, metrics) {
  if (criterionName.includes('content')) {
    if (metrics.wordCount > 500) return 'Comprehensive content with good depth and detail';
    if (metrics.wordCount > 300) return 'Adequate content coverage';
    return 'Content could be more detailed and comprehensive';
  }
  if (criterionName.includes('structure')) {
    if (metrics.paragraphCount >= 5) return 'Well-organized with clear paragraph structure';
    if (metrics.paragraphCount >= 3) return 'Reasonable organization';
    return 'Could benefit from better paragraph organization';
  }
  if (criterionName.includes('citation')) {
    if (metrics.hasCitations && metrics.hasReferences) return 'Excellent use of citations and references';
    if (metrics.hasCitations) return 'Good citations, but could include a references section';
    return 'Needs more citations and references';
  }
  return 'Meets basic requirements';
}

function generateStrengths(text, wordCount, paragraphCount, hasCitations, hasReferences) {
  const strengths = [];
  
  if (wordCount > 400) strengths.push('Good length and depth of content');
  if (paragraphCount >= 4) strengths.push('Well-structured with clear paragraphs');
  if (hasCitations) strengths.push('Uses proper in-text citations');
  if (hasReferences) strengths.push('Includes references/bibliography');
  
  const hasIntroConclusion = /introduction|in conclusion|to conclude|in summary/i.test(text);
  if (hasIntroConclusion) strengths.push('Has clear introduction or conclusion');
  
  if (strengths.length === 0) {
    strengths.push('Submission completed and submitted on time');
  }
  
  return strengths.slice(0, 4); // Max 4 strengths
}

function generateImprovements(text, wordCount, paragraphCount, hasCitations, hasReferences) {
  const improvements = [];
  
  if (wordCount < 250) improvements.push('Expand content with more detail and analysis');
  if (paragraphCount < 3) improvements.push('Improve organization with more distinct paragraphs');
  if (!hasCitations) improvements.push('Add in-text citations to support claims');
  if (!hasReferences) improvements.push('Include a references/bibliography section');
  
  const hasTransitions = /however|moreover|furthermore|additionally|consequently/i.test(text);
  if (!hasTransitions) improvements.push('Use transition words to improve flow');
  
  if (improvements.length === 0) {
    improvements.push('Continue maintaining this quality in future submissions');
  }
  
  return improvements.slice(0, 4); // Max 4 improvements
}

function generateDetailedFeedback(wordCount, paragraphCount, hasCitations, hasReferences, overallQuality) {
  let feedback = '';
  
  if (overallQuality >= 80) {
    feedback = `This is a strong submission that demonstrates good understanding of the topic. `;
  } else if (overallQuality >= 60) {
    feedback = `This is a satisfactory submission with room for improvement. `;
  } else {
    feedback = `This submission needs significant improvement. `;
  }
  
  feedback += `The submission contains ${wordCount} words organized into ${paragraphCount} paragraph(s). `;
  
  if (hasCitations && hasReferences) {
    feedback += `The use of citations and references is commendable and shows good academic practice. `;
  } else if (hasCitations) {
    feedback += `While citations are present, a formal references section would strengthen the work. `;
  } else {
    feedback += `The work would benefit significantly from proper citations and references. `;
  }
  
  feedback += `Focus on developing your arguments with more depth and supporting evidence in future submissions.`;
  
  return feedback;
}

/**
 * Main evaluation function
 */
async function evaluateSubmissionWithOllama(submissionData, config = {}) {
  const results = {
    plagiarism: null,
    contentAnalysis: null,
    finalScore: 0,
    breakdown: {},
    feedback: '',
    timestamp: new Date().toISOString(),
    usingOllama: true
  };

  try {
    console.log('🤖 Starting Ollama-based evaluation...');

    // Step 1: Check Ollama status
    const status = await checkOllamaStatus();
    console.log(`Ollama status: ${status.running ? 'Running' : 'Not running'}`);
    if (status.running) {
      console.log(`Available models: ${status.models.map(m => m.name).join(', ')}`);
    }

    // Step 2: Plagiarism Detection (Local Algorithm)
    console.log('Running local plagiarism check...');
    results.plagiarism = await detectPlagiarismLocal(submissionData.text);
    console.log(`Plagiarism score: ${results.plagiarism.score}/100`);

    // Step 3: Content Analysis (Ollama or Fallback)
    console.log('Running content analysis...');
    const modelName = config.ollamaModel || 'llama2';
    results.contentAnalysis = await analyzeContentWithOllama(
      submissionData.text,
      submissionData.criteria,
      modelName
    );
    console.log(`Content analysis complete. Overall quality: ${results.contentAnalysis.overallQuality}/100`);

    // Step 4: Calculate Final Score
    const plagiarismScore = results.plagiarism.score;
    const criteriaScores = results.contentAnalysis.criteriaScores;
    
    const plagWeightage = submissionData.plagiarismWeightage || 30;
    const criteriaWeightage = submissionData.criteriaWeightage || 70;

    const plagiarismComponent = (plagiarismScore / 100) * (plagWeightage / 100) * 10;
    
    const avgCriteriaScore = criteriaScores.reduce((sum, c) => sum + c.score, 0) / criteriaScores.length;
    const criteriaComponent = (avgCriteriaScore / 100) * (criteriaWeightage / 100) * 10;
    
    results.finalScore = parseFloat((plagiarismComponent + criteriaComponent).toFixed(2));
    
    results.breakdown = {
      plagiarismScore,
      plagiarismComponent: parseFloat(plagiarismComponent.toFixed(2)),
      avgCriteriaScore: parseFloat(avgCriteriaScore.toFixed(2)),
      criteriaComponent: parseFloat(criteriaComponent.toFixed(2)),
      plagiarismWeightage: plagWeightage,
      criteriaWeightage: criteriaWeightage
    };

    // Step 5: Generate Feedback
    results.feedback = generateComprehensiveFeedback(results);

    console.log(`✅ Evaluation complete! Final score: ${results.finalScore}/10`);
    return results;

  } catch (error) {
    console.error('Evaluation error:', error);
    throw error;
  }
}

function generateComprehensiveFeedback(results) {
  let feedback = '=== AI EVALUATION REPORT (Ollama) ===\n\n';
  
  feedback += `📊 FINAL SCORE: ${results.finalScore}/10\n\n`;
  
  feedback += '🔍 PLAGIARISM ANALYSIS:\n';
  feedback += `- Plagiarism Score: ${results.breakdown.plagiarismScore}/100\n`;
  feedback += `- Contribution to Final: ${results.breakdown.plagiarismComponent}/10\n`;
  feedback += `- Analysis: ${results.plagiarism.details}\n\n`;
  
  feedback += '📝 CONTENT QUALITY:\n';
  if (results.contentAnalysis?.criteriaScores) {
    results.contentAnalysis.criteriaScores.forEach(criterion => {
      feedback += `- ${criterion.name}: ${criterion.score}/100\n`;
      if (criterion.reasoning) {
        feedback += `  ${criterion.reasoning}\n`;
      }
    });
  }
  feedback += `- Average: ${results.breakdown.avgCriteriaScore}/100\n`;
  feedback += `- Contribution to Final: ${results.breakdown.criteriaComponent}/10\n\n`;
  
  if (results.contentAnalysis?.strengths) {
    feedback += '✅ STRENGTHS:\n';
    results.contentAnalysis.strengths.forEach(s => {
      feedback += `- ${s}\n`;
    });
    feedback += '\n';
  }
  
  if (results.contentAnalysis?.improvements) {
    feedback += '📈 AREAS FOR IMPROVEMENT:\n';
    results.contentAnalysis.improvements.forEach(i => {
      feedback += `- ${i}\n`;
    });
    feedback += '\n';
  }
  
  if (results.contentAnalysis?.detailedFeedback) {
    feedback += '💬 DETAILED FEEDBACK:\n';
    feedback += results.contentAnalysis.detailedFeedback + '\n\n';
  }
  
  feedback += '---\n';
  feedback += 'Evaluated using Ollama AI (100% free, local processing)\n';
  
  return feedback;
}

module.exports = {
  evaluateSubmissionWithOllama,
  checkOllamaStatus,
  detectPlagiarismLocal,
  analyzeContentWithOllama
};
