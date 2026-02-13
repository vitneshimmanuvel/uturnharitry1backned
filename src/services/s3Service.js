/**
 * S3 Service - File upload/download operations
 */
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, S3_BUCKET } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
let uploadDir = path.join(__dirname, '../../public/uploads');
try {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
} catch (error) {
    console.warn('⚠️ Read-only filesystem detected, using /tmp for uploads:', error.message);
    uploadDir = '/tmp';
}

// Helper to save file locally
const saveFileLocally = (folder, fileName, buffer) => {
    const uniqueName = `${uuidv4()}-${fileName}`;
    const filePath = path.join(uploadDir, uniqueName);
    fs.writeFileSync(filePath, buffer);
    // Use localhost or machine IP for development
    // For Android Emulator use 10.0.2.2, for real device use LAN IP
    // Here we default to localhost:3000 for simplicity in web testing
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return {
        key: `${folder}/${uniqueName}`,
        publicUrl: `${baseUrl}/uploads/${uniqueName}`
    };
};

// Generate pre-signed URL for upload
const getUploadUrl = async (folder, fileName, contentType) => {
    const key = `${folder}/${uuidv4()}-${fileName}`;
    
    try {
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            ContentType: contentType
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

        return {
            uploadUrl,
            key,
            publicUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
        };
    } catch (error) {
        console.warn('⚠️ S3 Signed URL Failed:', error.message);
        throw error;
    }
};

// Generate pre-signed URL for download
const getDownloadUrl = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        });

        const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
        return downloadUrl;
    } catch (error) {
        // Fallback for local files
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        return `${baseUrl}/uploads/${path.basename(key)}`;
    }
};

// Delete file from S3
const deleteFile = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        });

        await s3Client.send(command);
        return true;
    } catch (error) {
        // Try delete local file
        try {
            const filePath = path.join(uploadDir, path.basename(key));
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
        } catch (e) {
            console.error('Local delete failed:', e);
        }
        return false;
    }
};

// Upload base64 file directly
const uploadBase64File = async (folder, fileName, base64Data, contentType) => {
    // Remove base64 prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    // Try S3 first
    try {
        const key = `${folder}/${uuidv4()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });

        await s3Client.send(command);
        
        return {
            key,
            publicUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
        };
    } catch (error) {
        console.warn('⚠️ S3 Upload Failed (Using Local Storage):', error.message);
        return saveFileLocally(folder, fileName, buffer);
    }
};

// Upload file (Buffer)
const uploadFile = async (folder, fileName, buffer, contentType) => {
    // Try S3 first
    try {
        const key = `${folder}/${uuidv4()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });

        await s3Client.send(command);
        
        return {
            key,
            publicUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
        };
    } catch (error) {
        console.warn('⚠️ S3 Upload Failed (Using Local Storage):', error.message);
        return saveFileLocally(folder, fileName, buffer);
    }
};

module.exports = {
    getUploadUrl,
    getDownloadUrl,
    deleteFile,
    uploadBase64File,
    uploadFile
};
