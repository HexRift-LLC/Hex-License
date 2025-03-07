/**
 * Hex License - Staff Routes
 * Handles administrative functions for staff members
 */

const express = require('express');
const router = express.Router();
const License = require('../models/License');
const Product = require('../models/Product');
const User = require('../models/User');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { sendLog } = require('../utils/discord');
const crypto = require('crypto');
const { version } = require('../../package.json');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');

// Load configuration
const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

// Rate limiting for staff actions
const staffActionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 100, // limit each IP to 100 requests per window
    message: { success: false, error: 'Too many requests, please try again later' }
});

/**
 * Generates a secure and unique license key
 * @returns {string} - Formatted license key
 */
function generateUniqueKey() {
    // Create a more secure and unique key format
    const prefix = 'HEX';
    const randomPart1 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const randomPart2 = crypto.randomBytes(4).toString('hex').toUpperCase();
    const randomPart3 = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Format as HEX-XXXX-XXXX-XXXX
    return `${prefix}-${randomPart1}-${randomPart2}-${randomPart3}`;
}

/**
 * Middleware to check staff status
 * Ensures the user is authenticated and has staff permissions
 */
const isStaff = (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/discord');
    }
    
    if (!(req.user.isStaff || req.user.discordId === config.discord.owner_id)) {
        // Log unauthorized access attempt
        sendLog('unauthorized_access', {
            username: req.user.username,
            userId: req.user._id.toString(),
            route: req.originalUrl,
            ip: req.ip
        });
        
        return res.status(403).redirect('/403');
    }
    
    // Add audit log entry for staff access
    sendLog('staff_access', {
        username: req.user.username,
        userId: req.user._id.toString(),
        route: req.originalUrl
    });
    
    next();
};

// Apply staff check middleware to all routes
router.use(isStaff);

/**
 * Staff Dashboard Routes
 */

/**
 * @route   GET /staff
 * @desc    Main staff dashboard
 * @access  Staff Only
 */
router.get('/', async (req, res) => {
    try {
        // Fetch data with optimized queries and pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        // Get filter parameters from query string
        const productFilter = req.query.product || null;
        const userFilter = req.query.user || null;
        const statusFilter = req.query.status || null;
        
        // Build query filters
        const licenseQuery = {};
        if (productFilter) licenseQuery.product = productFilter;
        if (statusFilter === 'active') licenseQuery.isActive = true;
        if (statusFilter === 'inactive') licenseQuery.isActive = false;
        
        // Execute queries in parallel for better performance
        const [
            licenseCount, 
            licenses, 
            products, 
            users
        ] = await Promise.all([
            License.countDocuments(licenseQuery),
            License.find(licenseQuery)
                .populate('user')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.find().sort('name'),
            User.find()
                .select('username discordId isStaff isBanned createdAt')
                .sort({ createdAt: -1 })
        ]);
        
        // Calculate active licenses per user
        const userLicensePromises = users.map(async (user) => {
            const activeLicenses = await License.countDocuments({
                user: user._id,
                isActive: true
            });
            
            return {
                ...user.toObject(),
                activeLicenses,
                createdAt: user.createdAt?.toLocaleDateString() || 'Unknown'
            };
        });
        
        const userStats = await Promise.all(userLicensePromises);
        
        // Calculate overall system stats
        const stats = {
            activeKeys: await License.countDocuments({ isActive: true }),
            totalUsers: await User.countDocuments(),
            totalProducts: await Product.countDocuments(),
            totalLicenses: await License.countDocuments(),
            recentRegistrations: await User.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }),
            recentLicenses: await License.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            })
        };
        
        // Calculate pagination data
        const totalPages = Math.ceil(licenseCount / limit);
        const pagination = {
            currentPage: page,
            totalPages,
            totalItems: licenseCount,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };
        
        // Render the staff dashboard
        res.render('staff', {
            user: req.user,
            licenses,
            products,
            users: userStats,
            stats,
            pagination,
            filters: {
                product: productFilter,
                user: userFilter,
                status: statusFilter
            },
            config: config,
            version: version,
            pageTitle: 'Staff Dashboard',
            activeNav: 'staff'
        });
    } catch (error) {
        console.error('Staff page error:', error);
        
        // Log the error to Discord
        sendLog('staff_page_error', {
            username: req.user.username,
            error: error.message,
            stack: error.stack
        });
        
        // Show a user-friendly error page
        res.status(500).render('error', {
            errorType: 'server',
            errorIcon: 'fa-exclamation-triangle',
            errorTitle: 'Server Error',
            errorMessage: 'An error occurred while loading the staff dashboard. Please try again later.',
            config: config
        });
    }
});

