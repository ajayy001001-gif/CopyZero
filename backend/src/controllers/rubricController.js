const { createDocument, getDocument, updateDocument, queryDocuments, collections, logAudit } = require('../services/databaseService');
const { validateRubric } = require('../services/validationService');

async function createRubric(req, res) {
  try {
    const professorId = req.user.uid;
    const { assignmentId, criteria } = req.body;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only create rubrics for your own assignments'
      });
    }

    const existingRubrics = await queryDocuments(collections.RUBRICS, [
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);

    if (existingRubrics.length > 0) {
      return res.status(409).json({
        error: 'Rubric already exists for this assignment',
        rubric: existingRubrics[0]
      });
    }

    const criteriaWithIds = criteria.map((criterion, index) => ({
      criterionId: `crit_${Date.now()}_${index}`,
      name: criterion.name,
      description: criterion.description || '',
      maxPoints: criterion.maxPoints
    }));

    const totalPoints = criteriaWithIds.reduce((sum, c) => sum + c.maxPoints, 0);

    const rubricData = {
      assignmentId,
      criteria: criteriaWithIds,
      totalPoints,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const validation = validateRubric(rubricData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors
      });
    }

    const rubric = await createDocument(collections.RUBRICS, rubricData);

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'create',
      'rubric',
      rubric.id,
      { created: rubricData }
    );

    return res.status(201).json({
      message: 'Rubric created successfully',
      rubric
    });

  } catch (error) {
    console.error('Create rubric error:', error);
    return res.status(500).json({
      error: 'Failed to create rubric',
    });
  }
}

async function getRubricByAssignment(req, res) {
  try {
    const professorId = req.user.uid;
    const { assignmentId } = req.params;

    const assignment = await getDocument(collections.ASSIGNMENTS, assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only view rubrics for your own assignments'
      });
    }

    const rubrics = await queryDocuments(collections.RUBRICS, [
      { field: 'assignmentId', operator: '==', value: assignmentId }
    ]);

    if (rubrics.length === 0) {
      return res.status(404).json({
        error: 'Rubric not found for this assignment'
      });
    }

    return res.status(200).json({
      rubric: rubrics[0]
    });

  } catch (error) {
    console.error('Get rubric error:', error);
    return res.status(500).json({
      error: 'Failed to fetch rubric',
    });
  }
}

async function updateRubric(req, res) {
  try {
    const professorId = req.user.uid;
    const { rubricId } = req.params;
    const { criteria } = req.body;

    const rubric = await getDocument(collections.RUBRICS, rubricId);

    if (!rubric) {
      return res.status(404).json({
        error: 'Rubric not found'
      });
    }

    const assignment = await getDocument(collections.ASSIGNMENTS, rubric.assignmentId);

    if (!assignment) {
      return res.status(404).json({
        error: 'Assignment not found'
      });
    }

    if (assignment.professorId !== professorId) {
      return res.status(403).json({
        error: 'You can only update rubrics for your own assignments'
      });
    }

    const criteriaWithIds = criteria.map((criterion, index) => ({
      criterionId: criterion.criterionId || `crit_${Date.now()}_${index}`,
      name: criterion.name,
      description: criterion.description || '',
      maxPoints: criterion.maxPoints
    }));

    const totalPoints = criteriaWithIds.reduce((sum, c) => sum + c.maxPoints, 0);

    if (totalPoints !== 100) {
      return res.status(400).json({
        error: 'Total rubric points must equal 100'
      });
    }

    const updated = await updateDocument(collections.RUBRICS, rubricId, {
      criteria: criteriaWithIds,
      totalPoints
    });

    await logAudit(
      professorId,
      req.user.name || req.user.email,
      'update',
      'rubric',
      rubricId,
      { before: rubric, after: updated }
    );

    return res.status(200).json({
      message: 'Rubric updated successfully',
      rubric: updated
    });

  } catch (error) {
    console.error('Update rubric error:', error);
    return res.status(500).json({
      error: 'Failed to update rubric',
    });
  }
}

module.exports = {
  createRubric,
  getRubricByAssignment,
  updateRubric
};