const chalk = require("chalk");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const yaml = require("yaml");
const fs = require("fs");
const figlet = require("figlet");
const path = require("path");
const axios = require("axios");
const indexRoutes = require('./routes/index');
const errorRoutes = require('./routes/error');
const staffRoutes = require('./routes/staff');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dash');
const { version } = require('../package.json');
const MongoStore = require('connect-mongo');
const fetch = require('node-fetch');
const { sendLog } = require('./utils/discord');
const User = require('./models/User');
const configPath = path.join(__dirname, "../config/config.yml");
const config = yaml.parse(fs.readFileSync(configPath, "utf8"));
const app = express();

const PRODUCT_ID = "Hex License";
const currentVersion = version;
let lastStatusUpdate = 0;
const STATUS_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

function displayWelcome() {
  console.clear();
  console.log("\n");
  console.log(
    chalk.red(
      figlet.textSync("Hex License", {
        font: "ANSI Shadow",
        horizontalLayout: "full",
      })
    )
  );
  console.log("\n");
  console.log(chalk.red("━".repeat(70)));
  console.log(
    chalk.white.bold(
      "      Welcome to Hex License - The Ultimate License Management Solution   "
    )
  );
  console.log(chalk.red("━".repeat(70)), "\n");
}

async function checkVersion() {
  try {
    const response = await axios.get(
      `https://hexarion.net/api/version/${PRODUCT_ID}?current=${currentVersion}`,
      {
        headers: {
          "x-api-key": "8IOLaAYzGJNwcYb@bm1&WOcr%aK5!O",
        },
      }
    );

    if (!response.data.version) {
      console.log(chalk.yellow("[Updater]"), "Version information not available");
      return;
    }

    if (response.data.same) {
      console.log(chalk.green("[Updater]"), `Hex License (v${currentVersion}) is up to date!`);
      return true;
    } else {
      console.log(chalk.red("[Updater]"), 
        `Hex License (v${currentVersion}) is outdated. Update to v${response.data.version}.`);
      process.exit(1);
    }
  } catch (error) {
    console.log(chalk.red("[Updater]"), "Version check failed:", 
      error.response?.data?.error || error.message);
    process.exit(1);
  }
}

function watchConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'config.yml');
  
  fs.watch(configPath, (eventType, filename) => {
      if (eventType === 'change') {
          try {
              const newConfig = yaml.parse(fs.readFileSync(configPath, 'utf8'));
              Object.assign(config, newConfig);
              console.log(chalk.green('[System]'), 'Configuration reloaded successfully');
          } catch (error) {
              console.log(chalk.red('[System]'), 'Error reloading configuration:', error);
          }
      }
  });
}


function startServer() {
  // Database connection
  mongoose
    .connect(config.mongodb.uri)
    .then(() => {
      console.log(chalk.green("[Database]"), "MongoDB connected successfully");
    })
    .catch((err) => {
      console.error(chalk.red("[Database]"), "MongoDB connection error:", err);
      process.exit(1);
    });

  // Middleware
  app.set("view engine", "ejs");
  app.use(express.static("public"));
  app.use(express.json());
  app.use(
    session({
      secret: config.server.session_secret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: config.mongodb.uri,
        ttl: 14 * 24 * 60 * 60, // Session TTL in seconds (14 days)
        autoRemove: 'native'
      }),
      cookie: {
        maxAge: 14 * 24 * 60 * 60 * 1000 // Cookie duration in milliseconds (14 days)
      }
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.locals.config = config;

  // Routes
  app.use('/', indexRoutes);
  app.use('/', errorRoutes);
  app.use('/staff', staffRoutes);
  app.use('/api', apiRoutes);
  app.use('/auth', authRoutes);
  app.use('/dash', dashboardRoutes);
  // Handle 404 errors - Place this after all other routes
app.use((req, res) => {
  res.redirect('/404');
});

// Handle all other errors (500) - Place this after 404 handler
app.use((err, req, res, next) => {
  console.error(chalk.red('[Error]'), err.stack);
  res.redirect('/500');
});

  // Discord Bot Setup
  const { Client, GatewayIntentBits } = require("discord.js");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once("ready", () => {
    console.log(chalk.blue("[Bot]"), `Logged in as ${client.user.tag}`);
  });

  client.login(config.discord.bot_token).catch((err) => {
    console.error(chalk.red("[Bot]"), "Failed to login to Discord:", err);
  });

  
  // Protected route middleware
  const protectStaffRoutes = (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.redirect('/auth/discord');
    }
      
    const isAuthorized = req.user.isStaff || req.user.discordId === config.discord.owner_id;
    if (!isAuthorized) {
      return res.redirect('/dash');
    }
    next();
  };

  async function updateDiscordUsers() {
    try {
        const users = await User.find({});
        let hasUpdates = false;
        const userStatuses = [];

        for (const user of users) {
            const response = await fetch(`https://discord.com/api/users/${user.discordId}`, {
                headers: {
                    Authorization: `Bot ${config.discord.bot_token}`
                }
            });

            const discordUser = await response.json();
            const needsUpdate = discordUser.username !== user.username || discordUser.avatar !== user.avatar;
            
            userStatuses.push({
                username: user.username,
                hasUpdate: needsUpdate
            });

            if (needsUpdate) {
                hasUpdates = true;
                await User.findOneAndUpdate(
                    { discordId: user.discordId },
                    {
                        username: discordUser.username,
                        avatar: discordUser.avatar
                    }
                );

                sendLog("user_updated", {
                    discordId: user.discordId,
                    oldUsername: user.username,
                    newUsername: discordUser.username,
                    avatarChanged: user.avatar !== discordUser.avatar
                });
            }
        }

        // Only send status update if an hour has passed
        const currentTime = Date.now();
        if (currentTime - lastStatusUpdate >= STATUS_UPDATE_INTERVAL) {
            sendLog("user_check_status", {
                hasUpdates,
                users: userStatuses
            });
            lastStatusUpdate = currentTime;
        }

    } catch (error) {
        console.error(chalk.red("[System]"), "Error in background user update:", error);
    }
  }    
  // This will run immediately when server starts
  updateDiscordUsers();

  // This will continue to run every 5 minutes after
  setInterval(updateDiscordUsers, 5 * 60 * 1000);

  // Apply protection to staff routes
  app.use('/staff/*', protectStaffRoutes);

  // Start Server
  app.listen(config.server.port, () => {
    console.log(
      chalk.green("[System]"),
      `Server running on port ${config.server.port}`
    );
  });
}

// Initial sequence
async function initialize() {
  displayWelcome();
  await checkVersion();
  watchConfig();
  startServer();
}
initialize();