/**
 * Product Management API Endpoints
 */

/**
 * @route   POST /staff/products
 * @desc    Create a new product
 * @access  Staff Only
 */
router.post('/products',
    staffActionLimiter,
    body('productName').trim().isLength({ min: 2, max: 50 }).withMessage('Product name must be between 2 and 50 characters'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Check if product already exists
            const existingProduct = await Product.findOne({ 
                name: { $regex: new RegExp(`^${req.body.productName}$`, 'i') }
            });
            
            if (existingProduct) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'A product with this name already exists' 
                });
            }
            
            // Create the product
            const product = new Product({ name: req.body.productName });
            await product.save();
            
            // Log the action
            sendLog('product_created', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                productName: req.body.productName,
                productId: product._id.toString()
            });
            
            res.json({ 
                success: true, 
                product,
                message: 'Product created successfully'
            });
        } catch (error) {
            console.error('Create product error:', error);
            
            sendLog('product_creation_error', {
                username: req.user.username,
                error: error.message,
                productName: req.body.productName
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create product'
            });
        }
    }
);

/**
 * @route   DELETE /staff/products/:id
 * @desc    Delete a product
 * @access  Staff Only
 */
router.delete('/products/:id',
    staffActionLimiter,
    param('id').isMongoId().withMessage('Invalid product ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Find the product
            const product = await Product.findById(req.params.id);
            if (!product) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Product not found' 
                });
            }
            
            // Check if there are licenses using this product
            const licensesUsingProduct = await License.countDocuments({ product: product.name });
            if (licensesUsingProduct > 0) {
                return res.status(409).json({
                    success: false,
                    error: `Cannot delete product: ${licensesUsingProduct} license(s) are using this product`
                });
            }
            
            // Delete the product
            await Product.findByIdAndDelete(req.params.id);
            
            // Log the action
            sendLog('product_deleted', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                productName: product.name,
                productId: product._id.toString()
            });
            
            res.json({ 
                success: true,
                message: 'Product deleted successfully' 
            });
        } catch (error) {
            console.error('Delete product error:', error);
            
            sendLog('product_deletion_error', {
                username: req.user.username,
                error: error.message,
                productId: req.params.id
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete product'
            });
        }
    }
);

/**
 * License Management API Endpoints
 */

/**
 * @route   POST /staff/licenses/generate
 * @desc    Generate new license keys
 * @access  Staff Only
 */
