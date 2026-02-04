const { PutCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAMES } = require('../config/aws');
const { v4: uuidv4 } = require('uuid');

const TABLE_NAME = TABLE_NAMES.loans;

const createLoan = async (data) => {
    const loan = {
        id: uuidv4(),
        ...data,
        createdAt: new Date().toISOString()
    };
    
    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: loan
    }));
    
    return loan;
};

const getAllLoans = async () => {
    const response = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    const items = response.Items || [];
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const deleteLoan = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return { success: true };
};

module.exports = {
    createLoan,
    getAllLoans,
    deleteLoan
};
