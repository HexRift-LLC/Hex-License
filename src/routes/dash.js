/**
 * Hex License - Dashboard Routes
 * Handles user dashboard routes and license management
 */

const express = require("express");
const router = express.Router();
const License = require("../models/License");
const User = require("../models/User");
const Product = require("../models/Product");
const { sendLog } = require("../utils/discord");
const rateLimit = require("express-rate-limit");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");
const { version } = require("../../package.json");

// Load configuration
const configPath = path.join(__dirname, "../../config/config.yml");
const config = yaml.parse(fs.readFileSync(configPath, "utf8"));

// Rate limiters
const dashLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // limit each IP to 100 requests per window
  message: "Too many requests, please try again later",
});

const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // limit each IP to 30 actions per window
  message: { error: "Too many actions, please try again later" },
});

/**
 * Middleware to check user authentication
 * Redirects to login or banned page if necessary
 */
const isAuthenticated = (req, res, next) => {
  if (!req.isAuthenticated()) {
    // Store the requested URL for redirection after login
    req.session.returnTo = req.originalUrl;
    return res.redirect("/auth/discord");
  }

  if (req.user.isBanned) {
    return res.redirect("/banned");
  }

  next();
};

/**
 * Calculate time until HWID reset is available
 * @param {Date} lastReset - Timestamp of the last HWID reset
 * @returns {string} - Formatted time string
 */
function getTimeUntilReset(lastReset) {
  const resetTime = new Date(lastReset);
  const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const nextReset = new Date(resetTime.getTime() + cooldownPeriod);
  const now = new Date();
  const diff = nextReset - now;

  if (diff <= 0) {
    return "now";
  }

  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  return `in ${hours}h ${minutes}m`;
}

/**
 * Format license data for templates
 * @param {Array} licenses - Array of license documents
 * @returns {Array} - Formatted license data
 */
function formatLicensesForDisplay(licenses) {
  return licenses.map((license) => {
    return {
      ...license.toObject(),
      formattedCreatedAt: license.createdAt.toLocaleDateString(),
      formattedExpiresAt: license.expiresAt
        ? license.expiresAt.toLocaleDateString()
        : "Never",
      isExpired: license.expiresAt && license.expiresAt < new Date(),
      hwidResetAvailable:
        !license.lastHwidReset ||
        new Date() - new Date(license.lastHwidReset) >= 24 * 60 * 60 * 1000,
      displayKey:
        license.key.substring(0, Math.floor(license.key.length / 2)) + "...",
    };
  });
}

/**
 * Dashboard Routes
 */

/**
 * @route   GET /dash
 * @desc    Main dashboard page
 * @access  Private
 */