router.post('/licenses/generate',
    staffActionLimiter,
    [
        body('duration').isInt({ min: 1, max: 3650 }).withMessage('Duration must be between 1 and 3650 days'),
        body('quantity').isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100'),
        body('product').trim().notEmpty().withMessage('Product is required'),
        body('userId').optional({ checkFalsy: true }).isMongoId().withMessage('Invalid user ID'),
        body('discordId').optional({ checkFalsy: true }).isString().withMessage('Invalid Discord ID')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            const { duration, quantity, product, userId, discordId } = req.body;
            
            // Validate product exists or create it if it's a new one
            let productDoc = await Product.findOne({ name: product });
            if (!productDoc) {
                productDoc = new Product({ name: product });
                await productDoc.save();
                
                sendLog('product_created', {
                    username: req.user.username,
                    staffId: req.user._id.toString(),
                    productName: product,
                    productId: productDoc._id.toString(),
                    source: 'license_generation'
                });
            }
            
            // Validate user if specified
            if (userId) {
                const user = await User.findById(userId);
                if (!user) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found' 
                    });
                }
            }
            
            // Generate licenses
            const licenses = [];
            for (let i = 0; i < quantity; i++) {
                // Create expiration date
                const expiresAt = duration > 0 
                    ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
                    : null; // Null means never expires
                
                const license = new License({
                    key: generateUniqueKey(),
                    product,
                    duration,
                    expiresAt,
                    user: userId || null,
                    discordId: discordId || null,
                    createdBy: req.user._id,
                    createdByUsername: req.user.username
                });
                
                await license.save();
                licenses.push(license);
            }
            
            // Log license generation
            sendLog('licenses_generated', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                quantity: quantity,
                product: product,
                userId: userId || 'None',
                discordId: discordId || 'None',
                duration: duration,
                keys: licenses.map(license => license.key.substring(0, 8) + '...')
            });
            
            res.json({ 
                success: true, 
                licenses,
                message: `Successfully generated ${quantity} license(s)` 
            });
        } catch (error) {
            console.error('License generation error:', error);
            sendLog('license_generation_error', {
                username: req.user.username,
                error: error.message,
                requestData: JSON.stringify(req.body)
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to generate licenses'
            });
        }
    }
);

/**
 * @route   POST /staff/licenses/:id/reset-hwid
 * @desc    Reset the HWID for a license
 * @access  Staff Only
 */
router.post('/licenses/:id/reset-hwid',
    staffActionLimiter,
    param('id').isMongoId().withMessage('Invalid license ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Find the license
            const license = await License.findById(req.params.id).populate('user');
            if (!license) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'License not found' 
                });
            }
            
            // Store old HWID for logging
            const oldHwid = license.hwid;
            
            // Reset the HWID
            license.hwid = null;
            license.lastHwidReset = new Date();
            await license.save();
            
            // Log the action
            sendLog('hwid_reset', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                key: license.key,
                oldHwid: oldHwid ? oldHwid.substring(0, 8) + '...' : 'None',
                licenseOwner: license.user ? license.user.username : 'No Owner',
                product: license.product
            });
            
            res.json({ 
                success: true,
                message: 'HWID reset successfully' 
            });
        } catch (error) {
            console.error('HWID reset error:', error);
            
            sendLog('hwid_reset_error', {
                username: req.user.username,
                error: error.message,
                licenseId: req.params.id
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to reset HWID'
            });
        }
    }
);

/**
 * @route   POST /staff/licenses/:id/toggle
 * @desc    Toggle the active status of a license
 * @access  Staff Only
 */
router.post('/licenses/:id/toggle',
    staffActionLimiter,
    param('id').isMongoId().withMessage('Invalid license ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Find the license
            const license = await License.findById(req.params.id).populate('user');
            if (!license) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'License not found' 
                });
            }
            
            // Toggle the status
            license.isActive = !license.isActive;
            await license.save();
            
            // Log the action
            const action = license.isActive ? 'activated' : 'deactivated';
            sendLog('license_toggled', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                key: license.key,
                status: action,
                licenseOwner: license.user ? license.user.username : 'No Owner',
                product: license.product
            });
            
            res.json({ 
                success: true, 
                isActive: license.isActive,
                message: `License ${action} successfully`
            });
        } catch (error) {
            console.error('License toggle error:', error);
            
            sendLog('license_toggle_error', {
                username: req.user.username,
                error: error.message,
                licenseId: req.params.id
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to toggle license status'
            });
        }
    }
);

/**
 * @route   DELETE /staff/licenses/:id
 * @desc    Delete a license
 * @access  Staff Only
 */
