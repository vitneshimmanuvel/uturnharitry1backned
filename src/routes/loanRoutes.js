const express = require('express');
const router = express.Router();
const loanModel = require('../models/loanModel');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const loans = await loanModel.getAllLoans();
        res.json({ success: true, data: loans });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const loan = await loanModel.createLoan({
            ...req.body,
            source: 'vendor' // or 'admin'
        });
        res.status(201).json({ success: true, data: loan });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await loanModel.deleteLoan(req.params.id);
        res.json({ success: true, message: 'Loan deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
