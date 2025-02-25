const express = require('express');
const router = express.Router();
const License = require('../models/License');
const User = require('../models/User');
const crypto = require('crypto');
const Product = require('../models/Product');

function generateUniqueKey(length = 24) {
    return crypto.randomBytes(length).toString('hex').toUpperCase();
}

// Staff middleware
const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isStaff) return next();
    return res.status(403).json({ error: 'Unauthorized' });
};

// Verify license
router.post('/verify', async (req, res) => {
    const { key, hwid, product } = req.body;
    
    try {
        const license = await License.findOne({ key });
        
        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        // Add auth log entry
        license.authLogs.push({
            status: license.isActive ? 'SUCCESS' : 'FAILED',
            hwid: hwid,
            message: license.isActive ? 'Valid authentication' : 'License inactive'
        });
        await license.save();

        if (license.product !== product) {
            return res.status(403).json({ error: 'Invalid product' });
        }

        if (!license.isActive) {
            return res.status(403).json({ error: 'License is inactive' });
        }

        if (license.hwid && license.hwid !== hwid) {
            return res.status(403).json({ error: 'HWID mismatch' });
        }

        if (!license.hwid) {
            license.hwid = hwid;
            await license.save();
        }

        return res.json({ valid: true });
    } catch (error) {
        return res.status(500).json({ error: 'Server error' });
    }
});

router.post('/products', isStaff, async (req, res) => {
    try {
        const product = new Product({ name: req.body.name });
        await product.save();
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add product' });
    }
});

router.delete('/products/:id', isStaff, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});


router.post('/licenses/generate', isStaff, async (req, res) => {
    const { duration, quantity, userId, discordId, product } = req.body;
    
    try {
        let targetUser = null;
        if (userId) {
            targetUser = await User.findById(userId);
        } else if (discordId) {
            targetUser = await User.findOne({ discordId });
            if (!targetUser) {
                targetUser = await User.create({
                    discordId,
                    username: `User-${discordId}`,
                    isStaff: false
                });
            }
        }

        const licenses = [];
        for (let i = 0; i < quantity; i++) {
            const key = generateUniqueKey();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + Number(duration));
            
            const license = new License({
                key,
                user: targetUser?._id || null,
                product,
                expiresAt,
                isActive: true,
                createdAt: new Date()
            });
            
            await license.save();
            licenses.push(license);
        }
        
        res.json({ success: true, licenses });
    } catch (error) {
        console.error('License generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/licenses/:id/toggle', isStaff, async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        license.isActive = !license.isActive;
        await license.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle license' });
    }
});

router.delete('/licenses/:id', isStaff, async (req, res) => {
    try {
        await License.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete license' });
    }
});

router.post('/licenses/:id/reset-hwid', async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        if (license.user.toString() !== req.user._id.toString() && !req.user.isStaff) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        license.hwid = null;
        await license.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset HWID' });
    }
});module.exports = router;