router.delete('/licenses/:id',
    staffActionLimiter,
    param('id').isMongoId().withMessage('Invalid license ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Find the license
            const license = await License.findById(req.params.id).populate('user');
            if (!license) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'License not found' 
                });
            }
            
            // Store license details for logging
            const licenseInfo = {
                key: license.key,
                product: license.product,
                owner: license.user ? license.user.username : 'No Owner',
                discordId: license.discordId || 'None'
            };
            
            // Delete the license
            await License.findByIdAndDelete(req.params.id);
            
            // Log the action
            sendLog('license_deleted', {
                username: req.user.username,
                staffId: req.user._id.toString(),
                key: licenseInfo.key,
                product: licenseInfo.product,
                licenseOwner: licenseInfo.owner
            });
            
            res.json({ 
                success: true,
                message: 'License deleted successfully' 
            });
        } catch (error) {
            console.error('License deletion error:', error);
            
            sendLog('license_deletion_error', {
                username: req.user.username,
                error: error.message,
                licenseId: req.params.id
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to delete license'
            });
        }
    }
);

/**
 * User Management API Endpoints
 */

/**
 * @route   POST /staff/users/:userId/toggle-ban
 * @desc    Toggle the banned status of a user
 * @access  Staff Only
 */
router.post('/users/:userId/toggle-ban',
    staffActionLimiter,
    param('userId').isMongoId().withMessage('Invalid user ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Check for ban reason
            const reason = req.body.reason || 'Staff Action';
            
            // Find the user
            const user = await User.findById(req.params.userId);
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }
            
            // Prevent banning owners or other staff (unless you're the owner)
            if (user.discordId === config.discord.owner_id) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot ban the owner'
                });
            }
            
            if (user.isStaff && req.user.discordId !== config.discord.owner_id) {
                return res.status(403).json({
                    success: false,
                    error: 'Only the owner can ban staff members'
                });
            }
            
            // Toggle the ban status
            user.isBanned = !user.isBanned;
            
            // Record ban details if banning
            if (user.isBanned) {
                user.banReason = reason;
                user.bannedBy = req.user._id;
                user.bannedAt = new Date();
            } else {
                // Clear ban information if unbanning
                user.banReason = null;
                user.bannedBy = null;
                user.bannedAt = null;
            }
            
            await user.save();
            
            // Log the action
            const action = user.isBanned ? 'banned' : 'unbanned';
            sendLog(`user_${action}`, {
                username: user.username,
                userId: user.discordId,
                staffMember: req.user.username,
                staffId: req.user._id.toString(),
                reason: reason
            });
            
            res.json({
                success: true,
                isBanned: user.isBanned,
                message: `User ${action} successfully`
            });
        } catch (error) {
            console.error('Toggle ban error:', error);
            
            sendLog('toggle_ban_error', {
                username: req.user.username,
                error: error.message,
                userId: req.params.userId
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update user ban status'
            });
        }
    }
);

/**
 * @route   POST /staff/users/:userId/toggle-staff
 * @desc    Toggle the staff status of a user
 * @access  Owner Only
 */
router.post('/users/:userId/toggle-staff',
    staffActionLimiter,
    param('userId').isMongoId().withMessage('Invalid user ID'),
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            // Check if the current user is the owner
            if (req.user.discordId !== config.discord.owner_id) {
                return res.status(403).json({
                    success: false,
                    error: 'Only the owner can modify staff status'
                });
            }
            
            // Find the user
            const user = await User.findById(req.params.userId);
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }
            
            // Prevent removing staff status from owner
            if (user.discordId === config.discord.owner_id) {
                return res.status(403).json({
                    success: false,
                    error: 'Cannot modify owner status'
                });
            }
            
            // Toggle the staff status
            user.isStaff = !user.isStaff;
            await user.save();
            
            // Log the action
            const action = user.isStaff ? 'added' : 'removed';
            sendLog(`staff_${action}`, {
                username: user.username,
                userId: user._id.toString(),
                discordId: user.discordId,
                staffMember: req.user.username
            });
            
            res.json({ 
                success: true, 
                isStaff: user.isStaff,
                message: `Staff status ${action} successfully`
            });
        } catch (error) {
            console.error('Toggle staff error:', error);
            
            sendLog('toggle_staff_error', {
                username: req.user.username,
                error: error.message,
                userId: req.params.userId
            });
            
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update staff status'
            });
        }
    }
);

