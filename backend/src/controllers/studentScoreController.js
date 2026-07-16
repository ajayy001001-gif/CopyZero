const { getDocument, queryDocuments, collections } = require('../services/databaseService');

async function getMyScores(req, res) {
  try {
    const studentId = req.user.uid;

    const scores = await queryDocuments(collections.SCORES, [
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    return res.status(200).json({
      count: scores.length,
      scores
    });

  } catch (error) {
    console.error('Get scores error:', error);
    return res.status(500).json({
      error: 'Failed to fetch scores',
    });
  }
}

async function getScoreByAssignment(req, res) {
  try {
    const studentId = req.user.uid;
    const { assignmentId } = req.params;

    const scores = await queryDocuments(collections.SCORES, [
      { field: 'assignmentId', operator: '==', value: assignmentId },
      { field: 'studentId', operator: '==', value: studentId }
    ]);

    if (scores.length === 0) {
      return res.status(404).json({
        error: 'No score found for this assignment'
      });
    }

    return res.status(200).json({
      score: scores[0]
    });

  } catch (error) {
    console.error('Get score error:', error);
    return res.status(500).json({
      error: 'Failed to fetch score',
    });
  }
}

async function getScoreById(req, res) {
  try {
    const studentId = req.user.uid;
    const { scoreId } = req.params;

    const score = await getDocument(collections.SCORES, scoreId);

    if (!score) {
      return res.status(404).json({
        error: 'Score not found'
      });
    }

    if (score.studentId !== studentId) {
      return res.status(403).json({
        error: 'You can only view your own scores'
      });
    }

    return res.status(200).json({
      score
    });

  } catch (error) {
    console.error('Get score error:', error);
    return res.status(500).json({
      error: 'Failed to fetch score',
    });
  }
}

module.exports = {
  getMyScores,
  getScoreByAssignment,
  getScoreById
};