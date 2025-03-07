/**
 * Hex License - API Routes
 * Handles license verification and management endpoints
 */

const express = require("express");
const router = express.Router();
const { body, param, validationResult } = require("express-validator");
const License = require("../models/License");
const User = require("../models/User");
const Product = require("../models/Product");
const { sendLog } = require("../utils/discord");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");

// Load configuration
const configPath = path.join(__dirname, "../../config/config.yml");
const config = yaml.parse(fs.readFileSync(configPath, "utf8"));

// Utility functions
/**
 * Generate a cryptographically secure license key
 * @param {number} length - Length of the key
 * @returns {string} - Generated license key
 */
function generateUniqueKey(length = config.license.key_length || 24) {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .toUpperCase()
    .slice(0, length);
}

/**
 * Format a license key for display (adds dashes every 4 characters)
 * @param {string} key - The license key to format
 * @returns {string} - Formatted license key
 */
function formatLicenseKey(key) {
  return key.match(/.{1,4}/g).join("-");
}

/**
 * Get masked key for logging (shows only first and last few characters)
 * @param {string} key - The license key to mask
 * @returns {string} - Masked license key for security
 */
function getMaskedKey(key) {
  if (!key || key.length < 8) return "***";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

// Middleware
/**
 * Authentication middleware for protected routes
 */
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({
    success: false,
    error: "Unauthorized",
    message: "You must be logged in to perform this action",
  });
};

/**
 * Authorization middleware for staff routes
 */
const isStaff = (req, res, next) => {
  if (req.isAuthenticated() && req.user.isStaff) return next();
  return res.status(403).json({
    success: false,
    error: "Forbidden",
    message: "You do not have permission to perform this action",
  });
};

/**
 * Middleware to check if user owns the license
 */
const isLicenseOwner = async (req, res, next) => {
  try {
    const license = await License.findById(req.params.id);

    if (!license) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "License not found",
      });
    }

    // Staff can manage any license
    if (req.user.isStaff) return next();

    // Check if user owns the license
    if (license.user && license.user.toString() === req.user._id.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: "Forbidden",
      message: "You do not have permission to manage this license",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server Error",
      message: "Failed to verify license ownership",
    });
  }
};

/**
 * Rate limiter for API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too Many Requests",
    message: "Too many requests from this IP, please try again later",
  },
});

/**
 * Rate limiter for verify endpoint (more strict)
 */
const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    success: false,
    error: "Too Many Requests",
    message:
      "Too many verification attempts from this IP, please try again later",
  },
});

// API Routes
/**
 * @route   POST /api/licenses/:id/reset-hwid
 * @desc    Reset the HWID for a license
 * @access  Private (user must own the license or be staff)
 */
router.post(
  "/licenses/:id/reset-hwid",
  apiLimiter,
  isAuthenticated,
  [param("id").isMongoId().withMessage("Invalid license ID format")],
  isLicenseOwner,
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      // Get license with user info
      const license = await License.findById(req.params.id).populate("user");

      if (!license) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License not found",
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
            error: "Cooldown Active",
            message: `HWID reset is on cooldown. Please try again in ${hoursLeft} hours.`,
            cooldown: {
              resetsAt: new Date(resetTime.getTime() + cooldownPeriod),
              timeLeft: timeLeft,
            },
          });
        }
      }

      // All checks passed, reset the HWID
      const previousHwid = license.hwid;
      license.hwid = null;
      license.lastHwidReset = new Date();
      await license.save();

      // Get username for logging
      const username = license.user ? license.user.username : "No Owner";

      // Send Discord notification
      sendLog("hwid_reset", {
        key: getMaskedKey(license.key),
        product: license.product,
        username: username,
        requestedBy: req.user.username,
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
      console.error("HWID Reset Error:", error);
      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to reset HWID",
      });
    }
  }
);

/**
 * @route   POST /api/verify
 * @desc    Verify a license key
 * @access  Public
 */
