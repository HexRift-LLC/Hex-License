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
const dashboardRoutes = require('./routes/dashboard');
const { Auth } = require('./API/auth.js');

const configPath = path.join(__dirname, "../config/config.yml");
const config = yaml.parse(fs.readFileSync(configPath, "utf8"));
const app = express();

const PRODUCT_ID = "Hex License";
const currentVersion = "4.0.0";

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
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());
  

  // Routes
  app.use('/', indexRoutes);
  app.use('/', errorRoutes);
  app.use('/staff', staffRoutes);
  app.use('/api', apiRoutes);
  app.use('/auth', authRoutes);
  app.use('/dashboard', dashboardRoutes);

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
      return res.redirect('/dashboard');
    }
    next();
  };

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
  Auth(startServer);
}
initialize();
