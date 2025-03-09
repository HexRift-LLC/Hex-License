/**
 * Hex License - Error Routes
 * Handles error pages and specialized error conditions
 */

const express = require('express');
const router = express.Router();
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { sendLog } = require('../utils/discord');
const { version } = require('../../package.json');

// Load configuration
const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Helper function to format error data for rendering
 * @param {Object} errorData - Basic error information
 * @returns {Object} - Complete error data with defaults filled in
 */
const formatErrorData = (errorData) => {
    const defaultIcon = 'fa-exclamation-circle';
    
    return {
        // Merge with defaults
        errorType: errorData.errorType || 'unknown',
        errorIcon: errorData.errorIcon || defaultIcon,
        errorTitle: errorData.errorTitle || 'Unknown Error',
        errorMessage: errorData.errorMessage || 'An unexpected error occurred.',
        errorDetails: errorData.errorDetails || null,
        errorCode: errorData.errorCode || null,
        errorActions: errorData.errorActions || [],
        config: config,
        version: version,
        timestamp: new Date().toISOString()
    };
};

/**
 * Log error to Discord webhook
 * @param {Object} errorData - Error information
 * @param {Object} req - Express request object
 */
const logError = (errorData, req) => {
    try {
        const userInfo = req.user ? 
            `${req.user.username} (${req.user.discordId})` : 
            'Unauthenticated user';
            
        sendLog('error_page_accessed', {
            errorType: errorData.errorType,
            errorTitle: errorData.errorTitle,
            path: req.originalUrl,
            user: userInfo,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Failed to log error to Discord:', err);
    }
};

/**
 * Error Routes
 */

/**
 * @route   GET /banned
 * @desc    Display ban notification to banned users
 * @access  Public
 */
router.get('/banned', (req, res) => {
    const errorData = {
        errorType: 'banned',
        errorIcon: 'fa-ban',
        errorTitle: 'Account Banned',
        errorMessage: 'Your account has been suspended from accessing this service.',
        errorDetails: req.query.reason || 'No reason provided by administrators.',
        errorActions: [
            {
                text: 'Appeal Ban',
                icon: 'fa-discord',
                url: config.support.discord || 'https://discord.gg/yourserver',
                primary: true
            },
            {
                text: 'Return Home',
                icon: 'fa-home',
                url: '/',
                primary: false
            }
        ]
    };
    
    // Log banned user access
    logError(errorData, req);
    
    // Render error page
    res.status(403).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /404
 * @desc    Not found error page
 * @access  Public
 */
router.get('/404', (req, res) => {
    const errorData = {
        errorType: '404',
        errorIcon: 'fa-search',
        errorTitle: 'Page Not Found',
        errorMessage: 'The page you are looking for doesn\'t exist or has been moved.',
        errorDetails: `The requested URL ${req.query.path || 'unknown'} was not found on this server.`,
        errorCode: 404,
        errorActions: [
            {
                text: 'Return Home',
                icon: 'fa-home',
                url: '/',
                primary: true
            },
            {
                text: 'Go to Dashboard',
                icon: 'fa-tachometer-alt',
                url: '/dash',
                primary: false
            }
        ]
    };
    
    // Log 404 error
    logError(errorData, req);
    
    // Render error page
    res.status(404).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /500
 * @desc    Server error page
 * @access  Public
 */
router.get('/500', (req, res) => {
    const errorData = {
        errorType: '500',
        errorIcon: 'fa-exclamation-triangle',
        errorTitle: 'Server Error',
        errorMessage: 'Something went wrong on our servers.',
        errorDetails: 'Our technical team has been notified and is working to fix the issue.',
        errorCode: 500,
        errorActions: [
            {
                text: 'Try Again',
                icon: 'fa-redo',
                url: req.query.from || '/',
                primary: true
            },
            {
                text: 'Contact Support',
                icon: 'fa-life-ring',
                url: 'https://hexrift.net/discord',
                primary: false
            }
        ]
    };
    
    // Log 500 error with high priority
    logError({...errorData, priority: 'high'}, req);
    
    // Render error page
    res.status(500).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /401
 * @desc    Unauthorized error page
 * @access  Public
 */
router.get('/401', (req, res) => {
    const errorData = {
        errorType: '401',
        errorIcon: 'fa-lock',
        errorTitle: 'Unauthorized',
        errorMessage: 'You need to be logged in to access this page.',
        errorCode: 401,
        errorActions: [
            {
                text: 'Log In',
                icon: 'fa-sign-in-alt',
                url: '/auth/discord',
                primary: true
            },
            {
                text: 'Return Home',
                icon: 'fa-home',
                url: '/',
                primary: false
            }
        ]
    };
    
    // Log unauthorized access
    logError(errorData, req);
    
    // Render error page
    res.status(401).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /403
 * @desc    Forbidden error page
 * @access  Public
 */
router.get('/403', (req, res) => {
    const errorData = {
        errorType: '403',
        errorIcon: 'fa-user-shield',
        errorTitle: 'Access Denied',
        errorMessage: 'You don\'t have permission to access this resource.',
        errorCode: 403,
        errorActions: [
            {
                text: 'Go to Dashboard',
                icon: 'fa-tachometer-alt',
                url: '/dash',
                primary: true
            },
            {
                text: 'Contact Support',
                icon: 'fa-life-ring',
                url: 'https://hexrift.net/discord',
                primary: false
            }
        ]
    };
    
    // Log forbidden access attempt
    logError(errorData, req);
    
    // Render error page
    res.status(403).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /maintenance
 * @desc    Maintenance mode page
 * @access  Public
 */
router.get('/maintenance', (req, res) => {
    const errorData = {
        errorType: 'maintenance',
        errorIcon: 'fa-tools',
        errorTitle: 'Maintenance in Progress',
        errorMessage: 'The service is currently undergoing scheduled maintenance.',
        errorDetails: req.query.message || 'We\'ll be back online shortly. Thank you for your patience.',
        errorActions: [
            {
                text: 'Check Status',
                icon: 'fa-info-circle',
                url: config.support.status || 'https://status.hexrift.net',
                primary: true
            },
            {
                text: 'Discord Server',
                icon: 'fa-discord',
                url: config.support.discord || 'https://hexrift.net/discord',
                primary: false
            }
        ]
    };
    
    // Render maintenance page
    res.status(503).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /expired
 * @desc    License expired page
 * @access  Public
 */
router.get('/expired', (req, res) => {
    const errorData = {
        errorType: 'expired',
        errorIcon: 'fa-calendar-times',
        errorTitle: 'License Expired',
        errorMessage: 'Your license has expired and needs to be renewed.',
        errorDetails: req.query.product ? `Product: ${req.query.product}` : null,
        errorActions: [
            {
                text: 'Renew License',
                icon: 'fa-sync',
                url: '/dash/licenses',
                primary: true
            },
            {
                text: 'Contact Support',
                icon: 'fa-life-ring',
                url: 'https://hexrift.net/discord',
                primary: false
            }
        ]
    };
    
    // Log license expiration view
    logError(errorData, req);
    
    // Render expired page
    res.status(402).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /ratelimited
 * @desc    Rate limit exceeded page
 * @access  Public
 */
router.get('/ratelimited', (req, res) => {
    const errorData = {
        errorType: 'ratelimited',
        errorIcon: 'fa-stopwatch',
        errorTitle: 'Rate Limit Exceeded',
        errorMessage: 'You\'ve made too many requests in a short period of time.',
        errorDetails: 'Please wait a few minutes before trying again.',
        errorCode: 429,
        errorActions: [
            {
                text: 'Return Home',
                icon: 'fa-home',
                url: '/',
                primary: true
            }
        ]
    };
    
    // Log rate limit
    logError(errorData, req);
    
    // Render rate limited page
    res.status(429).render('error', formatErrorData(errorData));
});

/**
 * @route   GET /error
 * @desc    Generic error page (accepts query parameters)
 * @access  Public
 */
router.get('/error', (req, res) => {
    // Get error parameters from query
    const errorType = req.query.type || 'unknown';
    const errorMessage = req.query.message || 'An unknown error occurred.';
    const errorTitle = req.query.title || 'Error';
    const errorCode = req.query.code || null;
    
    // Choose appropriate icon based on error type
    let errorIcon = 'fa-exclamation-circle';
    switch (errorType) {
        case 'auth':
            errorIcon = 'fa-user-shield';
            break;
        case 'server':
            errorIcon = 'fa-server';
            break;
        case 'validation':
            errorIcon = 'fa-exclamation-triangle';
            break;
        case 'payment':
            errorIcon = 'fa-credit-card';
            break;
        case 'license':
            errorIcon = 'fa-key';
            break;
    }
    
    const errorData = {
        errorType,
        errorIcon,
        errorTitle,
        errorMessage,
        errorCode,
        errorDetails: req.query.details || null,
        errorActions: [
            {
                text: 'Return Home',
                icon: 'fa-home',
                url: '/',
                primary: true
            },
            {
                text: 'Contact Support',
                icon: 'fa-life-ring',
                url: 'https://hexrift.net/discord',
                primary: false
            }
        ]
    };
    
    // Log generic error
    logError(errorData, req);
    
    // Determine HTTP status code
    let statusCode = 500;
    if (errorCode) {
        statusCode = parseInt(errorCode, 10);
        if (isNaN(statusCode) || statusCode < 100 || statusCode > 599) {
            statusCode = 500;
        }
    }
    
    // Render error page
    res.status(statusCode).render('error', formatErrorData(errorData));
});

// Export the router
module.exports = router;
