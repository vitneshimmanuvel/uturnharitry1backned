/**
 * Subscription Routes - Universal subscription endpoints for both Driver and Vendor
 * Accessible via /api/subscription
 */
const express = require('express');
const router = express.Router();
const subscriptionModel = require('../models/subscriptionModel');
const walletModel = require('../models/walletModel');
const { authMiddleware } = require('../middleware/auth');

// Get all available subscription plans
router.get('/plans', async (req, res) => {
    try {
        const plans = await subscriptionModel.getPlans();
        res.json({
            success: true,
            data: { plans }
        });
    } catch (error) {
        console.error('Get plans error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch plans', error: error.message });
    }
});

// Get current user's active subscription
router.get('/my-subscription', authMiddleware, async (req, res) => {
    try {
        const subscription = await subscriptionModel.getActiveSubscription(req.user.id);
        res.json({
            success: true,
            data: { subscription }
        });
    } catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch subscription', error: error.message });
    }
});

// Get subscription history
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const history = await subscriptionModel.getSubscriptionHistory(req.user.id);
        res.json({
            success: true,
            data: { subscriptions: history }
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history', error: error.message });
    }
});

// Subscribe to a plan (deducts from wallet)
router.post('/subscribe', authMiddleware, async (req, res) => {
    try {
        const { planId } = req.body;
        
        if (!planId) {
            return res.status(400).json({ success: false, message: 'Plan ID is required' });
        }

        // Get the plan
        const plan = await subscriptionModel.getPlanById(planId);
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Subscription plan not found' });
        }

        // Check if user already has an active subscription
        const existingSub = await subscriptionModel.getActiveSubscription(req.user.id);
        if (existingSub) {
            return res.status(400).json({ 
                success: false, 
                message: 'You already have an active subscription. Wait for it to expire or cancel it first.' 
            });
        }

        // Check wallet balance
        const wallet = await walletModel.getWallet(req.user.id);
        if (wallet.balance < plan.amount) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient wallet balance. You need ₹${plan.amount} but have ₹${wallet.balance}. Please add money to your wallet first.`,
                data: {
                    required: plan.amount,
                    available: wallet.balance,
                    deficit: plan.amount - wallet.balance
                }
            });
        }

        // Deduct from wallet
        const userType = req.user.userType || 'driver';
        await walletModel.deductMoney(
            req.user.id, 
            plan.amount, 
            `Subscription: ${plan.name} Plan (${plan.duration} days)`
        );

        // Create subscription
        const subscription = await subscriptionModel.createSubscription(
            req.user.id,
            userType,
            planId
        );

        // Get updated wallet
        const updatedWallet = await walletModel.getWallet(req.user.id);

        res.json({
            success: true,
            message: `Successfully subscribed to ${plan.name} plan!`,
            data: { 
                subscription,
                newBalance: updatedWallet.balance
            }
        });
    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to subscribe', error: error.message });
    }
});

// Cancel subscription
router.post('/cancel', authMiddleware, async (req, res) => {
    try {
        const subscription = await subscriptionModel.getActiveSubscription(req.user.id);
        
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'No active subscription found' });
        }

        await subscriptionModel.cancelSubscription(subscription.id);

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel subscription error:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel subscription', error: error.message });
    }
});

// ==================== WALLET ENDPOINTS (Universal) ====================

// Get wallet balance
router.get('/wallet', authMiddleware, async (req, res) => {
    try {
        const wallet = await walletModel.getWallet(req.user.id);
        
        res.json({
            success: true,
            data: { 
                balance: wallet.balance,
                totalEarnings: wallet.totalEarnings || 0,
                totalAddedMoney: wallet.totalAddedMoney || 0,
                totalWithdrawals: wallet.totalWithdrawals || 0
            }
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch wallet', error: error.message });
    }
});

// Get wallet transactions
router.get('/wallet/transactions', authMiddleware, async (req, res) => {
    try {
        const transactions = await walletModel.getTransactions(req.user.id);
        
        res.json({
            success: true,
            data: { transactions }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
    }
});

// Add money to wallet
router.post('/wallet/add-money', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount is required' });
        }

        if (amount > 50000) {
            return res.status(400).json({ success: false, message: 'Maximum ₹50,000 can be added at once' });
        }

        const result = await walletModel.addMoney(req.user.id, amount);

        res.json({
            success: true,
            message: `₹${amount} added to wallet successfully!`,
            data: { 
                balance: result.balance,
                transaction: result.transaction
            }
        });
    } catch (error) {
        console.error('Add money error:', error);
        res.status(500).json({ success: false, message: 'Failed to add money', error: error.message });
    }
});

module.exports = router;
