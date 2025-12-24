/**
 * UTurn Backend Server - Main Entry Point
 * Serves both Vendor and Driver apps with AWS DynamoDB + S3
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes
const vendorRoutes = require('./routes/vendorRoutes');
const driverRoutes = require('./routes/driverRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Import database setup
const { setupTables } = require('./utils/dbSetup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'UTurn Backend Server is running',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use('/api/vendor', vendorRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/upload', uploadRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

// Start server
const startServer = async () => {
    try {
        // Try to setup DynamoDB tables - but don't fail if AWS is not configured
        console.log('Attempting to connect to DynamoDB...');
        try {
            await setupTables();
            console.log('✅ DynamoDB tables ready!');
        } catch (awsError) {
            console.warn('⚠️ DynamoDB setup warning:', awsError.message);
            console.warn('⚠️ Server will continue but database features may not work.');
            console.warn('⚠️ Please verify your AWS credentials in .env file.');
        }

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🚀 UTurn Backend Server running on port ${PORT}`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`📍 Health: http://localhost:${PORT}/health`);
            console.log(`\n📱 Vendor API: http://localhost:${PORT}/api/vendor`);
            console.log(`🚗 Driver API: http://localhost:${PORT}/api/driver`);
            console.log(`📤 Upload API: http://localhost:${PORT}/api/upload`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
