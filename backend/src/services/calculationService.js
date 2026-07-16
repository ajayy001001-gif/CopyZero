function calculateFinalScore(plagiarismScore, criteriaScores, plagiarismWeightage, criteriaWeightage) {
  const totalCriteriaPoints = criteriaScores.reduce((sum, score) => sum + score.points, 0);
  const totalCriteriaMaxPoints = criteriaScores.reduce((sum, score) => sum + score.maxPoints, 0);
  
  const plagiarismPercentage = plagiarismScore / 100;
  const criteriaPercentage = totalCriteriaPoints / totalCriteriaMaxPoints;
  
  const weightedPlagiarismScore = plagiarismPercentage * (plagiarismWeightage / 100) * 10;
  const weightedCriteriaScore = criteriaPercentage * (criteriaWeightage / 100) * 10;
  
  const finalScore = weightedPlagiarismScore + weightedCriteriaScore;
  
  return {
    totalCriteriaPoints,
    totalCriteriaMaxPoints,
    weightedPlagiarismScore: parseFloat(weightedPlagiarismScore.toFixed(2)),
    weightedCriteriaScore: parseFloat(weightedCriteriaScore.toFixed(2)),
    finalScore: parseFloat(finalScore.toFixed(2))
  };
}

function normalizeScore(score, maxScore = 10) {
  if (score < 0) return 0;
  if (score > maxScore) return maxScore;
  return parseFloat(score.toFixed(2));
}

module.exports = {
  calculateFinalScore,
  normalizeScore
};