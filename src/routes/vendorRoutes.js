/**
 * Vendor Routes - Registration, Login, Profile management
 */
const express = require('express');
const router = express.Router();
const { createVendor, findVendorByPhone, findVendorById, updateVendor, verifyPassword } = require('../models/vendorModel');
const { generateToken, authMiddleware, vendorOnly } = require('../middleware/auth');

// Register new vendor
router.post('/register', async (req, res) => {
    try {
        const { businessName, ownerName, phone, email, password } = req.body;

        // Validate required fields
        if (!businessName || !ownerName || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Business name, owner name, phone, and password are required'
            });
        }

        // Check if phone already exists
        const existingVendor = await findVendorByPhone(phone);
        if (existingVendor) {
            return res.status(409).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Create vendor
        const vendor = await createVendor({
            businessName,
            ownerName,
            phone,
            email,
            password
        });

        // Generate token
        const token = generateToken({
            id: vendor.id,
            phone: vendor.phone,
            userType: 'vendor'
        });

        res.status(201).json({
            success: true,
            message: 'Vendor registered successfully',
            data: {
                vendor,
                token
            }
        });
    } catch (error) {
        console.error('Vendor registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});

// Vendor login
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Validate required fields
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'Phone and password are required'
            });
        }

        // Find vendor by phone
        const vendor = await findVendorByPhone(phone);
        if (!vendor) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Verify password
        const isValidPassword = await verifyPassword(password, vendor.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Generate token
        const token = generateToken({
            id: vendor.id,
            phone: vendor.phone,
            userType: 'vendor'
        });

        // Remove password from response
        const { password: _, ...vendorData } = vendor;

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                vendor: vendorData,
                token
            }
        });
    } catch (error) {
        console.error('Vendor login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
});

// Get vendor profile (protected)
router.get('/profile', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const vendor = await findVendorById(req.user.id);
        
        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: 'Vendor not found'
            });
        }

        // Remove password from response
        const { password, ...vendorData } = vendor;

        res.json({
            success: true,
            data: vendorData
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
});

// Update vendor profile (protected)
router.put('/profile', authMiddleware, vendorOnly, async (req, res) => {
    try {
        const updates = req.body;
        
        // Don't allow updating sensitive fields
        delete updates.id;
        delete updates.password;
        delete updates.phone;

        const updatedVendor = await updateVendor(req.user.id, updates);
        
        // Remove password from response
        const { password, ...vendorData } = updatedVendor;

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: vendorData
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
});

module.exports = router;
