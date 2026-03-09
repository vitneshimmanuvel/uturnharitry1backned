/**
 * Wallet Model - Universal wallet for both Vendor and Driver
 * Table: UTurnWallet
 * Key: userId (previously vendorId, now supports both)
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
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
 * Initialize wallet for a user (vendor or driver)
 * Uses vendorId as the key field for backward compatibility
 */
const initWallet = async (userId) => {
    const wallet = {
        vendorId: userId, // Keep 'vendorId' as the DynamoDB key for backward compatibility
        balance: 0,
        totalEarnings: 0,
        totalWithdrawals: 0,
        totalAddedMoney: 0,
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
 * Get wallet by user ID (vendorId key for backward compat)
 */
const getWallet = async (userId) => {
    const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: userId }
    }));
    
    if (!result.Item) {
        return await initWallet(userId);
    }
    
    return result.Item;
};

/**
 * Add money to wallet
 */
const addMoney = async (userId, amount, description = 'Added money to wallet') => {
    const wallet = await getWallet(userId);
    
    const transaction = {
        id: uuidv4(),
        type: 'credit',
        category: 'add_money',
        amount,
        description,
        balance: wallet.balance + amount,
        createdAt: new Date().toISOString()
    };

    const newBalance = transaction.balance;
    const transactions = [transaction, ...(wallet.transactions || [])].slice(0, 100);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: userId },
        UpdateExpression: 'SET balance = :balance, transactions = :transactions, totalAddedMoney = :addedMoney, updatedAt = :now',
        ExpressionAttributeValues: {
            ':balance': newBalance,
            ':transactions': transactions,
            ':addedMoney': (wallet.totalAddedMoney || 0) + amount,
            ':now': new Date().toISOString()
        }
    }));

    return { balance: newBalance, transaction };
};

/**
 * Deduct money from wallet (for subscriptions, etc.)
 */
const deductMoney = async (userId, amount, description = 'Wallet deduction') => {
    const wallet = await getWallet(userId);
    
    if (wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
    }

    const transaction = {
        id: uuidv4(),
        type: 'debit',
        category: 'subscription',
        amount,
        description,
        balance: wallet.balance - amount,
        createdAt: new Date().toISOString()
    };

    const newBalance = transaction.balance;
    const transactions = [transaction, ...(wallet.transactions || [])].slice(0, 100);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: userId },
        UpdateExpression: 'SET balance = :balance, transactions = :transactions, totalWithdrawals = :withdrawals, updatedAt = :now',
        ExpressionAttributeValues: {
            ':balance': newBalance,
            ':transactions': transactions,
            ':withdrawals': (wallet.totalWithdrawals || 0) + amount,
            ':now': new Date().toISOString()
        }
    }));

    return { balance: newBalance, transaction };
};

/**
 * Add transaction to wallet (generic - backward compatible)
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
const getTransactions = async (userId, limit = 50) => {
    const wallet = await getWallet(userId);
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

/**
 * Get all wallets (for admin)
 */
const getAllWallets = async () => {
    const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME
    }));
    return result.Items || [];
};

/**
 * Request a withdrawal from wallet
 */
const requestWithdrawal = async (userId, amount, upiId = '', bankDetails = {}) => {
    const wallet = await getWallet(userId);
    
    if (wallet.balance < amount) {
        throw new Error('Insufficient balance');
    }

    const transaction = {
        id: uuidv4(),
        type: 'debit',
        category: 'withdrawal',
        status: 'pending',
        amount,
        upiId,
        bankDetails,
        description: 'Withdrawal Request',
        balance: wallet.balance - amount,
        createdAt: new Date().toISOString()
    };

    const newBalance = transaction.balance;
    const transactions = [transaction, ...(wallet.transactions || [])].slice(0, 100);

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: userId },
        UpdateExpression: 'SET balance = :balance, transactions = :transactions, updatedAt = :now',
        ExpressionAttributeValues: {
            ':balance': newBalance,
            ':transactions': transactions,
            ':now': new Date().toISOString()
        }
    }));

    return { balance: newBalance, transaction };
};

/**
 * Get all withdrawals (optionally filtered by status)
 */
const getAllWithdrawals = async (status = null) => {
    const wallets = await getAllWallets();
    let allWithdrawals = [];

    wallets.forEach(wallet => {
        const userWithdrawals = (wallet.transactions || []).filter(t => t.category === 'withdrawal');
        userWithdrawals.forEach(w => {
            allWithdrawals.push({
                ...w,
                userId: wallet.vendorId,
                userName: wallet.name || wallet.ownerName || 'User'
            });
        });
    });

    if (status) {
        allWithdrawals = allWithdrawals.filter(w => w.status === status);
    }

    return allWithdrawals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Update withdrawal status (Approve/Reject)
 */
const updateWithdrawalStatus = async (userId, transactionId, status, rejectionReason = '') => {
    const wallet = await getWallet(userId);
    let transactions = [...(wallet.transactions || [])];
    const txnIndex = transactions.findIndex(t => t.id === transactionId);
    
    if (txnIndex === -1) throw new Error('Transaction not found');
    
    const txn = transactions[txnIndex];
    if (txn.status !== 'pending') throw new Error('Transaction already processed');
    
    txn.status = status;
    txn.updatedAt = new Date().toISOString();
    if (rejectionReason) txn.rejectionReason = rejectionReason;
    
    let newBalance = wallet.balance;
    
    // If rejected, refund the money
    if (status === 'rejected') {
        newBalance += txn.amount;
        
        // Add a refund transaction
        const refundTxn = {
            id: uuidv4(),
            type: 'credit',
            category: 'refund',
            amount: txn.amount,
            description: `Refund for rejected withdrawal: ${rejectionReason || 'No reason provided'}`,
            balance: newBalance,
            createdAt: new Date().toISOString()
        };
        transactions = [refundTxn, ...transactions].slice(0, 100);
    }

    await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { vendorId: userId },
        UpdateExpression: 'SET balance = :balance, transactions = :transactions, updatedAt = :now',
        ExpressionAttributeValues: {
            ':balance': newBalance,
            ':transactions': transactions,
            ':now': new Date().toISOString()
        }
    }));

    return { balance: newBalance, status };
};

module.exports = {
    initWallet,
    getWallet,
    addMoney,
    deductMoney,
    addTransaction,
    getTransactions,
    processCommission,
    getAllWallets,
    requestWithdrawal,
    getAllWithdrawals,
    updateWithdrawalStatus
};
