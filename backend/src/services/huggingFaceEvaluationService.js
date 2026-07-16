const { HfInference } = require('@huggingface/inference');

/**
 * THREE-CHECK PLAGIARISM & EVALUATION SYSTEM
 *
 * CHECK 1: Student-to-student plagiarism (sentence-transformers/all-MiniLM-L6-v2)
 * CHECK 2: AI-generated text detection (Hello-SimpleAI/chatgpt-detector-roberta)
 * CHECK 3: Content quality evaluation (HuggingFaceH4/zephyr-7b-beta)
 *
 * Final plagiarism score = MIN(student-plagiarism, AI-detection)
 */

const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const AI_DETECTOR_MODEL = 'Hello-SimpleAI/chatgpt-detector-roberta';
const CONTENT_MODEL = process.env.HUGGINGFACE_CONTENT_MODEL || 'HuggingFaceH4/zephyr-7b-beta';

function getClient() {
  if (!process.env.HUGGINGFACE_API_TOKEN) throw new Error('HUGGINGFACE_API_TOKEN missing');
  return new HfInference(process.env.HUGGINGFACE_API_TOKEN);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

async function getEmbedding(client, text) {
  const res = await client.featureExtraction({ model: EMBEDDING_MODEL, inputs: text.substring(0, 4000) });
  if (Array.isArray(res) && typeof res[0] === 'number') return res;
  if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
  throw new Error('Unexpected embedding shape');
}

// ═══ CHECK 1: STUDENT PLAGIARISM ═══════════════════════════════════════════════
async function checkStudentPlagiarism(text, others = []) {
  try {
    const client = getClient();
    console.log(`[1/2] Student plagiarism check: ${EMBEDDING_MODEL}`);
    const myEmb = await getEmbedding(client, text);
    console.log(`    Embedding: ${myEmb.length} dims`);
    let maxSim = 0, simCount = 0;
    for (const o of others) {
      if (!o.text || o.text.trim() === text.trim()) continue;
      try {
        const oEmb = await getEmbedding(client, o.text);
        const sim = cosineSimilarity(myEmb, oEmb);
        if (sim > maxSim) maxSim = sim;
        if (sim > 0.85) simCount++;
        console.log(`    vs another: ${(sim * 100).toFixed(1)}%`);
      } catch { }
    }
    let score = others.length > 0
      ? Math.max(0, Math.min(100, Math.round((1 - maxSim) * 100)))
      : heuristicSelf(text);
    console.log(`    Score: ${score}/100`);
    return { studentPlagiarismScore: score, maxSimilarity: maxSim, similarSubmissionsFound: simCount, comparedAgainst: others.length };
  } catch (err) {
    console.error(`[1/2] Error: ${err.message}`);
    return { studentPlagiarismScore: heuristicSelf(text), maxSimilarity: 0, similarSubmissionsFound: 0, comparedAgainst: 0 };
  }
}

function heuristicSelf(text) {
  const l = text.toLowerCase();
  const susp = ['according to wikipedia', 'copied from', 'taken from'].filter(p => l.includes(p)).length;
  const cit = /\[\d+\]|\(\d{4}\)|et al\./i.test(text);
  const ref = /references|bibliography/i.test(l);
  let s = 75;
  if (susp > 0) s -= susp * 15;
  if (cit) s += 8;
  if (ref) s += 7;
  return Math.max(0, Math.min(100, s));
}

// ═══ CHECK 2: AI DETECTION ═════════════════════════════════════════════════════
async function checkAIGeneration(text) {
  try {
    const client = getClient();
    console.log(`[2/2] AI detection: ${AI_DETECTOR_MODEL}`);
    const res = await client.textClassification({ model: AI_DETECTOR_MODEL, inputs: text.substring(0, 2000) });
    console.log(`    Raw: ${JSON.stringify(res)}`);
    if (!res || !Array.isArray(res) || res.length === 0) throw new Error('Empty');
    const human = res.find(r => ['human', 'label_0', 'real'].includes(r.label?.toLowerCase()));
    const ai = res.find(r => ['ai', 'chatgpt', 'label_1', 'fake'].includes(r.label?.toLowerCase()));
    let score = human ? Math.round(human.score * 100)
      : ai ? Math.round((1 - ai.score) * 100)
        : Math.round(res.reduce((a, b) => a.score > b.score ? a : b).score * 100);
    score = Math.max(0, Math.min(100, score));
    const aiLik = 100 - score;
    const verd = score >= 70 ? 'Likely human' : score >= 40 ? 'Possibly AI-assisted' : 'Likely AI-generated';
    console.log(`    Score: ${score}/100 (${aiLik}% AI) → ${verd}`);
    return { aiDetectionScore: score, aiLikelihood: aiLik, verdict: verd, confidence: score > 80 || score < 20 ? 'high' : 'medium' };
  } catch (err) {
    console.error(`[2/2] Error: ${err.message}`);
    return heuristicAI(text);
  }
}

function heuristicAI(text) {
  const l = text.toLowerCase();
  const ai = ['as an ai', 'i cannot', 'certainly!', 'happy to help'].filter(p => l.includes(p)).length;
  let s = 70;
  if (ai > 0) s -= ai * 20;
  s = Math.max(0, Math.min(100, s));
  return { aiDetectionScore: s, aiLikelihood: 100 - s, verdict: s >= 60 ? 'Possibly human' : 'Heuristic suggests AI', confidence: 'low' };
}

// ═══ COMBINE ═══════════════════════════════════════════════════════════════════
function combine(stud, ai) {
  const final = Math.min(stud.studentPlagiarismScore, ai.aiDetectionScore);
  const risk = final >= 80 ? 'none' : final >= 60 ? 'low' : final >= 40 ? 'medium' : 'high';
  let det = stud.comparedAgainst > 0
    ? `Student: ${stud.studentPlagiarismScore}/100 (${stud.comparedAgainst} compared, max ${(stud.maxSimilarity * 100).toFixed(1)}%). `
    : `Student: ${stud.studentPlagiarismScore}/100 (no others). `;
  det += `AI: ${ai.aiDetectionScore}/100 (${ai.aiLikelihood}% AI, ${ai.verdict}). Final: ${final}/100 (${risk} risk).`;
  return {
    score: final,
    analysis: { ...stud, ...ai, confidence: stud.comparedAgainst > 0 && ai.confidence === 'high' ? 'high' : 'medium', riskLevel: risk },
    details: det
  };
}

// ═══ CHECK 3: CONTENT ══════════════════════════════════════════════════════════
async function analyzeContent(text, crit) {
  const clist = crit.map((c, i) => `${i + 1}. ${c.name} (${c.maxPoints}pts)${c.description ? ': ' + c.description : ''}`).join('\n');
  const prompt = `<|system|>Strict evaluator. Return ONLY JSON.</s>
<|user|>
Criteria:
${clist}

Submission:
"""
${text.substring(0, 2500)}
"""

JSON:
{
  "criteriaScores": [{"name":"<name>","score":<0-100>,"reasoning":"<1 sentence>"}],
  "overallQuality":<0-100>,
  "strengths":["<point>"],
  "improvements":["<point>"],
  "detailedFeedback":"<2-3 sentences>"
}</s>
<|assistant|>`;
  try {
    const client = getClient();
    console.log(`[3/3] Content: ${CONTENT_MODEL} (via chatCompletion)`);

    // Updated to use the modern chatCompletion API since textGeneration is
    // deprecated for instruct models on HF free tier providers.
    const r = await client.chatCompletion({
      model: CONTENT_MODEL,
      messages: [
        { role: 'system', content: 'You are a strict evaluator. Return ONLY valid JSON parsing the criteria provided. Do not include markdown blocks.' },
        { role: 'user', content: `Criteria:\n${clist}\n\nSubmission:\n"""\n${text.substring(0, 2500)}\n"""\n\nReturn JSON in this format:\n{\n  "criteriaScores": [{"name":"<name>","score":<0-100>,"reasoning":"<1 sentence>"}],\n  "overallQuality":<0-100>,\n  "strengths":["<point>"],\n  "improvements":["<point>"],\n  "detailedFeedback":"<2-3 sentences>"\n}` }
      ],
      max_tokens: 700,
      temperature: 0.3
    });

    const outputText = r.choices?.[0]?.message?.content || "";
    const j = outputText.match(/\{[\s\S]*\}/);

    if (j) {
      const p = JSON.parse(j[0]);
      const cs = crit.map((c, i) => {
        const f = (p.criteriaScores || []).find(s => s.name?.toLowerCase() === c.name?.toLowerCase()) || (p.criteriaScores || [])[i];
        return { name: c.name, score: Math.min(100, Math.max(0, f?.score ?? 65)), reasoning: f?.reasoning ?? 'AI' };
      });
      const oq = p.overallQuality ?? Math.round(cs.reduce((s, c) => s + c.score, 0) / cs.length);
      console.log(`    Quality: ${oq}/100`);
      return { criteriaScores: cs, overallQuality: oq, strengths: p.strengths || [], improvements: p.improvements || [], detailedFeedback: p.detailedFeedback || 'Done.' };
    }
    throw new Error('No JSON output from model');
  } catch (e) {
    console.error(`[3/3] Error: ${e.message}`);
    return heuristicCont(text, crit);
  }
}

function heuristicCont(text, crit) {
  const wc = text.split(/\s+/).length, pc = text.split(/\n\n+/).length;
  const cs = crit.map(c => {
    const n = c.name.toLowerCase();
    let s = 65;
    if (n.includes('content')) s = wc > 500 ? 85 : wc > 300 ? 72 : 58;
    else if (n.includes('structure')) s = pc >= 5 ? 85 : pc >= 3 ? 70 : 50;
    return { name: c.name, score: s, reasoning: 'Heuristic' };
  });
  const oq = Math.round(cs.reduce((s, c) => s + c.score, 0) / cs.length);
  return { criteriaScores: cs, overallQuality: oq, strengths: ['Completed'], improvements: ['Add detail'], detailedFeedback: `${wc} words, ${pc} paragraphs.` };
}

// ═══ MAIN ══════════════════════════════════════════════════════════════════════
async function evaluateSubmissionWithHuggingFace(data, cfg = {}) {
  console.log('🤖 3-check evaluation: student plagiarism + AI detection + content');
  const stud = await checkStudentPlagiarism(data.text, data.otherSubmissions || []);
  const ai = await checkAIGeneration(data.text);
  const plag = combine(stud, ai);
  console.log(`✅ Combined: ${plag.score}/100 (student: ${stud.studentPlagiarismScore}, AI: ${ai.aiDetectionScore})`);
  const cont = await analyzeContent(data.text, data.criteria);
  const pw = data.plagiarismWeightage || 30, cw = data.criteriaWeightage || 70;
  const pc = (plag.score / 100) * (pw / 100) * 10;
  const ac = cont.criteriaScores.reduce((s, c) => s + c.score, 0) / cont.criteriaScores.length;
  const cc = (ac / 100) * (cw / 100) * 10;
  const fin = parseFloat((pc + cc).toFixed(2));
  const bd = { plagiarismScore: plag.score, plagiarismComponent: parseFloat(pc.toFixed(2)), avgCriteriaScore: parseFloat(ac.toFixed(2)), criteriaComponent: parseFloat(cc.toFixed(2)), plagiarismWeightage: pw, criteriaWeightage: cw };
  const r = { plagiarism: plag, contentAnalysis: cont, finalScore: fin, breakdown: bd, timestamp: new Date().toISOString(), usingHuggingFace: true };
  r.feedback = buildFeedback(r);
  console.log(`✅ Final: ${fin}/10`);
  return r;
}

function buildFeedback(r) {
  const p = r.plagiarism.analysis;
  let f = '=== AI EVALUATION (3-Check) ===\n\n';
  f += `📊 FINAL: ${r.finalScore}/10\n\n`;
  f += `🔍 PLAGIARISM: ${r.plagiarism.score}/100\n`;
  f += `  Student: ${p.studentPlagiarismScore}/100 (${p.comparedAgainst} compared)\n`;
  f += `  AI: ${p.aiDetectionScore}/100 (${p.aiLikelihood}% AI, ${p.aiVerdict})\n`;
  f += `  Risk: ${p.riskLevel} | Component: ${r.breakdown.plagiarismComponent}/10\n\n`;
  f += '📝 CONTENT:\n';
  r.contentAnalysis.criteriaScores.forEach(c => { f += `- ${c.name}: ${c.score}/100 — ${c.reasoning}\n`; });
  f += `  Avg: ${r.breakdown.avgCriteriaScore}/100 | Component: ${r.breakdown.criteriaComponent}/10\n\n`;
  if (r.contentAnalysis.strengths?.length) { f += '✅ STRENGTHS: ' + r.contentAnalysis.strengths.join(', ') + '\n'; }
  if (r.contentAnalysis.improvements?.length) { f += '📈 IMPROVEMENTS: ' + r.contentAnalysis.improvements.join(', ') + '\n'; }
  if (r.contentAnalysis.detailedFeedback) { f += `\n💬 ${r.contentAnalysis.detailedFeedback}\n`; }
  f += `\n---\n${EMBEDDING_MODEL} | ${AI_DETECTOR_MODEL} | ${CONTENT_MODEL}\n`;
  return f;
}

async function checkHuggingFaceStatus() {
  try {
    await getEmbedding(getClient(), 'test');
    return { running: true, embeddingModel: EMBEDDING_MODEL, aiDetectorModel: AI_DETECTOR_MODEL, contentModel: CONTENT_MODEL };
  } catch (e) {
    return { running: false, error: e.message, embeddingModel: EMBEDDING_MODEL, aiDetectorModel: AI_DETECTOR_MODEL, contentModel: CONTENT_MODEL };
  }
}

module.exports = { evaluateSubmissionWithHuggingFace, checkHuggingFaceStatus };
