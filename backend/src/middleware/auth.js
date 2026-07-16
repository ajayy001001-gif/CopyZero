const { auth } = require('../config/firebase');

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'No token provided' 
      });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }
}

function checkVITEmail(req, res, next) {
  const email = req.user.email;
  const vitDomains = ['@vit.ac.in', '@vitstudent.ac.in'];
  
  const isVIT = vitDomains.some(domain => email.endsWith(domain));
  
  if (!isVIT) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Only VIT email addresses are allowed' 
    });
  }
  
  next();
}

function checkRole(allowedRoles) {
  return async (req, res, next) => {
    try {
      const { db } = require('../config/firebase');
      const userId = req.user.uid;
      
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({ 
          error: 'User profile not found' 
        });
      }
      
      const userRole = userDoc.data().role;
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: `This action requires role: ${allowedRoles.join(' or ')}` 
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Role verification error:', error);
      return res.status(500).json({
        error: 'Role verification failed'
      });
    }
  };
}
module.exports = {
  verifyToken,
  checkVITEmail,
  checkRole
};