const express = require('express');
const router = express.Router();
const jobModel = require('../models/jobModel');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/jobs
 * Get all available jobs (for search/list)
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const jobs = await jobModel.getAllJobs();
        // Sort by newest first
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, count: jobs.length, data: jobs });
    } catch (error) {
        console.error('Get all jobs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * GET /api/jobs/my
 * Get jobs created by the logged-in user
 */
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const jobs = await jobModel.getJobsByCreator(req.user.id);
        // Sort by newest first
        jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, count: jobs.length, data: jobs });
    } catch (error) {
        console.error('Get my jobs error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * POST /api/jobs
 * Create a new job
 */
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { companyName, jobTitle, salaryPerMonth, location, contactNumber } = req.body;
        
        if (!companyName || !jobTitle || !salaryPerMonth || !location || !contactNumber) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required (companyName, jobTitle, salaryPerMonth, location, contactNumber)'
            });
        }

        const job = await jobModel.createJob({
            creatorId: req.user.id,
            creatorType: req.user.userType || 'unknown',
            companyName,
            jobTitle,
            salaryPerMonth,
            location,
            contactNumber
        });

        res.status(201).json({ success: true, message: 'Job created successfully', data: job });
    } catch (error) {
        console.error('Create job error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * DELETE /api/jobs/:id
 * Delete a job (Only creator can delete)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const job = await jobModel.getJobById(id);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }
        
        if (job.creatorId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Unauthorized to delete this job' });
        }

        await jobModel.deleteJob(id);

        res.json({ success: true, message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
