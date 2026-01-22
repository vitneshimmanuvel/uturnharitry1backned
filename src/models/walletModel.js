/**
 * Wallet Model - Vendor wallet and transactions
 * Table: UTurnWallet
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
const TABLE_NAME = 'UTurnWallet';

/**
 * Initialize wallet for a vendor
 */
const initWallet = async (vendorId) => {
    const wallet = {
        vendorId,
        balance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
        transactions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: wallet,
        ConditionExpression: 'attribute_not_exists(vendorId)'
    })).catch(() => {
        // Wallet already exists, ignore
    });

    return wallet;
};

/**
 * Get wallet by vendor ID
 */
const getWallet = async (vendorId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { vendorId }
    }));
    
    if (!result.Item) {
        return await initWallet(vendorId);
    }
    
    return result.Item;
};

/**
 * Add transaction to wallet
 */
const addTransaction = async (vendorId, { type, amount, description, bookingId }) => {
    const wallet = await getWallet(vendorId);
    
    const transaction = {
        id: uuidv4(),
        type, // 'credit' or 'debit'
        amount,
        description,
        bookingId,
        balance: type === 'credit' 
            ? wallet.balance + amount 
            : wallet.balance - amount,
        createdAt: new Date().toISOString()
    };

    const newBalance = transaction.balance;
    const transactions = [transaction, ...(wallet.transactions || [])].slice(0, 100); // Keep last 100

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId },
        UpdateExpression: 'SET balance = :balance, transactions = :transactions, totalEarnings = :earnings, updatedAt = :now',
        ExpressionAttributeValues: {
            ':balance': newBalance,
            ':transactions': transactions,
            ':earnings': type === 'credit' 
                ? (wallet.totalEarnings || 0) + amount 
                : wallet.totalEarnings || 0,
            ':now': new Date().toISOString()
        }
    }));

    return { balance: newBalance, transaction };
};

/**
 * Get wallet transactions
 */
const getTransactions = async (vendorId, limit = 50) => {
    const wallet = await getWallet(vendorId);
    return (wallet.transactions || []).slice(0, limit);
};

/**
 * Process vendor commission from a completed trip
 */
const processCommission = async (vendorId, bookingId, amount, description) => {
    return await addTransaction(vendorId, {
        type: 'credit',
        amount,
        description: description || 'Trip Commission',
        bookingId
    });
};

module.exports = {
    initWallet,
    getWallet,
    addTransaction,
    getTransactions,
    processCommission
};
