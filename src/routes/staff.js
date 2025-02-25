const express = require('express');
const router = express.Router();
const License = require('../models/License');
const Product = require('../models/Product');
const User = require('../models/User');

const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isStaff) return next();
    res.redirect('/dashboard');
};

router.get('/', isStaff, async (req, res) => {
    const licenses = await License.find().populate('user');
    const products = await Product.find().sort('name');
    const users = await User.find().sort('username');
    const activeKeys = await License.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();
    
    
    res.render('staff', { 
        user: req.user, 
        licenses,
        products,
        users,
        activeKeys,
        totalUsers
    });
});

module.exports = router;
