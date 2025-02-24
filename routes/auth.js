const express = require('express');
const router = express.Router();
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
// Load config
const config = yaml.load(fs.readFileSync(path.join(__dirname,'..', 'config', 'config.yml'), 'utf8'));

passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackUrl,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ discordId: profile.id });
        const userCount = await User.countDocuments();

        if (!user) {
            user = await User.create({
                discordId: profile.id,
                username: profile.username,
                avatar: profile.avatar,
                role: userCount === 0 ? 'Owner' : 'User'
            });
        }

        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

router.get('/auth/discord', passport.authenticate('discord'));
router.get('/auth/discord/callback', passport.authenticate('discord', {
    successRedirect: '/dashboard',
    failureRedirect: '/'
}));

router.get('/auth/logout', (req, res) => {
    // Clear the session
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.redirect('/dashboard');
        }
        // Clear cookies if you're using them
        res.clearCookie('connect.sid');
        // Redirect to home page or login page
        res.redirect('/');
    });
});

module.exports = router;