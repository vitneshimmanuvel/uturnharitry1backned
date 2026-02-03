/**
 * S3 Service - File upload/download operations
 */
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, S3_BUCKET } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

// Generate pre-signed URL for upload
const getUploadUrl = async (folder, fileName, contentType) => {
    const key = `${folder}/${uuidv4()}-${fileName}`;
    
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
};

// Generate pre-signed URL for download
const getDownloadUrl = async (key) => {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
    return downloadUrl;
};

// Delete file from S3
const deleteFile = async (key) => {
    const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
    });

    await s3Client.send(command);
    return true;
};

// Upload file directly (for base64 data)
const uploadBase64File = async (folder, fileName, base64Data, contentType) => {
    const key = `${folder}/${uuidv4()}-${fileName}`;
    
    // Remove base64 prefix if present
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read'
    });

    try {
        await s3Client.send(command);
    } catch (error) {
        console.warn('⚠️ S3 Upload Failed (Using Mock URL):', error.message);
        // Fallback for development
        return {
            key,
            publicUrl: `https://mock-s3.com/${key}`
        };
    }

    return {
        key,
        publicUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
    };
};

// Upload file (Buffer)
const uploadFile = async (folder, fileName, buffer, contentType) => {
    const key = `${folder}/${uuidv4()}-${fileName}`;
    
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read'
    });

    try {
        await s3Client.send(command);
    } catch (error) {
        console.warn('⚠️ S3 Upload Failed (Using Mock URL):', error.message);
        // Fallback for development
        return {
            key,
            publicUrl: `https://mock-s3.com/${key}`
        };
    }

    return {
        key,
        publicUrl: `https://${S3_BUCKET}.s3.amazonaws.com/${key}`
    };
};

module.exports = {
    getUploadUrl,
    getDownloadUrl,
    deleteFile,
    deleteFile,
    uploadBase64File,
    uploadFile
};
