const express = require('express');
const router = express.Router();

// Handle banned users
router.get('/banned', (req, res) => {
    res.render('error', {
        errorType: 'banned',
        errorIcon: 'fa-ban',
        errorTitle: 'Account Banned',
        errorMessage: 'Your account has been suspended. Please contact support for assistance.'
    });
});

// Handle 404 errors
router.get('/404', (req, res) => {
    res.render('error', {
      errorType: '404',
      errorIcon: 'fa-search',
      errorTitle: 'Page Not Found',
      errorMessage: 'The page youre looking for doesnt exist or has been moved.'
    });
});

// Handle 500 errors  
router.get('/500', (req, res) => {
    res.render('error', {
      errorType: '500', 
      errorIcon: 'fa-exclamation-triangle',
      errorTitle: 'Server Error',
      errorMessage: 'Something went wrong on our end. Please try again later.'
    });
});

module.exports = router;
