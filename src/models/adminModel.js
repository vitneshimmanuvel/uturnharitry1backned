/**
 * Admin & Sub-Admin Model
 * Handles admin accounts, permissions and activity logging
 */
const { docClient, TABLES } = require('../config/aws');
const { PutCommand, ScanCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const TABLE_NAME = TABLES.ADMINS;
const LOGS_TABLE = TABLES.ADMIN_LOGS;

/**
 * Admin Login
 */
const login = async (username, password) => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'username = :u',
        ExpressionAttributeValues: { ':u': username }
    }));

    if (!result.Items || result.Items.length === 0) return null;
    
    const admin = result.Items[0];
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    
    if (isPasswordValid) {
        delete admin.password;
        return admin;
    }
    return null;
};

/**
 * Create a new admin/sub-admin
 */
const createAdmin = async (adminData) => {
    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    
    const admin = {
        id,
        username: adminData.username,
        password: hashedPassword,
        name: adminData.name,
        email: adminData.email,
        phone: adminData.phone,
        role: adminData.role || 'sub-admin', // 'super-admin' or 'sub-admin'
        permissions: adminData.permissions || [], // e.g., ['vendors', 'drivers', 'rides', 'subscriptions']
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: admin
    }));

    delete admin.password;
    return admin;
};

/**
 * Get all admins
 */
const getAllAdmins = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    return result.Items.map(item => {
        delete item.password;
        return item;
    });
};

/**
 * Get admin by ID
 */
const getAdminById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    if (result.Item) delete result.Item.password;
    return result.Item;
};

/**
 * Update admin permissions
 */
const updatePermissions = async (id, permissions) => {
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET permissions = :p, updatedAt = :u',
        ExpressionAttributeValues: {
            ':p': permissions,
            ':u': new Date().toISOString()
        }
    }));
    return true;
};

/**
 * Change admin password
 */
const changePassword = async (id, newPassword) => {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET #password = :p, updatedAt = :u',
        ExpressionAttributeNames: { '#password': 'password' },
        ExpressionAttributeValues: {
            ':p': hashedPassword,
            ':u': new Date().toISOString()
        }
    }));
    return true;
};

/**
 * Delete an admin
 */
const deleteAdmin = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return true;
};

/**
 * Log an admin action
 */
const logAction = async (adminId, adminName, action, details = {}) => {
    const log = {
        id: uuidv4(),
        adminId,
        adminName,
        action, // e.g., 'VERIFY_VENDOR', 'BLOCK_DRIVER'
        details,
        timestamp: new Date().toISOString()
    };

    try {
        await docClient.send(new PutCommand({
            TableName: LOGS_TABLE,
            Item: log
        }));
    } catch (e) {
        console.error('Failed to log admin action:', e);
    }
};

/**
 * Get all logs
 */
const getLogs = async (limit = 100) => {
    const result = await docClient.send(new ScanCommand({
        TableName: LOGS_TABLE,
        Limit: limit
    }));
    const items = result.Items || [];
    return items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

module.exports = {
    createAdmin,
    getAllAdmins,
    getAdminById,
    updatePermissions,
    changePassword,
    deleteAdmin,
    logAction,
    getLogs,
    login
};
