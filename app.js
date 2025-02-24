const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');

// Load config
const config = yaml.load(fs.readFileSync(path.join(__dirname, 'config', 'config.yml'), 'utf8'));

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(session({
    secret: config.server.sessionSecret,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Discord Strategy
passport.use(new DiscordStrategy({
    clientID: config.discord.clientId,
    clientSecret: config.discord.clientSecret,
    callbackURL: config.discord.callbackUrl,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

app.use('/', indexRoutes);
app.use(authRoutes); // Ensure this line is present

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.listen(config.server.port, () => console.log(`Server running on port ${config.server.port}`));

const connectDB = require('./config/database');
connectDB();
