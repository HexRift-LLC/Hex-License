const express = require('express');
const router = express.Router();
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new DiscordStrategy({
    clientID: config.discord.client_id,
    clientSecret: config.discord.client_secret,
    callbackURL: config.discord.callback_url,
    scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ discordId: profile.id });
        
        const isOwner = profile.id === config.discord.owner_id;
        
        if (!user) {
            user = await User.create({
                discordId: profile.id,
                username: profile.username,
                avatar: profile.avatar,
                isStaff: isOwner
            });
        } else {
            // Update staff status if owner ID matches
            if (isOwner && !user.isStaff) {
                user.isStaff = true;
                await user.save();
            }
        }
        
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));
router.get('/discord', passport.authenticate('discord'));

router.get('/discord/callback', 
    passport.authenticate('discord', {
        successRedirect: '/dashboard',
        failureRedirect: '/'
    })
);

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error during logout' });
        }
        res.redirect('/');
    });
});

module.exports = router;
