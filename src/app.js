// Initial minimal imports needed for basic startup
const chalk = require("chalk");
const figlet = require("figlet");
const { createLogger, format, transports } = require("winston");
const { version } = require("../package.json");

// Initialize minimal logger
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: "hex-license" },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp }) => {
          return `${timestamp} ${level}: ${message}`;
        })
      ),
    }),
  ],
});

/**
 * Display welcome message in console
 */
function displayWelcome() {
  console.clear();
  console.log("\n");
  console.log(
    chalk.hex("#8b5cf6")(
      figlet.textSync("Hex License", {
        font: "ANSI Shadow",
        horizontalLayout: "full",
      })
    )
  );
  console.log("\n");
  console.log(chalk.hex("#8b5cf6")("━".repeat(75)));
  console.log(
    chalk.white.bold(
      "      Welcome to Hex License - The Ultimate License Management Solution   "
    )
  );
  console.log(chalk.hex("#8b5cf6")("━".repeat(75)), "\n");
  console.log(chalk.cyan("[System]"), `Version: ${version}`);
  console.log(chalk.cyan("[System]"), `Node.js: ${process.version}`);
  console.log("");
}

/**
 * Main application entry point
 */
async function main() {
  try {
    // Display welcome banner first
    displayWelcome();

    // License validation step
    console.log(chalk.cyan("[System]"), "Initializing license verification...");
    const AuthManager = require("./API/checker.js");
    const authManager = new AuthManager();

    // Validate license - must happen before anything else
    const isLicenseValid = await authManager.validate();

    if (!isLicenseValid) {
      logger.error("License validation failed. Application will now exit.");
      console.error(
        chalk.red("[Fatal]"),
        "License validation failed. Application will now exit."
      );
      process.exit(1);
    }

    console.log(chalk.green("[System]"), "License validated successfully");

    // NOW it's safe to load all the other modules and start the application
    const app = await initializeFullApplication();

    return app;
  } catch (error) {
    logger.error(`Application startup failed: ${error.message}`);
    console.error(chalk.red("[Fatal]"), `Startup error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Initialize the full application AFTER license validation
 * This function should only be called after successful license validation
 */
async function initializeFullApplication() {
  // Now safe to require all other dependencies
  const express = require("express");
  const session = require("express-session");
  const passport = require("passport");
  const mongoose = require("mongoose");
  const MongoStore = require("connect-mongo");
  const helmet = require("helmet");
  const compression = require("compression");
  const cors = require("cors");
  const rateLimit = require("express-rate-limit");
  const yaml = require("yaml");
  const fs = require("fs");
  const path = require("path");
  const axios = require("axios");

  // Initialize Express application
  const app = express();

  // Now safe to import routes and utilities
  const indexRoutes = require("./routes/index");
  const errorRoutes = require("./routes/error");
  const staffRoutes = require("./routes/staff");
  const apiRoutes = require("./routes/api");
  const authRoutes = require("./routes/auth");
  const dashboardRoutes = require("./routes/dash");
  const User = require("./models/User");

  // Only now load Discord-related modules
  const { sendLog, sendStartupMessage } = require("./utils/discord");

  // Configuration and constants
  const CONFIG_PATH = path.join(__dirname, "../config/config.yml");
  const PRODUCT_ID = "Hex License";
  const STATUS_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour
  let config;
  let lastStatusUpdate = 0;
  let server;

  /**
   * Load configuration from YAML file
   * @returns {Object} Configuration object
   */
  function loadConfig() {
    try {
      const configFile = fs.readFileSync(CONFIG_PATH, "utf8");
      return yaml.parse(configFile);
    } catch (error) {
      logger.error(`Failed to load configuration: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Set up configuration file watching for live updates
   */
  function watchConfig() {
    logger.info("Setting up configuration file watcher");

    fs.watch(CONFIG_PATH, (eventType, filename) => {
      if (eventType === "change") {
        try {
          logger.info("Configuration file changed, reloading...");
          const newConfig = loadConfig();

          // Update global config
          Object.assign(config, newConfig);

          // Make config available to views
          app.locals.config = config;

          logger.info("Configuration reloaded successfully");
        } catch (error) {
          logger.error(`Error reloading configuration: ${error.message}`);
        }
      }
    });
  }

  /**
   * Connect to MongoDB with retry logic
   * @returns {Promise<mongoose.Connection>}
   */
  async function connectDatabase() {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 5000; // 5 seconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(
          `Connecting to MongoDB (attempt ${attempt}/${MAX_RETRIES})...`
        );

        await mongoose.connect(config.mongodb.uri, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000,
          maxPoolSize: 10,
        });

        logger.info("MongoDB connected successfully");
        return mongoose.connection;
      } catch (err) {
        logger.error(
          `MongoDB connection error (attempt ${attempt}/${MAX_RETRIES}): ${err.message}`
        );

        if (attempt === MAX_RETRIES) {
          logger.error(
            "Maximum MongoDB connection attempts reached. Exiting..."
          );
          throw err;
        }

        // Wait before next attempt
        logger.info(
          `Waiting ${RETRY_DELAY / 1000} seconds before next attempt...`
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  /**
   * Initialize Discord bot
   * @returns {Promise<void>}
   */
  async function initializeDiscordBot() {
    try {
      logger.info("Initializing Discord bot integration...");

      // Initialize Discord client
      const { Client, GatewayIntentBits } = require("discord.js");
      const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
      });

      client.once("ready", () => {
        logger.info(`Discord bot logged in as ${client.user.tag}`);
      });

      client.on("error", (err) => {
        logger.error(`Discord bot error: ${err.message}`);
      });

      await client.login(config.discord.bot_token);
      return client;
    } catch (err) {
      logger.error(`Failed to initialize Discord bot: ${err.message}`);
      // Continue without Discord functionality
      return null;
    }
  }

  /**
   * Setup Express middleware and routes
   */
  function setupExpress() {
    logger.info("Setting up Express application...");

    // Basic settings
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "views"));
    app.set("trust proxy", 1); // Trust first proxy

    // Rate limiting - general
    const generalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      message: "Too many requests, please try again later",
    });

    // Rate limiting - API specific (stricter)
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50, // limit each IP to 50 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests, please try again later" },
    });

    // Apply rate limiting
    app.use(generalLimiter);
    app.use("/api", apiLimiter);

    // Request parsing middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Compression for better performance
    app.use(compression());

    // Static files
    app.use(
      express.static(path.join(__dirname, "../public"), {
        maxAge: config.server.NODE_ENV === "Production" ? "1d" : 0,
      })
    );

    // Session management
    const sessionMiddleware = session({
      secret: config.server.session_secret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: config.mongodb.uri,
        ttl: 14 * 24 * 60 * 60, // 14 days
        autoRemove: "native",
        touchAfter: 24 * 3600, // 1 day
      }),
      cookie: {
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
        httpOnly: true,
        secure: config.server.NODE_ENV === "Production",
        sameSite: "lax",
      },
    });
    app.use(sessionMiddleware);

    // Authentication
    app.use(passport.initialize());
    app.use(passport.session());

    // Make config available to templates
    app.locals.config = config;
    app.locals.version = version;

    // Request logging middleware
    app.use((req, res, next) => {
      const startTime = Date.now();

      // Log after response is sent
      res.on("finish", () => {
        const duration = Date.now() - startTime;
        logger.info(
          `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
        );
      });

      next();
    });
  }

  /**
   * Set up all application routes
   */
  function setupRoutes() {
    logger.info("Setting up application routes...");

    // Main routes
    app.use("/", indexRoutes);
    app.use("/", errorRoutes);
    app.use("/staff", staffRoutes);
    app.use("/api", apiRoutes);
    app.use("/auth", authRoutes);
    app.use("/dash", dashboardRoutes);

    // Protected route middleware for staff routes
    const protectStaffRoutes = (req, res, next) => {
      if (!req.isAuthenticated()) {
        return res.redirect("/auth/discord");
      }

      const isAuthorized =
        req.user.isStaff || req.user.discordId === config.discord.owner_id;
      if (!isAuthorized) {
        sendLog("unauthorized_access", {
          username: req.user?.username || "Unknown",
          route: req.originalUrl,
          ip: req.ip,
        });

        return res.redirect("/dash");
      }
      next();
    };

    // Apply staff route protection
    app.use("/staff/*", protectStaffRoutes);

    // Handle 404 errors - Place this after all other routes
    app.use((req, res) => {
      res.status(404).redirect("/404");
    });

    // Global error handler
    app.use((err, req, res, next) => {
      logger.error(`Global error handler: ${err.message}`);
      logger.error(err.stack);

      // Log to Discord if available
      sendLog("server_error", {
        error: err.message,
        route: req.originalUrl,
        method: req.method,
        stack: err.stack,
      });

      // Don't expose error details in production
      if (config.server.NODE_ENV === "Production") {
        return res.status(500).redirect("/500");
      } else {
        return res.status(500).render("error", {
          errorType: "500",
          errorIcon: "fa-exclamation-triangle",
          errorTitle: "Server Error",
          errorMessage: err.message,
          errorStack: err.stack,
          config: config,
        });
      }
    });
  }

  /**
   * Synchronize user profiles with Discord
   * Ensures user data is up-to-date with Discord profiles
   */
  async function synchronizeUsers() {
    try {
      logger.info("Starting user profile synchronization");

      // Skip if it's been less than an hour since last update
      const now = Date.now();
      if (now - lastStatusUpdate < STATUS_UPDATE_INTERVAL) {
        logger.info("Skipping user sync - performed recently");
        return;
      }

      lastStatusUpdate = now;

      // Get all users
      const users = await User.find();
      logger.info(`Synchronizing ${users.length} user profiles`);

      // Set up Discord client with appropriate intents
      const { Client, GatewayIntentBits } = require("discord.js");
      const client = new Client({
        intents: [GatewayIntentBits.Guilds],
      });

      await client.login(config.discord.bot_token);

      // Wait for Discord client to be ready
      await new Promise((resolve) => {
        if (client.isReady()) {
          resolve();
        } else {
          client.once("ready", resolve);
        }
      });

      logger.info("Discord client ready for user synchronization");

      // Guild to fetch members from
      const guild = await client.guilds.fetch(config.discord.guild_id);
      if (!guild) {
        logger.error(`Guild not found: ${config.discord.guild_id}`);
        return;
      }

      const updatedUsers = [];
      let hasUpdates = false;

      // Check each user for updates
      for (const user of users) {
        try {
          // Skip if user has no Discord ID
          if (!user.discordId) {
            continue;
          }

          // Try to fetch the user from Discord
          const member = await guild.members
            .fetch(user.discordId)
            .catch(() => null);
          if (!member) {
            updatedUsers.push({
              username: user.username,
              hasUpdate: false,
              error: "Not found in Discord server",
            });
            continue;
          }

          // Check for profile updates
          const discordUser = member.user;
          const oldUsername = user.username;
          const newUsername = discordUser.username;
          const avatarChanged = user.avatar !== discordUser.avatar;

          // Only update if there's a change
          if (oldUsername !== newUsername || avatarChanged) {
            user.username = newUsername;
            user.avatar = discordUser.avatar;
            await user.save();

            hasUpdates = true;

            // Log the user update
            sendLog("user_updated", {
              discordId: user.discordId,
              oldUsername,
              newUsername,
              avatarChanged,
            });

            updatedUsers.push({
              username: newUsername,
              hasUpdate: true,
            });
          } else {
            updatedUsers.push({
              username: user.username,
              hasUpdate: false,
            });
          }
        } catch (error) {
          logger.error(
            `Error updating user ${user.discordId}: ${error.message}`
          );
          updatedUsers.push({
            username: user.username,
            hasUpdate: false,
            error: error.message,
          });
        }
      }

      // Log status update completion
      sendLog("user_check_status", {
        hasUpdates,
        users: updatedUsers,
      });

      // Destroy the temporary Discord client
      await client.destroy();

      logger.info(
        `User synchronization complete. Updated users: ${
          updatedUsers.filter((u) => u.hasUpdate).length
        }`
      );
    } catch (error) {
      logger.error(`User synchronization error: ${error.message}`);
    }
  }

  /**
   * Check for version updates against the central server
   */
  async function checkVersion() {
    try {
      logger.info("Checking for updates...");

      const response = await axios.get(
        `https://hexarion.net/api/version/${PRODUCT_ID}?current=${version}`,
        {
          headers: {
            "x-api-key": "8IOLaAYzGJNwcYb@bm1&WOcr%aK5!O",
          },
          timeout: 5000, // 5 second timeout
        }
      );

      if (!response.data.version) {
        logger.warn("Version information not available");
        return true;
      }

      if (response.data.same) {
        logger.info(`Hex License (v${version}) is up to date!`);
        return true;
      } else {
        logger.error(
          `Hex License (v${version}) is outdated. Update to v${response.data.version}.`
        );
        return false;
      }
    } catch (error) {
      logger.error(
        `Version check failed: ${error.response?.data?.error || error.message}`
      );

      // Don't exit on version check failure, just continue
      logger.info("Continuing startup despite version check failure");
      return true;
    }
  }
  /**
   * Register process event handlers for graceful shutdown
   */
  function registerProcessHandlers() {
    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error(`Uncaught Exception: ${error.message}`);
      logger.error(error.stack);

      // Log to Discord if available
      sendLog("server_error", {
        error: `Uncaught Exception: ${error.message}`,
        stack: error.stack,
      });

      // Graceful shutdown
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error(`Unhandled Promise Rejection at: ${promise}`);
      logger.error(
        `Reason: ${reason instanceof Error ? reason.message : reason}`
      );

      if (reason instanceof Error) {
        logger.error(reason.stack);
      }

      // Log to Discord if available
      sendLog("server_error", {
        error: `Unhandled Promise Rejection: ${
          reason instanceof Error ? reason.message : reason
        }`,
        stack:
          reason instanceof Error ? reason.stack : "No stack trace available",
      });
    });

    // Graceful shutdown on SIGTERM
    process.on("SIGTERM", async () => {
      logger.info("SIGTERM received, shutting down gracefully");
      await shutdownGracefully();
    });

    // Graceful shutdown on SIGINT (Ctrl+C)
    process.on("SIGINT", async () => {
      logger.info("SIGINT received, shutting down gracefully");
      await shutdownGracefully();
    });
  }
  /**
   * Perform graceful shutdown of the application
   */
  async function shutdownGracefully() {
    logger.info("Starting graceful shutdown sequence");

    try {
      // Close MongoDB connection
      if (mongoose.connection.readyState !== 0) {
        logger.info("Closing MongoDB connection");
        await mongoose.connection.close();
        logger.info("MongoDB connection closed");
      }

      // Disconnect Discord bot if initialized
      const { disconnect } = require("./utils/discord");
      await disconnect();
      logger.info("Discord bot disconnected");

      // Close HTTP server if it exists
      if (server) {
        logger.info("Closing HTTP server");
        await new Promise((resolve) => {
          server.close(resolve);
        });
        logger.info("HTTP server closed");
      }

      logger.info("Graceful shutdown complete");
    } catch (error) {
      logger.error(`Error during graceful shutdown: ${error.message}`);
    }

    // Exit the process
    process.exit(0);
  }

  // Begin application startup sequence
  try {
    // Load configuration
    config = loadConfig();
    logger.info("Configuration loaded successfully");

    // Watch for config changes
    watchConfig();

    // Connect to database
    await connectDatabase();

    // Setup Express application
    setupExpress();
    setupRoutes();

    // Start the server
    const PORT = config?.server?.port || 3000;
    server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
      console.log(chalk.green(`[Server]`), `Listening on port ${PORT}`);
      console.log(chalk.green(`[Server]`), `URL: http://localhost:${PORT}`);
      console.log("");
    });

    // Send startup notification to Discord
    sendStartupMessage({
      port: PORT,
      env: config.server.NODE_ENV || "Production",
    });

    // Check for updates
    await checkVersion();

    // Register process handlers
    registerProcessHandlers();

    // Initial user synchronization
    setTimeout(async () => {
      await synchronizeUsers();

      // Schedule periodic user synchronization
      setInterval(synchronizeUsers, STATUS_UPDATE_INTERVAL);
    }, 10000); // Start first sync after 10 seconds

    console.log(chalk.green("[System]"), "Initialization complete");

    return app;
  } catch (error) {
    logger.error(`Application initialization failed: ${error.message}`);
    console.error(
      chalk.red("[Error]"),
      `Initialization failed: ${error.message}`
    );

    // Try to log to Discord if possible
    sendLog("server_error", {
      error: `Initialization failure: ${error.message}`,
      stack: error.stack,
    });

    throw error; // Propagate error to main function
  }
}

// Start the application
main().catch((error) => {
  console.error(
    chalk.red("[Fatal]"),
    `Unhandled startup error: ${error.message}`
  );
  process.exit(1);
});

// Export for testing purposes
module.exports = { main };