router.post(
  "/verify",
  verifyLimiter,
  [
    body("key")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("License key is required"),
    body("hwid")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Hardware ID is required"),
    body("product")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Product name is required"),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    const { key, hwid, product } = req.body;

    try {
      // Find the license and populate user info
      const license = await License.findOne({ key }).populate("user");

      // If license doesn't exist
      if (!license) {
        sendLog("license_verify_failed", {
          key: getMaskedKey(key),
          reason: "License not found",
          product: product,
          hwid: hwid.substring(0, 8) + "...",
          username: "No Owner",
          ipAddress: req.ip,
        });

        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License key not found",
        });
      }

      // Get username for logging
      const username = license.user
        ? license.user.username
        : license.discordId
        ? license.discordUsername
        : "No Owner";

      // Check if product matches
      if (license.product !== product) {
        sendLog("license_verify_failed", {
          key: getMaskedKey(license.key),
          reason: "Invalid product",
          product: product,
          requestedProduct: product,
          actualProduct: license.product,
          username: username,
          ipAddress: req.ip,
        });

        return res.status(403).json({
          success: false,
          error: "Invalid Product",
          message: "This license key is not valid for the specified product",
        });
      }

      // Check if license is active
      if (!license.isActive) {
        sendLog("license_verify_failed", {
          key: getMaskedKey(license.key),
          reason: "License inactive",
          product: product,
          username: username,
          ipAddress: req.ip,
        });

        return res.status(403).json({
          success: false,
          error: "License Inactive",
          message: "This license is currently inactive",
        });
      }

      // Check if license has expired
      if (license.expiresAt && license.expiresAt < new Date()) {
        sendLog("license_verify_failed", {
          key: getMaskedKey(license.key),
          reason: "License expired",
          product: product,
          username: username,
          ipAddress: req.ip,
        });

        return res.status(403).json({
          success: false,
          error: "License Expired",
          message: "This license has expired",
        });
      }

      // If HWID is not set, bind it to this HWID
      if (!license.hwid) {
        license.hwid = hwid;

        sendLog("license_hwid_bound", {
          key: getMaskedKey(license.key),
          hwid: hwid.substring(0, 8) + "...",
          product: product,
          username: username,
          ipAddress: req.ip,
        });
      }
      // If HWID is set but doesn't match
      else if (license.hwid !== hwid) {
        sendLog("license_verify_failed", {
          key: getMaskedKey(license.key),
          reason: "HWID mismatch",
          product: product,
          username: username,
          requestedHwid: hwid.substring(0, 8) + "...",
          boundHwid: license.hwid.substring(0, 8) + "...",
          ipAddress: req.ip,
        });

        return res.status(403).json({
          success: false,
          error: "HWID Mismatch",
          message: "This license is bound to a different device",
        });
      }

      // Update license last used timestamp
      license.lastVerified = new Date();
      await license.save();

      // Log successful verification
      sendLog("license_verify_success", {
        key: getMaskedKey(license.key),
        product: product,
        hwid: hwid.substring(0, 8) + "...",
        username: username,
        ipAddress: req.ip,
      });

      // Return successful response with useful data
      return res.json({
        success: true,
        valid: true,
        license: {
          product: license.product,
          expiresAt: license.expiresAt,
          features: license.features || [],
          user: username,
        },
      });
    } catch (error) {
      console.error("License Verification Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to verify license",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route   GET /api/products
 * @desc    Get list of available products
 * @access  Public
 */
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find({}).select("name description");

    return res.json({
      success: true,
      products: products.map((p) => ({
        id: p._id,
        name: p.name,
        description: p.description,
      })),
    });
  } catch (error) {
    console.error("Products List Error:", error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
      message: "Failed to fetch products list",
    });
  }
});

/**
 * @route   GET /api/user/licenses
 * @desc    Get current user's licenses
 * @access  Private
 */
