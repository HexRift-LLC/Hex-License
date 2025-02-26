const express = require('express');
const router = express.Router();
const License = require('../models/License');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/auth/discord');
};

router.get('/', isAuthenticated, async (req, res) => {
    const licenses = await License.find({ user: req.user._id });
    res.render('dashboard', { 
        user: req.user, 
        licenses,
        config: config 
    });
});


module.exports = router;