router.get("/", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    // Get user's licenses
    const licenses = await License.find({ user: req.user._id }).sort({
      createdAt: -1,
    }); // Sort newest first

    // Track dashboard access in logs
    sendLog("dashboard_access", {
      username: req.user.username,
      userId: req.user._id.toString(),
      licenseCount: licenses.length,
    });

    // Make getTimeUntilReset function available in template
    res.locals.getTimeUntilReset = getTimeUntilReset;

    // Render dashboard with data
    res.render("dash", {
      user: req.user,
      licenses: formatLicensesForDisplay(licenses),
      config: config,
      version: version,
      pageTitle: "Dashboard",
      activeNav: "dashboard",
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    // Log the error
    sendLog("dashboard_error", {
      username: req.user.username,
      error: error.message,
    });

    // Render error page
    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading your dashboard. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/licenses
 * @desc    View all user licenses
 * @access  Private
 */
router.get("/licenses", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    const licenses = await License.find({ user: req.user._id }).sort({
      createdAt: -1,
    });

    res.locals.getTimeUntilReset = getTimeUntilReset;

    res.render("dash-licenses", {
      user: req.user,
      licenses: formatLicensesForDisplay(licenses),
      config: config,
      version: version,
      pageTitle: "My Licenses",
      activeNav: "licenses",
    });
  } catch (error) {
    console.error("Licenses page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading your licenses. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/license/:id
 * @desc    View details of a specific license
 * @access  Private (must own the license)
 */
router.get("/license/:id", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).render("error", {
        errorType: "400",
        errorTitle: "Invalid Request",
        errorMessage: "The license ID format is invalid.",
        errorIcon: "fa-exclamation-circle",
        config: config,
      });
    }

    // Find license and make sure it belongs to the user
    const license = await License.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!license) {
      return res.status(404).render("error", {
        errorType: "404",
        errorTitle: "License Not Found",
        errorMessage:
          "The requested license does not exist or does not belong to you.",
        errorIcon: "fa-search",
        config: config,
      });
    }

    // Get license history if available
    const licenseHistory = []; // This would ideally come from a LicenseHistory model

    res.locals.getTimeUntilReset = getTimeUntilReset;

    // Render the license details page
    res.render("dash-license-details", {
      user: req.user,
      license: {
        ...license.toObject(),
        formattedCreatedAt: license.createdAt.toLocaleDateString(),
        formattedExpiresAt: license.expiresAt
          ? license.expiresAt.toLocaleDateString()
          : "Never",
        isExpired: license.expiresAt && license.expiresAt < new Date(),
        hwidResetAvailable:
          !license.lastHwidReset ||
          new Date() - new Date(license.lastHwidReset) >= 24 * 60 * 60 * 1000,
        timeUntilReset: license.lastHwidReset
          ? getTimeUntilReset(license.lastHwidReset)
          : "now",
      },
      licenseHistory,
      config: config,
      version: version,
      pageTitle: "License Details",
      activeNav: "licenses",
    });
  } catch (error) {
    console.error("License details error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading license details. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   POST /dash/licenses/:id/reset-hwid
 * @desc    Reset HWID for a license
 * @access  Private (must own the license)
 */
router.post(
  "/licenses/:id/reset-hwid",
  actionLimiter,
  isAuthenticated,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ID format
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          success: false,
          error: "Invalid license ID format",
        });
      }

      // Find the license and ensure it belongs to the user
      const license = await License.findOne({
        _id: id,
        user: req.user._id,
      });

      if (!license) {
        return res.status(404).json({
          success: false,
          error:
            "License not found or you do not have permission to reset its HWID",
        });
      }

      // Check for cooldown (24 hours between resets)
      if (license.lastHwidReset) {
        const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        const now = new Date();
        const resetTime = new Date(license.lastHwidReset);
        const timeLeft = cooldownPeriod - (now - resetTime);

        if (timeLeft > 0) {
          const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
          return res.status(429).json({
            success: false,
            error: `HWID reset is on cooldown. Please try again in ${hoursLeft} hours.`,
            cooldown: {
              resetsAt: new Date(resetTime.getTime() + cooldownPeriod),
              timeLeft: timeLeft,
            },
          });
        }
      }

      // Reset the HWID
      const previousHwid = license.hwid;
      license.hwid = null;
      license.lastHwidReset = new Date();
      await license.save();

      // Log the HWID reset
      sendLog("hwid_reset", {
        key:
          license.key.substring(0, 4) +
          "..." +
          license.key.substring(license.key.length - 4),
        product: license.product,
        username: req.user.username,
        previousHwid: previousHwid
          ? previousHwid.substring(0, 8) + "..."
          : "None",
      });

      return res.json({
        success: true,
        message: "HWID reset successfully",
        license: {
          id: license._id,
          lastHwidReset: license.lastHwidReset,
        },
      });
    } catch (error) {
      console.error("HWID reset error:", error);

      return res.status(500).json({
        success: false,
        error:
          "An error occurred while resetting HWID. Please try again later.",
      });
    }
  }
);

/**
 * @route   GET /dash/profile
 * @desc    User profile page
 * @access  Private
 */
