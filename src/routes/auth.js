/**
 * Hex License - Authentication Routes
 * Handles user authentication via Discord OAuth2
 */

const express = require('express');
const router = express.Router();
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');
const rateLimit = require('express-rate-limit');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { sendLog } = require('../utils/discord');

// Load configuration
const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

// Rate limiters
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login attempts per windowMs
    message: 'Too many login attempts, please try again later'
});

const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: { error: 'Too many requests, please try again later' }
});

/**
 * User serialization for session storage
 * Only stores the user ID in the session
 */
passport.serializeUser((user, done) => {
    done(null, user.id);
});

/**
 * User deserialization to retrieve user from database
 * Populates req.user with the user object
 */
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        
        // Check if user exists or was deleted
        if (!user) {
            return done(null, false);
        }
        
        // If user is banned, don't allow session
        if (user.isBanned) {
            return done(null, false);
        }
        
        done(null, user);
    } catch (err) {
        console.error('Error deserializing user:', err);
        done(err, null);
    }
});

/**
 * Configure Discord OAuth2 strategy
 */
passport.use(new DiscordStrategy({
    clientID: config.discord.client_id,
    clientSecret: config.discord.client_secret,
    callbackURL: config.discord.callback_url,
    scope: ['identify', 'guilds.members.read'],
    passReqToCallback: true // Pass request to callback
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        // Log authentication attempt
        console.log(`Auth attempt by Discord user: ${profile.username}#${profile.discriminator} (${profile.id})`);
        
        // Check if user exists
        let user = await User.findOne({ discordId: profile.id });
        
        // Check if user is the owner from config
        const isOwner = profile.id === config.discord.owner_id;
        
        // If user doesn't exist, create new user
        if (!user) {
            user = await User.create({
                discordId: profile.id,
                username: profile.username,
                discriminator: profile.discriminator || '0',
                avatar: profile.avatar,
                email: profile.email,
                isStaff: isOwner, // Owner is automatically staff
                accessToken, // Store for API calls
                refreshToken
            });
            
            // Log new user creation
            sendLog('user_registered', {
                username: profile.username,
                discriminator: profile.discriminator || '0',
                id: profile.id,
                isOwner
            });
            
            return done(null, user);
        }
        
        // Update user information if changed
        let hasChanges = false;
        
        if (user.username !== profile.username) {
            user.username = profile.username;
            hasChanges = true;
        }
        
        if (user.discriminator !== (profile.discriminator || '0')) {
            user.discriminator = profile.discriminator || '0';
            hasChanges = true;
        }
        
        if (user.avatar !== profile.avatar) {
            user.avatar = profile.avatar;
            hasChanges = true;
        }
        
        if (profile.email && user.email !== profile.email) {
            user.email = profile.email;
            hasChanges = true;
        }
        
        // Update tokens
        if (accessToken !== user.accessToken) {
            user.accessToken = accessToken;
            hasChanges = true;
        }
        
        if (refreshToken && refreshToken !== user.refreshToken) {
            user.refreshToken = refreshToken;
            hasChanges = true;
        }
        
        // Ensure owner is always staff
        if (isOwner && !user.isStaff) {
            user.isStaff = true;
            hasChanges = true;
        }
        
        // Update last login time
        user.lastLogin = new Date();
        hasChanges = true;
        
        // Save changes if needed
        if (hasChanges) {
            await user.save();
        }
        
        // Check if user is banned
        if (user.isBanned) {
            // Log banned user login attempt
            sendLog('banned_login_attempt', {
                username: user.username,
                id: user.discordId,
                reason: user.banReason || 'No reason provided'
            });
            
            return done(null, false, { message: 'Your account has been banned', reason: user.banReason });
        }
        
        // Log successful login
        sendLog('user_login', {
            username: user.username,
            id: user.discordId,
            isStaff: user.isStaff
        });
        
        return done(null, user);
    } catch (err) {
        console.error('Discord authentication error:', err);
        sendLog('auth_error', {
            error: err.message,
            userId: profile?.id || 'unknown'
        });
        return done(err, null);
    }
}));

/**
 * Discord OAuth routes
 */

/**
 * @route   GET /auth/discord
 * @desc    Initiate Discord OAuth login
 * @access  Public
 */
router.get('/discord', authLimiter, (req, res, next) => {
    // Store original URL for redirection after auth if provided
    if (req.query.redirect) {
        req.session.returnTo = req.query.redirect;
    }
    
    // Initialize Discord authentication
    passport.authenticate('discord')(req, res, next);
});

/**
 * @route   GET /auth/discord/callback
 * @desc    Handle Discord OAuth callback
 * @access  Public
 */
