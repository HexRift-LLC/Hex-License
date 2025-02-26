const express = require('express');
const router = express.Router();
const License = require('../models/License');
const Product = require('../models/Product');
const User = require('../models/User');
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
    const products = await Product.find().sort('name');
    const users = await User.find().sort('username');
    const activeKeys = await License.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();
    
    res.render('keys', { 
        user: req.user, 
        licenses,
        products,
        users,
        activeKeys,
        totalUsers,
        config: config
    });
});

module.exports = router;
