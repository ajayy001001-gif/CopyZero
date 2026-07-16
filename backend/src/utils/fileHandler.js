function validateFileSize(base64String) {
  const sizeInBytes = Buffer.from(base64String, 'base64').length;
  const sizeInMB = sizeInBytes / (1024 * 1024);

  const MAX_SIZE_MB = 1;

  if (sizeInMB > MAX_SIZE_MB) {
    return {
      valid: false,
      size: sizeInMB.toFixed(2),
      message: `File size (${sizeInMB.toFixed(2)}MB) exceeds limit of ${MAX_SIZE_MB}MB`
    };
  }

  return {
    valid: true,
    size: sizeInMB.toFixed(2),
    message: 'File size is valid'
  };
}

function validateFileType(filename, allowedTypes = ['.txt', '.pdf', '.doc', '.docx', '.js', '.py', '.java', '.cpp', '.c']) {
  const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();

  if (!allowedTypes.includes(extension)) {
    return {
      valid: false,
      extension,
      message: `File type ${extension} not allowed. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  return {
    valid: true,
    extension,
    message: 'File type is valid'
  };
}

function extractTextFromBase64(base64String) {
  try {
    const buffer = Buffer.from(base64String, 'base64');
    return buffer.toString('utf-8');
  } catch (error) {
    console.error('Error extracting text:', error);
    return null;
  }
}

function calculateFileHash(content) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = {
  validateFileSize,
  validateFileType,
  extractTextFromBase64,
  calculateFileHash
};
