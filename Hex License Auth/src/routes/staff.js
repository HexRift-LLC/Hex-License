const express = require('express');
const router = express.Router();
const License = require('../models/License');
const Product = require('../models/Product');
const User = require('../models/User');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { sendLog } = require('../utils/discord');

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

router.use(isStaff);

// Main staff dashboard route
router.get('/', async (req, res) => {
    try {
        const [licenses, products, users] = await Promise.all([
            License.find().populate('user'),
            Product.find().sort('name'),
            User.find().select('username discordId isStaff isBanned')
        ]);

        const userStats = users.map(user => ({
            ...user.toObject(),
            activeLicenses: licenses.filter(l =>
                l.user && l.user._id.toString() === user._id.toString() && l.isActive
            ).length
        }));

        const stats = {
            activeKeys: licenses.filter(l => l.isActive).length,
            totalUsers: users.length,
            totalProducts: products.length,
            totalLicenses: licenses.length
        };

        res.render('staff', {
            user: req.user,
            licenses,
            products,
            users: userStats,
            stats,
            config: config
        });
    } catch (error) {
        console.error('Staff page error:', error);
        res.status(500).send('Server error');
    }
});

// Product management endpoints
router.post('/products', async (req, res) => {
    try {
        const product = new Product({ name: req.body.productName });
        await product.save();

        sendLog('product_created', {
            username: req.user.username,
            productName: req.body.productName
        });

        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        await Product.findByIdAndDelete(req.params.id);

        sendLog('product_deleted', {
            username: req.user.username,
            productName: product.name
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// License management endpoints
router.post('/licenses/generate', async (req, res) => {
    try {
        const { duration, quantity, product, userId, discordId } = req.body;
        
        const licenses = [];
        for (let i = 0; i < quantity; i++) {
            const key = `HEX-${Math.random().toString(36).substring(2, 15).toUpperCase()}-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
            
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(duration));

            const license = new License({
                key,
                product,
                expiresAt,
                isActive: true,
                user: userId || null,
                discordId: discordId || null,
                createdAt: new Date(),
                hwid: null
            });

            await license.save();
            licenses.push(license);
        }

        const existingProduct = await Product.findOne({ name: product });
        if (!existingProduct) {
            const newProduct = new Product({ name: product });
            await newProduct.save();
        }

        licenses.forEach(license => {
            sendLog('license_created', {
                username: req.user.username,
                product: license.product,
                key: license.key
            });
        });

        res.json({
            success: true,
            licenses,
            message: `Successfully generated ${quantity} license(s)`
        });
    } catch (error) {
        console.error('License generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
router.post('/licenses/:id/reset-hwid', async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        const oldHwid = license.hwid;
        license.hwid = null;
        await license.save();

        sendLog('hwid_reset', {
            username: req.user.username,
            key: license.key,
            oldHwid: oldHwid
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// At the top with other routes
router.post('/licenses/:id/toggle', async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        if (!license) {
            return res.status(404).json({ success: false, error: 'License not found' });
        }

        license.isActive = !license.isActive;
        await license.save();

        await sendLog('license_toggled', {
            username: req.user.username,
            key: license.key,
            status: license.isActive ? 'activated' : 'deactivated'
        });

        res.json({ success: true, isActive: license.isActive });
    } catch (error) {
        console.error('Error toggling license:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


router.delete('/licenses/:id', async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        if (!license) {
            return res.status(404).json({ success: false, error: 'License not found' });
        }

        await License.findByIdAndDelete(req.params.id);

        await sendLog('license_deleted', {  // Ensure sendLog executes before sending response
            username: req.user.username,
            key: license.key
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting license:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// User management endpoints
router.post('/users/:userId/toggle-ban', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false });
        }
        
        user.isBanned = user.isBanned === true ? false : true;
        await user.save();
        
        sendLog(user.isBanned ? 'user_banned' : 'user_unbanned', {
            username: user.username,
            staffMember: req.user.username,
            reason: 'Staff Action'
        });

        res.json({
            success: true,
            isBanned: user.isBanned
        });
    } catch (error) {
        console.error('Toggle ban error:', error);
        res.status(500).json({ success: false });
    }
});

router.post('/users/:userId/toggle-staff', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        user.isStaff = !user.isStaff;
        await user.save();

        sendLog(user.isStaff ? 'staff_added' : 'staff_removed', {
            username: user.username,
            staffMember: req.user.username
        });

        res.json({ success: true, isStaff: user.isStaff });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