router.get("/user/licenses", isAuthenticated, async (req, res) => {
  try {
    const licenses = await License.find({ user: req.user._id });

    return res.json({
      success: true,
      licenses: licenses.map((license) => ({
        id: license._id,
        key: getMaskedKey(license.key),
        product: license.product,
        isActive: license.isActive,
        hwid: license.hwid ? license.hwid.substring(0, 8) + "..." : null,
        createdAt: license.createdAt,
        expiresAt: license.expiresAt,
        lastHwidReset: license.lastHwidReset,
      })),
    });
  } catch (error) {
    console.error("User Licenses Error:", error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
      message: "Failed to fetch user licenses",
    });
  }
});

/**
 * @route   GET /api/user/license/:id
 * @desc    Get details of a specific license
 * @access  Private (must own license or be staff)
 */
router.get(
  "/user/license/:id",
  isAuthenticated,
  [param("id").isMongoId().withMessage("Invalid license ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      // Find the license
      const license = await License.findById(req.params.id);

      if (!license) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License not found",
        });
      }

      // Check if user is authorized to view this license
      if (
        !req.user.isStaff &&
        (!license.user || license.user.toString() !== req.user._id.toString())
      ) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You do not have permission to view this license",
        });
      }

      // Return license details
      return res.json({
        success: true,
        license: {
          id: license._id,
          key: license.key, // Full key for owner/staff
          product: license.product,
          isActive: license.isActive,
          hwid: license.hwid,
          createdAt: license.createdAt,
          expiresAt: license.expiresAt,
          lastHwidReset: license.lastHwidReset,
          lastVerified: license.lastVerified,
        },
      });
    } catch (error) {
      console.error("License Details Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to fetch license details",
      });
    }
  }
);

/**
 * @route   POST /api/licenses/:id/activate
 * @desc    Activate a license
 * @access  Private (staff only)
 */
router.post(
  "/licenses/:id/activate",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid license ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      const license = await License.findById(req.params.id).populate("user");

      if (!license) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License not found",
        });
      }

      // If already active, no need to change
      if (license.isActive) {
        return res.json({
          success: true,
          message: "License is already active",
          license: {
            id: license._id,
            isActive: license.isActive,
          },
        });
      }

      // Activate the license
      license.isActive = true;
      await license.save();

      // Get username for logging
      const username = license.user ? license.user.username : "No Owner";

      // Log the activation
      sendLog("license_activated", {
        key: getMaskedKey(license.key),
        product: license.product,
        username: username,
        activatedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "License activated successfully",
        license: {
          id: license._id,
          isActive: license.isActive,
        },
      });
    } catch (error) {
      console.error("License Activation Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to activate license",
      });
    }
  }
);

/**
 * @route   POST /api/licenses/:id/deactivate
 * @desc    Deactivate a license
 * @access  Private (staff only)
 */
router.post(
  "/licenses/:id/deactivate",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid license ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      const license = await License.findById(req.params.id).populate("user");

      if (!license) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License not found",
        });
      }

      // If already inactive, no need to change
      if (!license.isActive) {
        return res.json({
          success: true,
          message: "License is already inactive",
          license: {
            id: license._id,
            isActive: license.isActive,
          },
        });
      }

      // Deactivate the license
      license.isActive = false;
      await license.save();

      // Get username for logging
      const username = license.user ? license.user.username : "No Owner";

      // Log the deactivation
      sendLog("license_deactivated", {
        key: getMaskedKey(license.key),
        product: license.product,
        username: username,
        deactivatedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "License deactivated successfully",
        license: {
          id: license._id,
          isActive: license.isActive,
        },
      });
    } catch (error) {
      console.error("License Deactivation Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to deactivate license",
      });
    }
  }
);

/**
 * @route   DELETE /api/licenses/:id
 * @desc    Delete a license
 * @access  Private (staff only)
 */
router.delete(
  "/licenses/:id",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid license ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      const license = await License.findById(req.params.id).populate("user");

      if (!license) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "License not found",
        });
      }

      // Get username for logging
      const username = license.user ? license.user.username : "No Owner";

      // Delete the license
      await License.findByIdAndDelete(req.params.id);

      // Log the deletion
      sendLog("license_deleted", {
        key: getMaskedKey(license.key),
        product: license.product,
        username: username,
        deletedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "License deleted successfully",
      });
    } catch (error) {
      console.error("License Deletion Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to delete license",
      });
    }
  }
);

