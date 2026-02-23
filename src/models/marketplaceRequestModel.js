const { PutCommand, ScanCommand, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLES } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = TABLES.MARKETPLACE_REQUESTS;

const createRequest = async (data) => {
    const request = {
        id: uuidv4(),
        ...data,
        createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: request
    }));
    
    return request;
};

const getAllRequests = async () => {
    const response = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    // Sort by newest first
    const items = response.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const searchRequests = async (query) => {
    const all = await getAllRequests();
    if (!query) return all;
    
    const q = query.toLowerCase();
    return all.filter(r => 
        (r.vehicleModel && r.vehicleModel.toLowerCase().includes(q)) || 
        (r.vehicleType && r.vehicleType.toLowerCase().includes(q)) ||
        (r.contactNumber && r.contactNumber.toLowerCase().includes(q))
    );
};

const deleteRequest = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return { success: true };
};

module.exports = {
    createRequest,
    getAllRequests,
    searchRequests,
    deleteRequest
};