router.get('/discord/callback', authLimiter, (req, res, next) => {
    passport.authenticate('discord', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return res.redirect('/error?error=auth&message=Authentication failed');
        }
        
        // If authentication failed or user is banned
        if (!user) {
            if (info && info.message === 'Your account has been banned') {
                return res.redirect('/error?error=banned&reason=' + encodeURIComponent(info.reason || 'No reason provided'));
            }
            return res.redirect('/error?error=auth&message=Authentication failed');
        }
        
        // Complete login process
        req.login(user, (loginErr) => {
            if (loginErr) {
                console.error('Login error:', loginErr);
                return res.redirect('/error?error=auth&message=Login failed');
            }
            
            // Redirect to the stored URL or default to dashboard
            const redirectUrl = req.session.returnTo || '/dash';
            delete req.session.returnTo;
            
            return res.redirect(redirectUrl);
        });
    })(req, res, next);
});

/**
 * @route   GET /auth/discord/members
 * @desc    Fetch Discord members from guild
 * @access  Private (Staff only)
 */
router.get('/discord/members', apiLimiter, async (req, res) => {
    // Check if user is authenticated and staff
    if (!req.isAuthenticated() || !req.user?.isStaff) {
        return res.status(403).json({ 
            success: false,
            error: 'Forbidden', 
            message: 'You do not have permission to access this resource'
        });
    }

    try {
        // Fetch Discord guild members using the Discord API
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${config.discord.guild_id}/members?limit=1000`, 
            {
                headers: {
                    Authorization: `Bot ${config.discord.bot_token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Check if request was successful
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            console.error('Discord API error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorData
            });
            
            return res.status(response.status).json({
                success: false,
                error: 'Discord API Error',
                message: 'Failed to fetch Discord members',
                details: errorData.message || response.statusText
            });
        }
        
        const members = await response.json();
        
        // Process and filter members data
        const membersList = members
            .filter(member => member.user && !member.user.bot) // Filter out bots
            .map(member => ({
                id: member.user.id,
                username: member.user.username,
                discriminator: member.user.discriminator || '0',
                avatar: member.user.avatar,
                roles: member.roles || []
            }))
            .sort((a, b) => a.username.localeCompare(b.username)); // Sort alphabetically

        // Return processed members
        res.json({ 
            success: true, 
            members: membersList,
            totalCount: membersList.length
        });
    } catch (error) {
        console.error('Discord members fetch error:', error);
        
        sendLog('api_error', {
            endpoint: '/auth/discord/members',
            error: error.message,
            user: req.user ? req.user.username : 'Unknown'
        });
        
        res.status(500).json({ 
            success: false,
            error: 'Server Error', 
            message: 'Failed to fetch Discord members',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * @route   GET /auth/logout
 * @desc    Log out the current user
 * @access  Private
 */
router.get('/logout', (req, res) => {
    // Log the logout event if user is authenticated
    if (req.isAuthenticated()) {
        sendLog('user_logout', {
            username: req.user.username,
            id: req.user.discordId
        });
    }
    
    // Destroy the session
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ 
                success: false,
                error: 'Server Error',
                message: 'Error during logout'
            });
        }
        
        // Invalidate session
        req.session.destroy((sessionErr) => {
            if (sessionErr) {
                console.error('Session destruction error:', sessionErr);
            }
            
            // Clear the session cookie
            res.clearCookie('connect.sid');
            
            // Redirect to home
            res.redirect('/');
        });
    });
});

/**
 * @route   GET /auth/status
 * @desc    Check current authentication status
 * @access  Public
 */
router.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
        return res.json({
            authenticated: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                isStaff: req.user.isStaff,
                avatar: req.user.avatar,
                // Don't include sensitive information like tokens
            }
        });
    } else {
        return res.json({
            authenticated: false
        });
    }
});

/**
 * @route   GET /auth/check-staff
 * @desc    Verify if current user has staff permissions
 * @access  Private
 */
router.get('/check-staff', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'You must be logged in'
        });
    }
    
    return res.json({
        success: true,
        isStaff: !!req.user.isStaff
    });
});

/**
 * @route   GET /auth/check-banned
 * @desc    Check if a user is banned
 * @access  Private (Staff only)
 */
router.get('/check-banned/:discordId', apiLimiter, async (req, res) => {
    // Staff authentication check
    if (!req.isAuthenticated() || !req.user?.isStaff) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Staff access required'
        });
    }
    
    try {
        const { discordId } = req.params;
        
        // Validate Discord ID
        if (!discordId || !/^\d{17,19}$/.test(discordId)) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Invalid Discord ID format'
            });
        }
        
        // Find user by Discord ID
        const user = await User.findOne({ discordId });
        
        if (!user) {
            return res.json({
                success: true,
                exists: false,
                message: 'User not found in database'
            });
        }
        
        return res.json({
            success: true,
            exists: true,
            isBanned: !!user.isBanned,
            reason: user.isBanned ? (user.banReason || 'No reason provided') : null
        });
    } catch (error) {
        console.error('Ban check error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to check ban status'
        });
    }
});

// Export the router
module.exports = router;
