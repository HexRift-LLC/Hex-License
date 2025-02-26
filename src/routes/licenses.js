const express = require('express');
const router = express.Router();
const License = require('../models/License');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

// Middleware to check staff status
const isStaff = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/discord');
    }
    if (!(req.user.isStaff || req.user.discordId === config.discord.owner_id)) {
        return res.redirect('/dashboard');
    }
    next();
};

// Apply middleware to all routes in this file
router.use(isStaff);

router.get('/', async (req, res) => {
    const licenses = await License.find().populate('user');
    res.render('licenses', { 
        user: req.user,
        licenses,
        config: config 
    });
});

// API endpoints for license management
router.post('/api/licenses/:id/toggle',  async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        license.isActive = !license.isActive;
        await license.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle license' });
    }
});

router.delete('/api/licenses/:id',  async (req, res) => {
    try {
        await License.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete license' });
    }
});

module.exports = router;