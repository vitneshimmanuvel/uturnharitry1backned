const { v4: uuidv4 } = require('uuid');
const { docClient } = require('../config/aws');
const { PutCommand, GetCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'UTurnJobs';

const createJob = async (jobData) => {
    const id = uuidv4();
    const job = {
        id,
        creatorId: jobData.creatorId,
        creatorType: jobData.creatorType, // 'vendor' or 'driver'
        companyName: jobData.companyName,
        jobTitle: jobData.jobTitle,
        salaryPerMonth: jobData.salaryPerMonth,
        location: jobData.location,
        contactNumber: jobData.contactNumber,
        createdAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: job
    }));

    return job;
};

const getAllJobs = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    return result.Items || [];
};

const getJobsByCreator = async (creatorId) => {
    try {
        const command = new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'creator-index',
            KeyConditionExpression: 'creatorId = :creatorId',
            ExpressionAttributeValues: {
                ':creatorId': creatorId
            }
        });
        const result = await docClient.send(command);
        return result.Items || [];
    } catch (error) {
        // Fallback to Scan if index is not ready
        const scanCommand = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'creatorId = :creatorId',
            ExpressionAttributeValues: {
                ':creatorId': creatorId
            }
        });
        const result = await docClient.send(scanCommand);
        return result.Items || [];
    }
};

const getJobById = async (id) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return result.Item;
};

const deleteJob = async (id) => {
    await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id }
    }));
    return true;
};

module.exports = {
    createJob,
    getAllJobs,
    getJobsByCreator,
    getJobById,
    deleteJob,
    TABLE_NAME
};
