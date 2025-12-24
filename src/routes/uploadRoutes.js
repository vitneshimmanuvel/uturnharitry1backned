/**
 * Upload Routes - File upload management
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { getUploadUrl, getDownloadUrl, uploadBase64File } = require('../services/s3Service');

// Get pre-signed URL for any upload
router.post('/url', authMiddleware, async (req, res) => {
    try {
        const { folder, fileName, contentType } = req.body;

        if (!folder || !fileName || !contentType) {
            return res.status(400).json({
                success: false,
                message: 'Folder, file name, and content type are required'
            });
        }

        const uploadData = await getUploadUrl(folder, fileName, contentType);

        res.json({
            success: true,
            data: uploadData
        });
    } catch (error) {
        console.error('Get upload URL error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate upload URL',
            error: error.message
        });
    }
});

// Get pre-signed URL for download
router.post('/download-url', authMiddleware, async (req, res) => {
    try {
        const { key } = req.body;

        if (!key) {
            return res.status(400).json({
                success: false,
                message: 'File key is required'
            });
        }

        const downloadUrl = await getDownloadUrl(key);

        res.json({
            success: true,
            data: { downloadUrl }
        });
    } catch (error) {
        console.error('Get download URL error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate download URL',
            error: error.message
        });
    }
});

// Upload base64 file directly
router.post('/base64', authMiddleware, async (req, res) => {
    try {
        const { folder, fileName, base64Data, contentType } = req.body;

        if (!folder || !fileName || !base64Data || !contentType) {
            return res.status(400).json({
                success: false,
                message: 'Folder, file name, base64 data, and content type are required'
            });
        }

        const result = await uploadBase64File(folder, fileName, base64Data, contentType);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: result
        });
    } catch (error) {
        console.error('Base64 upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
            error: error.message
        });
    }
});

module.exports = router;
