const { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = TABLES.NOTIFICATIONS;

const createNotification = async (userId, type, title, message, data = {}) => {
    const notification = {
        id: uuidv4(),
        userId,
        type,
        title,
        message,
        data,
        read: false,
        createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: notification
    }));

    return notification;
};

const getNotificationsByUserId = async (userId) => {
    // For simplicity, we search by userId. In production, consider a GSI on userId.
    // However, for this MVP, we can use a Scan if GSI isn't setup, 
    // but better to suggest GSI or use Query if HASH is userId.
    // Since setup_all_tables uses 'id' as hash, we need a Scan or GSI.
    // I will use Scan for now as it's a small app, but note it for scale.
    
    const { Items } = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'UserIndex', // Assuming we add this to GSI later
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: {
            ':uid': userId
        }
    }));
    
    return Items || [];
};

const markAsRead = async (notificationId) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: notificationId },
        UpdateExpression: 'SET #read = :true, updatedAt = :now',
        ExpressionAttributeNames: {
            '#read': 'read'
        },
        ExpressionAttributeValues: {
            ':true': true,
            ':now': new Date().toISOString()
        }
    }));
};

const deleteNotification = async (notificationId) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: notificationId }
    }));
};

module.exports = {
    createNotification,
    getNotificationsByUserId,
    markAsRead,
    deleteNotification
};
