const { PutCommand, ScanCommand, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = TABLE_NAMES.vehicles;

const createVehicle = async (data) => {
    const vehicle = {
        id: uuidv4(),
        ...data,
        createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: vehicle
    }));
    
    return vehicle;
};

const getAllVehicles = async () => {
    const response = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    // Sort by newest first
    const items = response.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const searchVehicles = async (query) => {
    const all = await getAllVehicles();
    if (!query) return all;
    
    const q = query.toLowerCase();
    return all.filter(v => 
        (v.name && v.name.toLowerCase().includes(q)) || 
        (v.type && v.type.toLowerCase().includes(q)) ||
        (v.description && v.description.toLowerCase().includes(q))
    );
};

const deleteVehicle = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return { success: true };
};

module.exports = {
    createVehicle,
    getAllVehicles,
    searchVehicles,
    deleteVehicle
};
