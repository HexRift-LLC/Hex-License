const express = require('express');
const router = express.Router();
const License = require('../models/License');

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
};

router.get('/', isAuthenticated, async (req, res) => {
    const licenses = await License.find({ user: req.user._id });
    res.render('dashboard', { user: req.user, licenses });
});

module.exports = router;