/**
 * @route   GET /staff/search
 * @desc    Search for users, licenses, or products
 * @access  Staff Only
 */
router.get('/search', async (req, res) => {
    try {
        const { query, type } = req.query;
        
        if (!query || query.length < 3) {
            return res.json({
                success: false,
                error: 'Search query must be at least 3 characters long'
            });
        }
        
        let results = [];
        
        // Search based on type
        switch (type) {
            case 'users':
                results = await User.find({
                    $or: [
                        { username: { $regex: query, $options: 'i' } },
                        { discordId: { $regex: query, $options: 'i' } }
                    ]
                }).limit(20);
                break;
                
            case 'licenses':
                results = await License.find({
                    $or: [
                        { key: { $regex: query, $options: 'i' } },
                        { product: { $regex: query, $options: 'i' } },
                        { discordId: { $regex: query, $options: 'i' } }
                    ]
                }).populate('user').limit(20);
                break;
                
            case 'products':
                results = await Product.find({
                    name: { $regex: query, $options: 'i' }
                }).limit(20);
                break;
                
            default:
                // Search all types
                const [users, licenses, products] = await Promise.all([
                    User.find({
                        $or: [
                            { username: { $regex: query, $options: 'i' } },
                            { discordId: { $regex: query, $options: 'i' } }
                        ]
                    }).limit(10),
                    
                    License.find({
                        $or: [
                            { key: { $regex: query, $options: 'i' } },
                            { product: { $regex: query, $options: 'i' } }
                        ]
                    }).populate('user').limit(10),
                    
                    Product.find({
                        name: { $regex: query, $options: 'i' }
                    }).limit(10)
                ]);
                
                results = {
                    users,
                    licenses,
                    products
                };
        }
        
        res.json({
            success: true,
            results
        });
    } catch (error) {
        console.error('Search error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Search failed'
        });
    }
});

/**
 * @route   GET /staff/logs
 * @desc    View audit logs for the system
 * @access  Staff Only
 */
router.get('/logs', async (req, res) => {
    try {
        // This would normally fetch from an Audit model
        // Here we'll simulate some logs for display purposes
        const logs = [
            {
                action: 'user_login',
                username: 'testuser',
                timestamp: new Date(Date.now() - 3600000),
                ipAddress: '192.168.1.1'
            },
            {
                action: 'license_generated',
                username: req.user.username,
                timestamp: new Date(Date.now() - 7200000),
                details: 'Generated 5 licenses for Product X'
            }
        ];
        
        res.render('staff-logs', {
            user: req.user,
            logs,
            config: config,
            version: version,
            pageTitle: 'Audit Logs',
            activeNav: 'logs'
        });
    } catch (error) {
        console.error('Logs page error:', error);
        
        res.status(500).render('error', {
            errorType: 'server',
            errorIcon: 'fa-exclamation-triangle',
            errorTitle: 'Server Error',
            errorMessage: 'An error occurred while loading audit logs. Please try again later.',
            config: config
        });
    }
});

/**
 * @route   GET /staff/stats
 * @desc    View detailed system statistics
 * @access  Staff Only
 */