router.get("/profile", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    // Get statistics
    const totalLicenses = await License.countDocuments({ user: req.user._id });
    const activeLicenses = await License.countDocuments({
      user: req.user._id,
      isActive: true,
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
    });

    // Get recent activity (would come from an Activity model in a real app)
    const recentActivity = [];

    res.render("dash-profile", {
      user: req.user,
      stats: {
        totalLicenses,
        activeLicenses,
        accountAge: Math.floor(
          (new Date() - new Date(req.user.createdAt)) / (1000 * 60 * 60 * 24)
        ), // days
      },
      recentActivity,
      config: config,
      version: version,
      pageTitle: "My Profile",
      activeNav: "profile",
    });
  } catch (error) {
    console.error("Profile page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading your profile. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/support
 * @desc    Support page
 * @access  Private
 */
router.get("/support", dashLimiter, isAuthenticated, (req, res) => {
  try {
    res.render("dash-support", {
      user: req.user,
      supportLinks: {
        discord: config.support.discord || "https://discord.gg/yourserver",
        documentation: config.support.docs || "https://docs.yourdomain.com",
        email: config.support.email || "support@yourdomain.com",
      },
      config: config,
      version: version,
      pageTitle: "Support",
      activeNav: "support",
    });
  } catch (error) {
    console.error("Support page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading the support page. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/notifications
 * @desc    User notifications page
 * @access  Private
 */
router.get("/notifications", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    // This would normally pull from a Notification model
    // For now we'll just display sample notifications
    const notifications = [
      {
        type: "info",
        title: "Welcome to Hex License",
        message: "Thank you for using our service.",
        date: new Date(),
        read: false,
      },
      {
        type: "warning",
        title: "License Expiring Soon",
        message: "One of your licenses will expire in 7 days.",
        date: new Date(Date.now() - 86400000),
        read: true,
      },
    ];

    res.render("dash-notifications", {
      user: req.user,
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
      config: config,
      version: version,
      pageTitle: "Notifications",
      activeNav: "notifications",
    });
  } catch (error) {
    console.error("Notifications page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading your notifications. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/products
 * @desc    View products available to the user
 * @access  Private
 */
router.get("/products", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    // Get all products (would be filtered by user access in a real app)
    const products = await Product.find({});

    // Get user licenses grouped by product
    const licenses = await License.find({ user: req.user._id });

    // Group licenses by product
    const licensesByProduct = {};
    licenses.forEach((license) => {
      if (!licensesByProduct[license.product]) {
        licensesByProduct[license.product] = [];
      }
      licensesByProduct[license.product].push(license);
    });

    // Format product data for display
    const formattedProducts = products.map((product) => {
      const productLicenses = licensesByProduct[product.name] || [];
      return {
        ...product.toObject(),
        licenseCount: productLicenses.length,
        hasActiveLicense: productLicenses.some(
          (l) => l.isActive && (!l.expiresAt || l.expiresAt > new Date())
        ),
      };
    });

    res.render("dash-products", {
      user: req.user,
      products: formattedProducts,
      config: config,
      version: version,
      pageTitle: "Products",
      activeNav: "products",
    });
  } catch (error) {
    console.error("Products page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading products. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   GET /dash/activate
 * @desc    Page to activate a new license
 * @access  Private
 */
router.get("/activate", dashLimiter, isAuthenticated, (req, res) => {
  try {
    res.render("dash-activate", {
      user: req.user,
      config: config,
      version: version,
      pageTitle: "Activate License",
      activeNav: "activate",
    });
  } catch (error) {
    console.error("Activate page error:", error);

    res.status(500).render("error", {
      errorType: "server",
      errorTitle: "Server Error",
      errorMessage:
        "An error occurred while loading the activation page. Please try again later.",
      errorIcon: "fa-exclamation-triangle",
      config: config,
    });
  }
});

/**
 * @route   POST /dash/activate
 * @desc    Activate a license key by adding it to user account
 * @access  Private
 */
router.post("/activate", actionLimiter, isAuthenticated, async (req, res) => {
  try {
    const { licenseKey } = req.body;

    if (!licenseKey || typeof licenseKey !== "string") {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid license key",
      });
    }

    // Find the license
    const license = await License.findOne({ key: licenseKey.trim() });

    if (!license) {
      return res.status(404).json({
        success: false,
        error: "License key not found",
      });
    }

    // Check if license is already assigned to a user
    if (license.user) {
      // If it's already assigned to this user, tell them
      if (license.user.toString() === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "This license key is already activated on your account",
        });
      }

      // Otherwise, it belongs to someone else
      return res.status(403).json({
        success: false,
        error: "This license key is already activated by another user",
      });
    }

    // Check if license is active
    if (!license.isActive) {
      return res.status(403).json({
        success: false,
        error: "This license key is inactive",
      });
    }

    // Check if license is expired
    if (license.expiresAt && license.expiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        error: "This license key has expired",
      });
    }

    // Assign the license to the user
    license.user = req.user._id;
    await license.save();

    // Log the activation
    sendLog("license_activated", {
      key:
        license.key.substring(0, 4) +
        "..." +
        license.key.substring(license.key.length - 4),
      product: license.product,
      username: req.user.username,
      userId: req.user._id.toString(),
    });

    return res.json({
      success: true,
      message: "License key activated successfully",
      license: {
        id: license._id,
        product: license.product,
      },
    });
  } catch (error) {
    console.error("License activation error:", error);

    return res.status(500).json({
      success: false,
      error:
        "An error occurred while activating the license. Please try again later.",
    });
  }
});

/**
 * API endpoints for dashboard
 */

/**
 * @route   GET /dash/api/stats
 * @desc    Get user stats for dashboard widgets
 * @access  Private
 */
router.get("/api/stats", dashLimiter, isAuthenticated, async (req, res) => {
  try {
    // Get license stats
    const totalLicenses = await License.countDocuments({ user: req.user._id });
    const activeLicenses = await License.countDocuments({
      user: req.user._id,
      isActive: true,
    });
    const boundLicenses = await License.countDocuments({
      user: req.user._id,
      hwid: { $ne: null },
    });

    // Get product distribution
    const productStats = await License.aggregate([
      { $match: { user: req.user._id } },
      { $group: { _id: "$product", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Format the stats
    const stats = {
      licenses: {
        total: totalLicenses,
        active: activeLicenses,
        bound: boundLicenses,
        unbound: totalLicenses - boundLicenses,
      },
      products: productStats.map((p) => ({
        name: p._id,
        count: p.count,
      })),
    };

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Stats API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch user statistics",
    });
  }
});

/**
 * Error handlers
 */

// 404 handler for dashboard routes
router.use((req, res) => {
  res.status(404).render("error", {
    errorType: "404",
    errorTitle: "Page Not Found",
    errorMessage: "The page you are looking for does not exist.",
    errorIcon: "fa-search",
    config: config,
  });
});

// Export the router
module.exports = router;
