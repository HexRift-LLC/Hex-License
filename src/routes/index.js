/**
 * Hex License - Main Routes
 * Handles primary routes including homepage, landing pages, and public information
 */

const express = require('express');
const router = express.Router();
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { version } = require('../../package.json');
const rateLimit = require('express-rate-limit');
const { sendLog } = require('../utils/discord');

// Load configuration
const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

// Rate limiting for public routes
const publicRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // limit each IP to 100 requests per window
    standardHeaders: true,
    message: 'Too many requests, please try again later'
});

/**
 * @route   GET /
 * @desc    Homepage/Landing page
 * @access  Public
 */
router.get('/', publicRateLimiter, (req, res) => {
    try {
        // If user is authenticated, redirect to dashboard
        if (req.isAuthenticated()) {
            return res.redirect('/dash');
        }
        
        // Otherwise render the login page
        res.render('login', {
            config: config,
            version: version,
            pageTitle: 'Login - Hex License',
            metaDescription: 'Secure license management system for your software products',
            // Pass any flash messages if they exist
            messages: req.flash ? {
                error: req.flash('error'),
                success: req.flash('success'),
                info: req.flash('info')
            } : {}
        });
        
        // Log page view anonymously
        sendLog('page_view', {
            page: 'login',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    } catch (error) {
        console.error('Error rendering homepage:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /features
 * @desc    Features overview page
 * @access  Public
 */
router.get('/features', publicRateLimiter, (req, res) => {
    try {
        res.render('features', {
            config: config,
            version: version,
            pageTitle: 'Features - Hex License',
            metaDescription: 'Explore the powerful features of Hex License for software licensing',
            features: [
                {
                    title: 'Secure Authentication',
                    description: 'User authentication via Discord OAuth for enhanced security',
                    icon: 'fa-shield-alt'
                },
                {
                    title: 'HWID Binding',
                    description: 'Bind licenses to specific hardware to prevent unauthorized sharing',
                    icon: 'fa-fingerprint'
                },
                {
                    title: 'License Management',
                    description: 'Comprehensive dashboard to manage all your licenses',
                    icon: 'fa-key'
                },
                {
                    title: 'Staff Controls',
                    description: 'Advanced tools for staff members to manage users and licenses',
                    icon: 'fa-user-shield'
                }
            ],
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering features page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /pricing
 * @desc    Pricing information page
 * @access  Public
 */
router.get('/pricing', publicRateLimiter, (req, res) => {
    try {
        res.render('pricing', {
            config: config,
            version: version,
            pageTitle: 'Pricing - Hex License',
            metaDescription: 'View pricing plans for Hex License software',
            plans: [
                {
                    name: 'Basic',
                    price: '$9.99',
                    period: 'month',
                    features: [
                        'Up to 5 licenses',
                        'Basic HWID protection',
                        'Email support'
                    ]
                },
                {
                    name: 'Professional',
                    price: '$19.99',
                    period: 'month',
                    features: [
                        'Up to 50 licenses',
                        'Advanced HWID protection',
                        'Priority support',
                        'API access'
                    ],
                    highlighted: true
                },
                {
                    name: 'Enterprise',
                    price: '$49.99',
                    period: 'month',
                    features: [
                        'Unlimited licenses',
                        'Custom branding',
                        'Dedicated support',
                        'Full API access',
                        'Custom integrations'
                    ]
                }
            ],
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering pricing page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /about
 * @desc    About us page
 * @access  Public
 */
router.get('/about', publicRateLimiter, (req, res) => {
    try {
        res.render('about', {
            config: config,
            version: version,
            pageTitle: 'About - Hex License',
            metaDescription: 'Learn about the team behind Hex License',
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering about page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /contact
 * @desc    Contact page
 * @access  Public
 */
router.get('/contact', publicRateLimiter, (req, res) => {
    try {
        res.render('contact', {
            config: config,
            version: version,
            pageTitle: 'Contact Us - Hex License',
            metaDescription: 'Get in touch with the Hex License team',
            contactInfo: {
                email: config.support?.email || 'support@example.com',
                discord: config.support?.discord || 'https://discord.gg/example',
                twitter: config.support?.twitter || 'https://twitter.com/example'
            },
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering contact page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /terms
 * @desc    Terms of Service page
 * @access  Public
 */
router.get('/terms', publicRateLimiter, (req, res) => {
    try {
        res.render('terms', {
            config: config,
            version: version,
            pageTitle: 'Terms of Service - Hex License',
            metaDescription: 'Terms of Service for using Hex License',
            lastUpdated: '2023-09-15', // This would come from a database or config in a real app
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering terms page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /privacy
 * @desc    Privacy Policy page
 * @access  Public
 */
router.get('/privacy', publicRateLimiter, (req, res) => {
    try {
        res.render('privacy', {
            config: config,
            version: version,
            pageTitle: 'Privacy Policy - Hex License',
            metaDescription: 'Privacy Policy for Hex License',
            lastUpdated: '2023-09-15', // This would come from a database or config in a real app
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering privacy page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /docs
 * @desc    Documentation page or redirect to docs site
 * @access  Public
 */
router.get('/docs', publicRateLimiter, (req, res) => {
    // If external docs are configured, redirect to them
    if (config.support?.docs) {
        return res.redirect(config.support.docs);
    }
    
    // Otherwise render docs page
    try {
        res.render('docs', {
            config: config,
            version: version,
            pageTitle: 'Documentation - Hex License',
            metaDescription: 'Documentation and guides for using Hex License',
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering docs page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /faq
 * @desc    Frequently Asked Questions page
 * @access  Public
 */
router.get('/faq', publicRateLimiter, (req, res) => {
    try {
        res.render('faq', {
            config: config,
            version: version,
            pageTitle: 'FAQ - Hex License',
            metaDescription: 'Frequently asked questions about Hex License',
            faqs: [
                {
                    question: 'What is Hex License?',
                    answer: 'Hex License is a powerful license management system for software developers.'
                },
                {
                    question: 'How does HWID binding work?',
                    answer: 'HWID binding associates a license with a specific device\'s hardware ID, preventing unauthorized sharing.'
                },
                {
                    question: 'Can I use my own branding?',
                    answer: 'Yes, our Enterprise plan offers custom branding options.'
                },
                {
                    question: 'How do I contact support?',
                    answer: 'You can reach our support team via Discord or email.'
                }
            ],
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering FAQ page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /status
 * @desc    System status page or redirect to status site
 * @access  Public
 */
router.get('/status', publicRateLimiter, (req, res) => {
    // If external status page is configured, redirect to it
    if (config.support?.status) {
        return res.redirect(config.support.status);
    }
    
    // Otherwise render a basic status page
    try {
        const systemStatus = {
            api: 'operational',
            database: 'operational',
            authentication: 'operational',
            website: 'operational'
        };
        
        res.render('status', {
            config: config,
            version: version,
            pageTitle: 'System Status - Hex License',
            metaDescription: 'Current system status for Hex License services',
            systemStatus,
            lastChecked: new Date(),
            isAuthenticated: req.isAuthenticated(),
            user: req.user
        });
    } catch (error) {
        console.error('Error rendering status page:', error);
        res.status(500).redirect('/error/500');
    }
});

/**
 * @route   GET /sitemap.xml
 * @desc    XML Sitemap for SEO
 * @access  Public
 */
router.get('/sitemap.xml', (req, res) => {
    try {
        const baseUrl = config.baseUrl || `${req.protocol}://${req.get('host')}`;
        const routes = [
            '/',
            '/features',
            '/pricing',
            '/about',
            '/contact',
            '/terms',
            '/privacy',
            '/faq'
        ];
        
        // Generate XML sitemap
        let xml = '<?xml version="1.0" encoding="UTF-8"?>';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        
        routes.forEach(route => {
            xml += '<url>';
            xml += `<loc>${baseUrl}${route}</loc>`;
            xml += '<changefreq>monthly</changefreq>';
            xml += '</url>';
        });
        
        xml += '</urlset>';
        
        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Error generating sitemap:', error);
        res.status(500).send('Error generating sitemap');
    }
});

/**
 * @route   GET /robots.txt
 * @desc    Robots.txt file for search engines
 * @access  Public
 */
router.get('/robots.txt', (req, res) => {
    const baseUrl = config.baseUrl || `${req.protocol}://${req.get('host')}`;
    const content = `User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml
Disallow: /dash
Disallow: /staff
Disallow: /api
Disallow: /auth
`;
    
    res.header('Content-Type', 'text/plain');
    res.send(content);
});

// Export the router
module.exports = router;
