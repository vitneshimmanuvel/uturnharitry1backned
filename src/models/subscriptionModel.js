/**
 * Subscription Model - Manage subscription plans and user subscriptions
 * Table: UTurnSubscriptions
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// DynamoDB Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'UTurnSubscriptions';
const PLANS_TABLE = 'UTurnSubscriptionPlans';

/**
 * Seed Default Subscription Plans if none exist
 */
const seedDefaultPlans = async () => {
    try {
        const existingPlans = await docClient.send(new ScanCommand({ TableName: PLANS_TABLE }));
        if (existingPlans.Items && existingPlans.Items.length > 0) {
            return; // Plans already exist
        }

        const defaultPlans = [
            {
                id: 'driver_basic_monthly',
                targetUserType: 'driver',
                name: 'Driver Basic',
                description: 'Get started with essential features',
                amount: 299,
                duration: 30, // days
                features: ['Access to ride bookings', 'Basic wallet features', 'Standard support'],
                color: '#2196F3', // Blue
                icon: 'star_border',
                popular: false,
                createdAt: new Date().toISOString()
            },
            {
                id: 'driver_standard_monthly',
                targetUserType: 'driver',
                name: 'Driver Standard',
                description: 'Most popular plan for active drivers',
                amount: 499,
                duration: 30,
                features: ['All Basic features', 'Priority ride access', 'Reduced commission', 'Priority support'],
                color: '#7B2CBF', // Purple
                icon: 'star_half',
                popular: true,
                createdAt: new Date().toISOString()
            },
            {
                id: 'vendor_standard_monthly',
                targetUserType: 'vendor',
                name: 'Vendor Standard',
                description: 'Standard plan for vendors',
                amount: 999,
                duration: 30,
                features: ['Access to driver network', 'Manage bookings', 'Vendor dashboard'],
                color: '#FFD700', // Gold
                icon: 'store',
                popular: true,
                createdAt: new Date().toISOString()
            }
        ];

        for (const plan of defaultPlans) {
            await docClient.send(new PutCommand({
                TableName: PLANS_TABLE,
                Item: plan
            }));
        }
        console.log(`✅ Seeded ${defaultPlans.length} default subscription plans`);
    } catch (error) {
        console.error('Error seeding subscription plans:', error);
    }
};

/**
 * Get all available subscription plans (optionally filtered by userType)
 */
const getPlans = async (userType = null) => {
    let params = { TableName: PLANS_TABLE };
    if (userType) {
        params.FilterExpression = 'targetUserType = :type OR targetUserType = :both';
        params.ExpressionAttributeValues = {
            ':type': userType,
            ':both': 'both'
        };
    }

    const result = await docClient.send(new ScanCommand(params));
    return result.Items || [];
};

/**
 * Get a specific plan by ID
 */
const getPlanById = async (planId) => {
    const result = await docClient.send(new GetCommand({
        TableName: PLANS_TABLE,
        Key: { id: planId }
    }));
    return result.Item || null;
};

/**
 * Create a new subscription plan (Admin)
 */
const createPlan = async (planData) => {
    const plan = {
        id: uuidv4(),
        ...planData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: PLANS_TABLE,
        Item: plan
    }));
    return plan;
};

/**
 * Update an existing subscription plan (Admin)
 */
const updatePlan = async (planId, planData) => {
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
        ':updatedAt': new Date().toISOString()
    };

    for (const key of Object.keys(planData)) {
        if (key !== 'id' && key !== 'createdAt') {
            updateExpressions.push(`#${key} = :${key}`);
            expressionAttributeNames[`#${key}`] = key;
            expressionAttributeValues[`:${key}`] = planData[key];
        }
    }

    const updateExpressionStr = 'SET ' + updateExpressions.join(', ') + ', #updatedAt = :updatedAt';
    expressionAttributeNames['#updatedAt'] = 'updatedAt';

    await docClient.send(new UpdateCommand({
        TableName: PLANS_TABLE,
        Key: { id: planId },
        UpdateExpression: updateExpressionStr,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
    }));

    return await getPlanById(planId);
};

/**
 * Delete a subscription plan (Admin)
 */
const deletePlan = async (planId) => {
    const { DeleteCommand } = require('@aws-sdk/lib-dynamodb');
    await docClient.send(new DeleteCommand({
        TableName: PLANS_TABLE,
        Key: { id: planId }
    }));
    return true;
};

/**
 * Create a new subscription
 */
const createSubscription = async (userId, userType, planId) => {
    const plan = await getPlanById(planId);
    if (!plan) {
        throw new Error('Invalid subscription plan');
    }

    const now = new Date();
    const endDate = new Date(now.getTime() + plan.duration * 24 * 60 * 60 * 1000);

    const subscription = {
        id: uuidv4(),
        userId,
        userType, // 'driver' or 'vendor'
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        duration: plan.duration,
        startDate: now.toISOString(),
        endDate: endDate.toISOString(),
        status: 'active',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: subscription
    }));

    return subscription;
};

/**
 * Get active subscription for a user
 */
const getActiveSubscription = async (userId) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'userId = :userId AND #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':userId': userId,
            ':status': 'active'
        }
    }));

    if (result.Items && result.Items.length > 0) {
        // Check if subscription is still valid
        const sub = result.Items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
        
        if (new Date(sub.endDate) < new Date()) {
            // Subscription has expired, update status
            await docClient.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: { id: sub.id },
                UpdateExpression: 'SET #status = :expired, updatedAt = :now',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':expired': 'expired',
                    ':now': new Date().toISOString()
                }
            }));
            return null;
        }
        
        return sub;
    }
    
    return null;
};

/**
 * Get subscription history for a user
 */
const getSubscriptionHistory = async (userId) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId }
    }));

    return (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Get all subscriptions (for admin)
 */
const getAllSubscriptions = async (statusFilter = null) => {
    let params = { TableName: TABLE_NAME };
    
    if (statusFilter) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { ':status': statusFilter };
    }

    const result = await docClient.send(new ScanCommand(params));
    return (result.Items || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Cancel a subscription
 */
const cancelSubscription = async (subscriptionId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: subscriptionId },
        UpdateExpression: 'SET #status = :cancelled, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':cancelled': 'cancelled',
            ':now': new Date().toISOString()
        }
    }));
};

/**
 * Get subscription stats (for admin dashboard)
 */
const getSubscriptionStats = async () => {
    const all = await getAllSubscriptions();
    
    const active = all.filter(s => s.status === 'active' && new Date(s.endDate) > new Date());
    const expired = all.filter(s => s.status === 'expired' || new Date(s.endDate) <= new Date());
    const cancelled = all.filter(s => s.status === 'cancelled');
    
    const totalRevenue = all.reduce((sum, s) => sum + (s.amount || 0), 0);
    const activeRevenue = active.reduce((sum, s) => sum + (s.amount || 0), 0);
    
    const driverSubs = active.filter(s => s.userType === 'driver').length;
    const vendorSubs = active.filter(s => s.userType === 'vendor').length;
    
    return {
        total: all.length,
        active: active.length,
        expired: expired.length,
        cancelled: cancelled.length,
        totalRevenue,
        activeRevenue,
        driverSubscriptions: driverSubs,
        vendorSubscriptions: vendorSubs
    };
};

module.exports = {
    getPlans,
    getPlanById,
    createPlan,
    updatePlan,
    deletePlan,
    createSubscription,
    getActiveSubscription,
    getSubscriptionHistory,
    getAllSubscriptions,
    cancelSubscription,
    getSubscriptionStats,
    seedDefaultPlans
};
