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

module.exports = router;