/**
 * @route   POST /api/users/:id/ban
 * @desc    Ban a user
 * @access  Private (staff only)
 */
router.post(
  "/users/:id/ban",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid user ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      // Prevent banning yourself
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "You cannot ban yourself",
        });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
      }

      // Prevent banning staff if you're not higher level admin
      if (user.isStaff && !req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You cannot ban staff members",
        });
      }

      // Ban the user
      user.isBanned = true;
      user.banReason = req.body.reason || "No reason provided";
      await user.save();

      // Log the ban
      sendLog("user_banned", {
        username: user.username,
        discordId: user.discordId,
        reason: user.banReason,
        bannedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "User banned successfully",
        user: {
          id: user._id,
          isBanned: user.isBanned,
        },
      });
    } catch (error) {
      console.error("User Ban Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to ban user",
      });
    }
  }
);

/**
 * @route   POST /api/users/:id/unban
 * @desc    Unban a user
 * @access  Private (staff only)
 */
router.post(
  "/users/:id/unban",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid user ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
      }

      // Unban the user
      user.isBanned = false;
      user.banReason = null;
      await user.save();

      // Log the unban
      sendLog("user_unbanned", {
        username: user.username,
        discordId: user.discordId,
        unbannedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "User unbanned successfully",
        user: {
          id: user._id,
          isBanned: user.isBanned,
        },
      });
    } catch (error) {
      console.error("User Unban Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to unban user",
      });
    }
  }
);

/**
 * @route   POST /api/users/:id/make-staff
 * @desc    Promote a user to staff
 * @access  Private (admins only)
 */
router.post(
  "/users/:id/make-staff",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid user ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      // Ensure requester is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Only administrators can promote users to staff",
        });
      }

      // Don't allow self-promotion
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "You cannot modify your own staff status",
        });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
      }

      // Check if already staff
      if (user.isStaff) {
        return res.json({
          success: true,
          message: "User is already a staff member",
          user: {
            id: user._id,
            isStaff: user.isStaff,
          },
        });
      }

      // Make staff
      user.isStaff = true;
      await user.save();

      // Log the promotion
      sendLog("user_promoted", {
        username: user.username,
        discordId: user.discordId,
        promotedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "User promoted to staff successfully",
        user: {
          id: user._id,
          isStaff: user.isStaff,
        },
      });
    } catch (error) {
      console.error("Staff Promotion Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to promote user to staff",
      });
    }
  }
);

/**
 * @route   POST /api/users/:id/remove-staff
 * @desc    Remove staff status from a user
 * @access  Private (admins only)
 */
router.post(
  "/users/:id/remove-staff",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [param("id").isMongoId().withMessage("Invalid user ID format")],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    try {
      // Ensure requester is admin
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "Only administrators can demote staff members",
        });
      }

      // Don't allow self-demotion
      if (req.params.id === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "You cannot modify your own staff status",
        });
      }

      const user = await User.findById(req.params.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found",
        });
      }

      // Check if already not staff
      if (!user.isStaff) {
        return res.json({
          success: true,
          message: "User is already not a staff member",
          user: {
            id: user._id,
            isStaff: user.isStaff,
          },
        });
      }

      // Remove staff status
      user.isStaff = false;
      await user.save();

      // Log the demotion
      sendLog("user_demoted", {
        username: user.username,
        discordId: user.discordId,
        demotedBy: req.user.username,
      });

      return res.json({
        success: true,
        message: "Staff status removed successfully",
        user: {
          id: user._id,
          isStaff: user.isStaff,
        },
      });
    } catch (error) {
      console.error("Staff Demotion Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to remove staff status",
      });
    }
  }
);

/**
 * @route   POST /api/generate-licenses
 * @desc    Generate new licenses
 * @access  Private (staff only)
 */
