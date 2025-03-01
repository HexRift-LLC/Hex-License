const express = require('express');
const router = express.Router();
const License = require('../models/License');
const User = require('../models/User');
const crypto = require('crypto');
const Product = require('../models/Product');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { sendLog } = require('../utils/discord');

const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

function generateUniqueKey(length = 24) {
    return crypto.randomBytes(length).toString('hex').toUpperCase();
}

// Staff middleware
const isStaff = (req, res, next) => {
    if (req.isAuthenticated() && req.user.isStaff) return next();
    return res.status(403).json({ error: 'Unauthorized' });
};

// Add this route after your existing /verify endpoint
router.post('/licenses/:id/reset-hwid', async (req, res) => {
    try {
        const license = await License.findById(req.params.id).populate('user');
        const username = license.user ? license.user.username : 'No Owner';

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        // Reset the HWID
        license.hwid = null;
        license.lastHwidReset = new Date();
        await license.save();

        sendLog('hwid_reset', {
            key: license.key,
            product: license.product,
            username: username
        });

        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});


router.post('/verify', async (req, res) => {
    const { key, hwid, product } = req.body;
    const license = await License.findOne({ key }).populate('user');
    const username = license.user ? license.user.username : 'No Owner';
    
    try {
        const license = await License.findOne({ key });

        if (!license) {
            sendLog('license_verify_failed', {
                key: key,
                reason: 'License not found',
                product: product,
                username: username
            });
            return res.status(404).json({ error: 'License not found' });
        }

        if (license.product !== product) {
            sendLog('license_verify_failed', {
                key: key,
                reason: 'Invalid product',
                product: product,
                username: username
            });
            return res.status(403).json({ error: 'Invalid product' });
        }

        if (!license.isActive) {
            sendLog('license_verify_failed', {
                key: key,
                reason: 'License inactive',
                product: product,
                username: username
            });
            return res.status(403).json({ error: 'License is inactive' });
        }

        if (!license.hwid) {
            license.hwid = hwid;
            sendLog('license_hwid_bound', {
                key: key,
                hwid: hwid,
                product: product,
                username: username
            });
        } else if (license.hwid !== hwid) {
            sendLog('license_verify_failed', {
                key: key,
                reason: 'HWID mismatch',
                product: product,
                username: username
            });
            return res.status(403).json({ error: 'HWID mismatch' });
        }

        await license.save();

        sendLog('license_verify_success', {
            key: key,
            product: product,
            hwid: hwid,
            username: username
        });

        return res.json({ valid: true });

    } catch (error) {
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

  module.exports = router;