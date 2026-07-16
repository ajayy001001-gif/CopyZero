function validateAssignment(data) {
  const errors = [];
  
  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  }
  
  if (!data.description || data.description.trim().length === 0) {
    errors.push('Description is required');
  }
  
  if (!['essay', 'code'].includes(data.type)) {
    errors.push('Type must be essay or code');
  }
  
  if (!data.dueDate) {
    errors.push('Due date is required');
  }
  
  if (typeof data.plagiarismWeightage !== 'number' || 
      data.plagiarismWeightage < 0 || 
      data.plagiarismWeightage > 100) {
    errors.push('Plagiarism weightage must be between 0 and 100');
  }
  
  if (typeof data.criteriaWeightage !== 'number' || 
      data.criteriaWeightage < 0 || 
      data.criteriaWeightage > 100) {
    errors.push('Criteria weightage must be between 0 and 100');
  }
  
  if (data.plagiarismWeightage + data.criteriaWeightage !== 100) {
    errors.push('Plagiarism and criteria weightages must sum to 100');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateRubric(data) {
  const errors = [];
  
  if (!data.assignmentId) {
    errors.push('Assignment ID is required');
  }
  
  if (!Array.isArray(data.criteria) || data.criteria.length === 0) {
    errors.push('At least one criterion is required');
  }
  
  if (data.criteria) {
    data.criteria.forEach((criterion, index) => {
      if (!criterion.name || criterion.name.trim().length === 0) {
        errors.push(`Criterion ${index + 1}: Name is required`);
      }
      
      if (typeof criterion.maxPoints !== 'number' || criterion.maxPoints <= 0) {
        errors.push(`Criterion ${index + 1}: Max points must be a positive number`);
      }
    });
    
    const totalPoints = data.criteria.reduce((sum, c) => sum + (c.maxPoints || 0), 0);
    if (totalPoints !== 100) {
      errors.push('Total rubric points must equal 100');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateSubmission(data) {
  const errors = [];
  
  if (!data.assignmentId) {
    errors.push('Assignment ID is required');
  }
  
  if (!data.fileName || data.fileName.trim().length === 0) {
    errors.push('File name is required');
  }
  
  if (!data.fileContent || data.fileContent.trim().length === 0) {
    errors.push('File content is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function validateScore(data) {
  const errors = [];
  
  if (!data.submissionId) {
    errors.push('Submission ID is required');
  }
  
  if (typeof data.plagiarismScore !== 'number' || 
      data.plagiarismScore < 0 || 
      data.plagiarismScore > 100) {
    errors.push('Plagiarism score must be between 0 and 100');
  }
  
  if (!Array.isArray(data.criteriaScores) || data.criteriaScores.length === 0) {
    errors.push('Criteria scores are required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateAssignment,
  validateRubric,
  validateSubmission,
  validateScore
};