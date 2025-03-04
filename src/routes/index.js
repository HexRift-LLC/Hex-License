const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/dash');
    }
    res.render('login');
});

module.exports = router;
