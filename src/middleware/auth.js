/**
 * JWT Authentication Middleware
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'uturn-secret-key-2024-secure';

// Generate JWT Token
const generateToken = (payload, expiresIn = '30d') => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

// Verify JWT Token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Auth Middleware
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authorization token required'
        });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }

    req.user = decoded;
    next();
};

// Vendor-only middleware
const vendorOnly = (req, res, next) => {
    if (req.user.userType !== 'vendor') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Vendors only.'
        });
    }
    next();
};

// Driver-only middleware
const driverOnly = (req, res, next) => {
    if (req.user.userType !== 'driver') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Drivers only.'
        });
    }
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    authMiddleware,
    vendorOnly,
    driverOnly
};
