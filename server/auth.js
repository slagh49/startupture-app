const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'starrupture-secret-change-me';
const JWT_EXPIRES = '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Express middleware — requires valid JWT (cookie or Authorization header)
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Non authentifié' });
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

// Middleware — requires admin role
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    next();
  });
}

module.exports = { signToken, verifyToken, requireAuth, requireAdmin };
