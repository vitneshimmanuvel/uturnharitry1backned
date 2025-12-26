/**
 * Vendor Routes - Registration, Login, Profile management
 * Phone-only authentication (no password)
 */
const express = require('express');
const router = express.Router();
const { createVendor, findVendorByPhone, findVendorById, updateVendor } = require('../models/vendorModel');
const { generateToken, authMiddleware, vendorOnly } = require('../middleware/auth');

// Register new vendor (phone-only, no password)
router.post('/register', async (req, res) => {
    try {
        const { businessName, ownerName, phone } = req.body;

        // Validate required fields (no password needed)
        if (!businessName || !ownerName || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Business name, owner name, and phone are required'
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

        // Create vendor (no password)
        const vendor = await createVendor({
            businessName,
            ownerName,
            phone
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

// Vendor login (phone-only, no password)
router.post('/login', async (req, res) => {
    try {
        const { phone } = req.body;

        // Validate required fields
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Find vendor by phone
        const vendor = await findVendorByPhone(phone);
        if (!vendor) {
            // Auto-register if not found (for seamless experience)
            return res.status(401).json({
                success: false,
                message: 'Phone number not registered. Please register first.'
            });
        }

        // Generate token
        const token = generateToken({
            id: vendor.id,
            phone: vendor.phone,
            userType: 'vendor'
        });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                vendor,
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

        res.json({
            success: true,
            data: vendor
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
        delete updates.phone;

        const updatedVendor = await updateVendor(req.user.id, updates);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updatedVendor
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
