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
        // Disable bypass for admin routes to ensure proper permissions testing
        if (req.path.startsWith('/admin')) {
            return res.status(401).json({ success: false, message: 'Authentication token required' });
        }

        // BYPASS for other routes (Driver/Vendor testing)
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

// Admin-only middleware
const adminOnly = (req, res, next) => {
    if (!req.user || req.user.userType !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admins only.'
        });
    }
    next();
};

// Middleware to check if admin has specific permission
const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user || req.user.userType !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
        }
        if (req.user.role === 'super-admin') return next();
        if (req.user.permissions && req.user.permissions.includes(permission)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            message: `Access denied. Requires ${permission} permission.`
        });
    };
};

module.exports = {
    generateToken,
    verifyToken,
    authMiddleware,
    vendorOnly,
    driverOnly,
    adminOnly,
    checkPermission
};
