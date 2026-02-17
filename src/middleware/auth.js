/**
 * JWT Authentication Middleware
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'uturn-secret-key-2024-secure';

// Generate JWT Token
const generateToken = (payload, expiresIn = '365d') => {
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
    
    // Check if token exists
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // BYPASS: Use valid driver ID
        console.log('⚠️ No Token provided - USING BYPASS DRIVER');
        req.user = {
            id: 'b0d4b95b-6197-4428-a166-def825ab9628',
            userType: 'driver',
            phone: '1234567891'
        };
        return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
         // BYPASS: Token invalid or expired
        console.log('⚠️ Invalid Token - USING BYPASS DRIVER');
        req.user = {
            id: 'b0d4b95b-6197-4428-a166-def825ab9628',
            userType: 'driver',
            phone: '1234567891'
        };
        return next();
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
