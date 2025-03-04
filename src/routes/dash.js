const express = require('express');
const router = express.Router();
const License = require('../models/License');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { version } = require('../../package.json');

const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

const isAuthenticated = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/discord');
    }
    
    if (req.user.isBanned) {
        return res.redirect('/banned');
    }
    
    next();
};

router.get('/', isAuthenticated, async (req, res) => {
    const licenses = await License.find({ user: req.user._id });

    res.locals.getTimeUntilReset = function(lastReset) {
        const resetTime = new Date(lastReset);
        const nextReset = new Date(resetTime.getTime() + (2 * 24 * 60 * 60 * 1000));
        const now = new Date();
        const diff = nextReset - now;
        
        const hours = Math.floor(diff / (60 * 60 * 1000));
        const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
        
        return `in ${hours}h ${minutes}m`;
    };

    res.render('dash', {
        user: req.user,
        licenses,
        config: config,
        version: version,
    });
});



module.exports = router;