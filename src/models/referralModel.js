/**
 * Referral Model - Referral codes and earnings
 * Table: UTurnReferrals
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'UTurnReferrals';
const REFERRAL_BONUS = 500; // ₹500 per successful referral

/**
 * Generate unique referral code
 */
const generateCode = (phone) => {
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `UTN${phone.slice(-4)}${random}`;
};

/**
 * Create referral record for vendor
 */
const createReferral = async (vendorId, phone) => {
    const code = generateCode(phone);
    
    const referral = {
        vendorId,
        code,
        referredUsers: [],
        totalReferrals: 0,
        earnings: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: referral
    }));

    return referral;
};

/**
 * Get referral by vendor ID
 */
const getReferralByVendorId = async (vendorId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { vendorId }
    }));
    
    return result.Item;
};

/**
 * Get referral by code
 */
const getReferralByCode = async (code) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'code = :code',
        ExpressionAttributeValues: {
            ':code': code.toUpperCase()
        }
    }));
    
    return result.Items?.[0] || null;
};

/**
 * Apply referral code (new user uses someone's code)
 */
const applyReferralCode = async (code, newUserId, newUserName) => {
    const referral = await getReferralByCode(code);
    
    if (!referral) {
        throw new Error('Invalid referral code');
    }
    
    // Check if already referred
    if (referral.referredUsers?.some(u => u.userId === newUserId)) {
        throw new Error('Already applied this referral');
    }

    const referredUser = {
        userId: newUserId,
        name: newUserName,
        joinedAt: new Date().toISOString(),
        bonusPaid: true
    };

    const updatedReferrals = [...(referral.referredUsers || []), referredUser];

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: referral.vendorId },
        UpdateExpression: 'SET referredUsers = :users, totalReferrals = :count, earnings = :earnings, updatedAt = :now',
        ExpressionAttributeValues: {
            ':users': updatedReferrals,
            ':count': updatedReferrals.length,
            ':earnings': (referral.earnings || 0) + REFERRAL_BONUS,
            ':now': new Date().toISOString()
        }
    }));

    return {
        success: true,
        referrerId: referral.vendorId,
        bonus: REFERRAL_BONUS
    };
};

/**
 * Get or create referral for vendor
 */
const getOrCreateReferral = async (vendorId, phone) => {
    let referral = await getReferralByVendorId(vendorId);
    
    if (!referral) {
        referral = await createReferral(vendorId, phone);
    }
    
    return referral;
};

module.exports = {
    generateCode,
    createReferral,
    getReferralByVendorId,
    getReferralByCode,
    applyReferralCode,
    getOrCreateReferral,
    REFERRAL_BONUS
};
