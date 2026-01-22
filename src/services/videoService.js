const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

// AWS S3 Configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * Upload driver verification video to S3
 * @param {Buffer} fileBuffer - Video file buffer
 * @param {string} filename - Original filename
 * @param {string} driverId - Driver ID
 * @param {string} booking Id - Booking ID
 * @returns {Promise<string>} Video URL
 */
const uploadDriverVideo = async (fileBuffer, filename, driverId, bookingId) => {
    try {
        const fileExtension = filename.split('.').pop();
        const key = `driver-videos/${bookingId}/${driverId}-${uuidv4()}.${fileExtension}`;
        
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: 'video/mp4', // Assuming MP4, adjust if needed
            ACL: 'public-read' // Make video publicly accessible
        });
        
        await s3Client.send(command);
        
        // Construct public URL
        const videoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        
        console.log(`Video uploaded successfully: ${videoUrl}`);
        return videoUrl;
    } catch (error) {
        console.error('Video upload error:', error);
        throw new Error('Failed to upload video');
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
