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
      console.error(chalk.red("[Fatal]"), "License validation failed. Application will now exit.");
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
  // Now safe to require all other dependencies that might trigger Discord, etc.
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
  
  // Initialize Express application - THIS IS THE MISSING PART
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
  return app;
}
// Start the application
main().catch(error => {
  console.error(chalk.red("[Fatal]"), `Unhandled startup error: ${error.message}`);
  process.exit(1);
});

// Export for testing purposes
module.exports = { main };
