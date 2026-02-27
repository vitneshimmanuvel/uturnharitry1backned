const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { s3Client, S3_BUCKET: BUCKET_NAME, awsConfig } = require('../config/aws');
const s3Service = require('./s3Service');

/**
 * Upload driver verification video to S3 (with local fallback)
 * @param {Buffer} fileBuffer - Video file buffer
 * @param {string} filename - Original filename
 * @param {string} driverId - Driver ID
 * @param {string} booking Id - Booking ID
 * @returns {Promise<string>} Video URL
 */
const uploadDriverVideo = async (fileBuffer, filename, driverId, bookingId) => {
    try {
        const fileExtension = filename.includes('.') ? filename.split('.').pop() : 'mp4';
        const uniqueFileName = `${driverId}-${uuidv4()}.${fileExtension}`;
        const folder = `driver-videos/${bookingId}`;
        
        // Use s3Service which automatically handles S3 upload OR local disk fallback
        const uploadResult = await s3Service.uploadFile(
            folder,
            uniqueFileName,
            fileBuffer,
            'video/mp4' // Assuming MP4
        );
        
        console.log(`Video uploaded successfully via S3Service: ${uploadResult.publicUrl}`);
        return uploadResult.publicUrl;
    } catch (error) {
        console.error('Video upload wrapper error:', error);
        throw new Error('Failed to upload video: ' + error.message);
    }
};

/**
 * Delete video from S3 (optional cleanup)
 * @param {string} videoUrl - Full S3 URL
 */
const deleteVideo = async (videoUrl) => {
    try {
        // Extract key from URL
        const urlParts = videoUrl.split('.com/');
        if (urlParts.length < 2) throw new Error('Invalid URL');
        
        const key = urlParts[1];
        
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key
        });
        
        await s3Client.send(command);
        console.log(`Video deleted: ${key}`);
        return true;
    } catch (error) {
        console.error('Video delete error:', error);
        return false;
    }
};

module.exports = {
    uploadDriverVideo,
    deleteVideo
};