router.get('/stats', async (req, res) => {
    try {
        // Get time range from query params with defaults
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (parseInt(req.query.days) || 30));
        
        // Get user registration stats
        const userRegistrations = await User.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate, $lte: endDate } 
                } 
            },
            {
                $group: {
                    _id: { 
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } 
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Get license creation stats
        const licenseCreations = await License.aggregate([
            { 
                $match: { 
                    createdAt: { $gte: startDate, $lte: endDate } 
                } 
            },
            {
                $group: {
                    _id: { 
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } 
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        // Get product distribution
        const productDistribution = await License.aggregate([
            {
                $group: {
                    _id: "$product",
                    count: { $sum: 1 },
                    active: {
                        $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] }
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);
        
        // System status metrics
        const systemMetrics = {
            totalUsers: await User.countDocuments(),
            totalLicenses: await License.countDocuments(),
            totalProducts: await Product.countDocuments(),
            activeLicenses: await License.countDocuments({ isActive: true }),
            bannedUsers: await User.countDocuments({ isBanned: true }),
            staffUsers: await User.countDocuments({ isStaff: true }),
            unboundLicenses: await License.countDocuments({ hwid: null }),
            averageLicensesPerUser: await calculateAverageLicensesPerUser()
        };
        
        res.render('staff-stats', {
            user: req.user,
            systemMetrics,
            userRegistrations,
            licenseCreations,
            productDistribution,
            dateRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
                days: parseInt(req.query.days) || 30
            },
            config: config,
            version: version,
            pageTitle: 'System Statistics',
            activeNav: 'stats'
        });
    } catch (error) {
        console.error('Stats page error:', error);
        
        res.status(500).render('error', {
            errorType: 'server',
            errorIcon: 'fa-exclamation-triangle',
            errorTitle: 'Server Error',
            errorMessage: 'An error occurred while loading system statistics. Please try again later.',
            config: config
        });
    }
});

/**
 * Helper function to calculate average licenses per user
 * @returns {Promise<number>} Average licenses per user
 */
async function calculateAverageLicensesPerUser() {
    try {
        const result = await License.aggregate([
            { $match: { user: { $ne: null } } },
            { $group: { _id: "$user", count: { $sum: 1 } } },
            { $group: { _id: null, average: { $avg: "$count" } } }
        ]);
        
        return result.length > 0 ? parseFloat(result[0].average.toFixed(2)) : 0;
    } catch (error) {
        console.error('Error calculating average licenses:', error);
        return 0;
    }
}

/**
 * @route   GET /staff/export
 * @desc    Export data (licenses, users, products)
 * @access  Staff Only
 */
router.get('/export', async (req, res) => {
    try {
        const { type, format } = req.query;
        
        if (!type || !['licenses', 'users', 'products'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid export type'
            });
        }
        
        if (!format || !['json', 'csv'].includes(format)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid export format'
            });
        }
        
        // Log the export action
        sendLog('data_export', {
            username: req.user.username,
            dataType: type,
            format: format
        });
        
        let data;
        let filename;
        
        // Get the data based on type
        switch (type) {
            case 'licenses':
                data = await License.find().populate('user');
                filename = `licenses_export_${Date.now()}`;
                
                // Format license data for export
                data = data.map(license => ({
                    id: license._id.toString(),
                    key: license.key,
                    product: license.product,
                    isActive: license.isActive,
                    username: license.user ? license.user.username : null,
                    discordId: license.discordId || (license.user ? license.user.discordId : null),
                    hwid: license.hwid,
                    createdAt: license.createdAt,
                    expiresAt: license.expiresAt
                }));
                break;
                
            case 'users':
                data = await User.find();
                filename = `users_export_${Date.now()}`;
                
                // Format user data for export, excluding sensitive fields
                data = data.map(user => ({
                    id: user._id.toString(),
                    username: user.username,
                    discordId: user.discordId,
                    isStaff: user.isStaff,
                    isBanned: user.isBanned,
                    createdAt: user.createdAt
                }));
                break;
                
            case 'products':
                data = await Product.find();
                filename = `products_export_${Date.now()}`;
                
                // Format product data for export
                data = data.map(product => ({
                    id: product._id.toString(),
                    name: product.name,
                    createdAt: product.createdAt
                }));
                break;
        }
        
        // Format the response based on requested format
        if (format === 'json') {
            res.setHeader('Content-Disposition', `attachment; filename=${filename}.json`);
            res.setHeader('Content-Type', 'application/json');
            return res.json(data);
        } else if (format === 'csv') {
            res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
            res.setHeader('Content-Type', 'text/csv');
            
            // Convert data to CSV
            if (data.length === 0) {
                return res.send('No data');
            }
            
            const csvHeader = Object.keys(data[0]).join(',') + '\n';
            const csvRows = data.map(item => 
                Object.values(item).map(value => 
                    value === null ? '' : 
                    typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : 
                    value
                ).join(',')
            ).join('\n');
            
            return res.send(csvHeader + csvRows);
        }
    } catch (error) {
        console.error('Export error:', error);
        
        sendLog('export_error', {
            username: req.user.username,
            error: error.message
        });
        
        res.status(500).json({
            success: false,
            error: 'Export failed'
        });
    }
});

/**
 * @route   POST /staff/bulk-action
 * @desc    Perform bulk actions on licenses or users
 * @access  Staff Only
 */
router.post('/bulk-action',
    staffActionLimiter,
    [
        body('action').isString().notEmpty()
            .withMessage('Action is required')
            .isIn(['activate', 'deactivate', 'delete', 'ban', 'unban'])
            .withMessage('Invalid action'),
        body('type').isString().notEmpty()
            .withMessage('Type is required')
            .isIn(['licenses', 'users'])
            .withMessage('Invalid type'),
        body('ids').isArray().notEmpty()
            .withMessage('IDs array is required')
    ],
    async (req, res) => {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ 
                    success: false, 
                    errors: errors.array() 
                });
            }
            
            const { action, type, ids } = req.body;
            
            // Validate that all IDs are valid MongoDB ObjectIDs
            const validIds = ids.filter(id => /^[0-9a-fA-F]{24}$/.test(id));
            
            if (validIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No valid IDs provided'
                });
            }
            
            let result;
            
            // Process based on type and action
            if (type === 'licenses') {
                switch (action) {
                    case 'activate':
                        result = await License.updateMany(
                            { _id: { $in: validIds } },
                            { $set: { isActive: true } }
                        );
                        break;
                        
                    case 'deactivate':
                        result = await License.updateMany(
                            { _id: { $in: validIds } },
                            { $set: { isActive: false } }
                        );
                        break;
                        
                    case 'delete':
                        result = await License.deleteMany({ _id: { $in: validIds } });
                        break;
                }
            } else if (type === 'users') {
                // Prevent bulk actions on owner or staff
                if (['ban', 'unban'].includes(action) && req.user.discordId !== config.discord.owner_id) {
                    // Find if any staff or owner is in the list
                    const protectedUsers = await User.find({
                        _id: { $in: validIds },
                        $or: [
                            { discordId: config.discord.owner_id },
                            { isStaff: true }
                        ]
                    });
                    
                    if (protectedUsers.length > 0) {
                        return res.status(403).json({
                            success: false,
                            error: 'Cannot perform bulk actions on staff members or owner'
                        });
                    }
                }
                
                switch (action) {
                    case 'ban':
                        result = await User.updateMany(
                            { _id: { $in: validIds } },
                            { 
                                $set: { 
                                    isBanned: true,
                                    banReason: 'Bulk action by staff',
                                    bannedBy: req.user._id,
                                    bannedAt: new Date()
                                } 
                            }
                        );
                        break;
                        
                    case 'unban':
                        result = await User.updateMany(
                            { _id: { $in: validIds } },
                            { 
                                $set: { 
                                    isBanned: false,
                                    banReason: null,
                                    bannedBy: null,
                                    bannedAt: null
                                } 
                            }
                        );
                        break;
                }
            }
            
            // Log the bulk action
            sendLog('bulk_action', {
                username: req.user.username,
                action: action,
                type: type,
                count: validIds.length
            });
            
            res.json({
                success: true,
                message: `Bulk action completed: ${action} ${validIds.length} ${type}`,
                affected: result.modifiedCount || result.deletedCount || 0
            });
            
        } catch (error) {
            console.error('Bulk action error:', error);
            
            sendLog('bulk_action_error', {
                username: req.user.username,
                error: error.message,
                action: req.body.action,
                type: req.body.type
            });
            
            res.status(500).json({
                success: false,
                error: 'Failed to perform bulk action'
            });
        }
    }
);

// Export the router
module.exports = router;


