const chalk = require("chalk");

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const mongoose = require("mongoose");
const yaml = require("yaml");
const fs = require("fs");
const figlet = require("figlet");
const path = require("path");

const configPath = path.join(__dirname, "../config/config.yml");
const config = yaml.parse(fs.readFileSync(configPath, "utf8"));
const app = express();

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

displayWelcome();

// Database connection with error handling
mongoose
  .connect(config.mongodb.uri)
  .then(() => {
    console.log(chalk.green("[Database]"), "MongoDB connected successfully");
  })
  .catch((err) => {
    console.error(chalk.red("[Database]"), "MongoDB connection error:", err);
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
app.use("/", require("./routes/index"));
app.use("/dashboard", require("./routes/dashboard"));
app.use("/staff", require("./routes/staff"));
app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));

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

// Start Server
app.listen(config.server.port, () => {
  console.log(
    chalk.green("[System]"),
    `Server running on port ${config.server.port}`
  );
});
