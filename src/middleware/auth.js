const jwt = require('jsonwebtoken');
const { Users, Faculty } = require('../services/dbService');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_rgm_tracker_2026_secure_random';

/**
 * Verifies JWT token from Authorization header using Firebase user accounts
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authentication token provided.'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Check if account still exists and is active in Firestore
    if (decoded.role === 'faculty') {
      const faculty = await Faculty.findById(decoded.id);
      if (!faculty || faculty.isActive === false) {
        return res.status(401).json({ success: false, message: 'Faculty account is inactive or not found.' });
      }
      req.userDoc = faculty;
    } else {
      const user = await Users.findById(decoded.id);
      if (!user || user.isActive === false) {
        return res.status(401).json({ success: false, message: 'User account is inactive or not found.' });
      }
      req.userDoc = user;
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session has expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid or malformed token.'
    });
  }
};

/**
 * Role-based authorization middleware
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: requires one of the following roles: [${roles.join(', ')}]. Current role: ${req.user.role}`
      });
    }

    next();
  };
};

module.exports = {
  verifyToken,
  requireRole,
  JWT_SECRET
};