router.post(
  "/generate-licenses",
  apiLimiter,
  isAuthenticated,
  isStaff,
  [
    body("quantity")
      .isInt({ min: 1, max: 100 })
      .withMessage("Quantity must be between 1 and 100"),
    body("duration")
      .isInt({ min: 1 })
      .withMessage("Duration must be at least 1 day"),
    body("product")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Product name is required"),
    body("userId")
      .optional({ checkFalsy: true })
      .isMongoId()
      .withMessage("Invalid user ID format"),
    body("discordId")
      .optional({ checkFalsy: true })
      .isString()
      .withMessage("Invalid Discord ID format"),
  ],
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        errors: errors.array(),
      });
    }

    const { quantity, duration, product, userId, discordId, discordUsername } =
      req.body;

    try {
      // Check if product exists, if not create it
      let productDoc = await Product.findOne({ name: product });

      if (!productDoc) {
        productDoc = new Product({
          name: product,
          description: `Auto-generated product for ${product}`,
        });
        await productDoc.save();

        sendLog("product_created", {
          product: product,
          createdBy: req.user.username,
        });
      }

      // If userId is provided, check if user exists
      let user = null;
      if (userId) {
        user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: "Not Found",
            message: "User not found",
          });
        }
      }

      // Generate licenses
      const licenses = [];
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + duration);
      const username = license.user ? license.user.username : 'No Owner';

      for (let i = 0; i < quantity; i++) {
        const key = generateUniqueKey(config.license.key_length || 24);

        const licenseData = {
          key,
          product,
          isActive: true,
          expiresAt: expirationDate,
          createdBy: req.user._id,
        };

        // Assign to user if specified
        if (userId && user) {
          licenseData.user = userId;
        }

        // Or assign to Discord user if specified
        if (discordId && discordUsername) {
          licenseData.discordId = discordId;
          licenseData.discordUsername = discordUsername;
        }

        const license = new License(licenseData);
        await license.save();

        licenses.push({
          id: license._id,
          key: license.key,
          expiresAt: license.expiresAt,
        });

        // Log each license generation
        sendLog("license_generated", {
          key: getMaskedKey(license.key),
          product: product,
          duration: duration,
          generatedBy: req.user.username,
          assignedTo: username || "Unassigned",
        });
      }

      return res.json({
        success: true,
        message: `${quantity} license(s) generated successfully`,
        licenses,
      });
    } catch (error) {
      console.error("License Generation Error:", error);

      return res.status(500).json({
        success: false,
        error: "Server Error",
        message: "Failed to generate licenses",
      });
    }
  }
);

/**
 * @route   GET /api/status
 * @desc    Check API status and health
 * @access  Public
 */
router.get("/status", (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();

    return res.json({
      success: true,
      status: "operational",
      version: process.env.npm_package_version || "unknown",
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + "MB",
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
      },
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Status Check Error:", error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
      message: "Failed to get server status",
    });
  }
});

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics
 * @access  Private (staff only)
 */
router.get("/dashboard/stats", isAuthenticated, isStaff, async (req, res) => {
  try {
    // Get counts
    const totalLicenses = await License.countDocuments();
    const activeLicenses = await License.countDocuments({ isActive: true });
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments();

    // Get recent licenses
    const recentLicenses = await License.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("user", "username")
      .select("key product isActive createdAt");

    // Calculate licenses by product
    const productStats = await License.aggregate([
      { $group: { _id: "$product", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    return res.json({
      success: true,
      stats: {
        counts: {
          totalLicenses,
          activeLicenses,
          totalUsers,
          totalProducts,
        },
        recentLicenses: recentLicenses.map((license) => ({
          id: license._id,
          key: getMaskedKey(license.key),
          product: license.product,
          isActive: license.isActive,
          createdAt: license.createdAt,
          username: license.user ? license.user.username : "Unassigned",
        })),
        productDistribution: productStats.map((stat) => ({
          product: stat._id,
          count: stat.count,
        })),
      },
    });
  } catch (error) {
    console.error("Dashboard Stats Error:", error);

    return res.status(500).json({
      success: false,
      error: "Server Error",
      message: "Failed to fetch dashboard statistics",
    });
  }
});

// Export the router
module.exports = router;
