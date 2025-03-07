/**
 * License Model
 * Represents a license key with associated metadata, user, and product information
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Auth Log Schema - Tracks authentication attempts for a license
 */
const authLogSchema = new Schema({
  timestamp: { type: Date, default: Date.now },
  successful: { type: Boolean, required: true },
  ip: { type: String },
  hwid: { type: String },
  userAgent: { type: String },
  location: { type: String },
  reason: { type: String } // Reason for failure if not successful
}, { _id: false });

/**
 * License Schema Definition
 */
const licenseSchema = new Schema({
  // Core license information
  key: { 
    type: String, 
    required: [true, 'License key is required'],
    unique: true,
    trim: true,
    index: true
  },
  
  // Product information
  product: { 
    type: String, 
    required: [true, 'Product name is required'],
    trim: true,
    index: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    index: true
  },
  
  // User assignments
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  discordId: {
    type: String,
    index: true
  },
  
  // Metadata
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot be longer than 500 characters']
  },
  
  // Status and time information
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  isBanned: {
    type: Boolean,
    default: false,
    index: true
  },
  banReason: {
    type: String,
    trim: true
  },
  
  // Time tracking
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  expiresAt: { 
    type: Date, 
    required: [true, 'Expiration date is required'],
    index: true
  },
  activatedAt: {
    type: Date
  },
  lastAccessedAt: {
    type: Date
  },
  
  // Hardware identification
  hwid: { 
    type: String,
    trim: true
  },
  lastHwidReset: { 
    type: Date 
  },
  maxHwidResets: {
    type: Number,
    default: 3,
    min: [0, 'Maximum HWID resets cannot be negative']
  },
  hwidResetCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Machine information
  machineInfo: {
    os: String,
    hostname: String,
    username: String,
    processor: String,
    memory: String,
    macAddress: String
  },
  
  // Usage tracking
  usageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // IP restrictions (optional)
  ipRestrictions: {
    enabled: {
      type: Boolean, 
      default: false
    },
    allowedIps: [String]
  },
  
  // Authentication logs
  authLogs: {
    type: [authLogSchema],
    default: []
  },
  
  // Custom fields (for flexible extensions)
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: () => new Map()
  }
}, {
  timestamps: true, // Adds updatedAt field automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Indexes for performance optimization
 */
// Compound index for product + isActive (common query pattern)
licenseSchema.index({ product: 1, isActive: 1 });
// Compound index for expiring licenses
licenseSchema.index({ expiresAt: 1, isActive: 1 });

/**
 * Virtual Properties
 */
// Calculate if license is expired
licenseSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return this.expiresAt < new Date();
});

// Calculate time remaining until expiration
licenseSchema.virtual('timeRemaining').get(function() {
  if (!this.expiresAt) return null;
  const now = new Date();
  return Math.max(0, this.expiresAt - now);
});

// Calculate days remaining until expiration
licenseSchema.virtual('daysRemaining').get(function() {
  if (!this.timeRemaining === null) return null;
  return Math.ceil(this.timeRemaining / (1000 * 60 * 60 * 24));
});

// Calculate if HWID reset is allowed
licenseSchema.virtual('canResetHwid').get(function() {
  // Check if max resets reached
  if (this.hwidResetCount >= this.maxHwidResets) return false;
  
  // Check if last reset was within cooldown period
  if (this.lastHwidReset) {
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const timeSinceReset = Date.now() - this.lastHwidReset.getTime();
    if (timeSinceReset < cooldownPeriod) return false;
  }
  
  return true;
});

/**
 * Instance Methods
 */
// Verify if license is valid for the given hardware ID
licenseSchema.methods.verify = function(hwid) {
  // Check if license is active
  if (!this.isActive) return { valid: false, reason: 'License inactive' };
  
  // Check if license is banned
  if (this.isBanned) return { valid: false, reason: 'License banned', banReason: this.banReason };
  
  // Check if license is expired
  if (this.isExpired) return { valid: false, reason: 'License expired' };
  
  // Check if HWID is bound
  if (this.hwid) {
    // Verify HWID matches
    if (this.hwid !== hwid) {
      return { valid: false, reason: 'HWID mismatch' };
    }
  } else {
    // If not bound, bind it now
    this.hwid = hwid;
    this.activatedAt = new Date();
  }
  
  // Update last accessed time
  this.lastAccessedAt = new Date();
  this.usageCount += 1;
  
  return { valid: true };
};

// Reset hardware ID
licenseSchema.methods.resetHwid = async function(adminOverride = false) {
  // Store the old HWID for logging
  const oldHwid = this.hwid;
  
  // Check if admin override or normal reset is allowed
  if (adminOverride || this.canResetHwid) {
    this.hwid = null;
    this.lastHwidReset = new Date();
    
    if (!adminOverride) {
      this.hwidResetCount += 1;
    }
    
    await this.save();
    return {
      success: true,
      oldHwid,
      resetsRemaining: this.maxHwidResets - this.hwidResetCount
    };
  }
  
  return {
    success: false,
    reason: this.hwidResetCount >= this.maxHwidResets 
      ? 'Maximum HWID resets reached' 
      : 'Reset cooldown period not elapsed'
  };
};

// Log an authentication attempt
licenseSchema.methods.logAuth = async function(data) {
  // Create the auth log entry
  const logEntry = {
    timestamp: new Date(),
    successful: data.successful,
    ip: data.ip,
    hwid: data.hwid,
    userAgent: data.userAgent,
    location: data.location,
    reason: data.reason
  };
  
  // Add to auth logs, maintaining a maximum of 50 entries
  this.authLogs.unshift(logEntry);
  if (this.authLogs.length > 50) {
    this.authLogs = this.authLogs.slice(0, 50);
  }
  
  // Save if requested
  if (data.save) {
    await this.save();
  }
  
  return logEntry;
};

// Ban a license
licenseSchema.methods.ban = async function(reason) {
  this.isBanned = true;
  this.banReason = reason || 'Banned by administrator';
  await this.save();
  return this;
};

// Unban a license
licenseSchema.methods.unban = async function() {
  this.isBanned = false;
  this.banReason = null;
  await this.save();
  return this;
};

/**
 * Static Methods
 */
// Generate a new license key with customizable format
licenseSchema.statics.generateKey = function(format = 'HEX-XXXX-XXXX-XXXX-XXXX') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0/O and 1/I
  
  return format.replace(/X/g, () => {
    return chars.charAt(Math.floor(Math.random() * chars.length));
  });
};

// Find licenses expiring soon
licenseSchema.statics.findExpiringSoon = function(days = 7) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  return this.find({
    expiresAt: { $gt: now, $lt: future },
    isActive: true
  }).sort({ expiresAt: 1 });
};

// Create a batch of licenses
licenseSchema.statics.createBatch = async function(batchData) {
  const { 
    product, 
    productId,
    quantity = 1, 
    duration, 
    user,
    discordId,
    note
  } = batchData;
  
  const licenses = [];
  
  for (let i = 0; i < quantity; i++) {
    // Generate expiration date based on duration
    const expiresAt = duration 
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000) 
      : null;
    
    // Create license object
    const license = new this({
      key: this.generateKey(),
      product,
      productId,
      user,
      discordId,
      note,
      expiresAt
    });
    
    await license.save();
    licenses.push(license);
  }
  
  return licenses;
};

/**
 * Pre-save hook
 */
licenseSchema.pre('save', function(next) {
  // Force key to uppercase for consistency
  if (this.key) {
    this.key = this.key.toUpperCase();
  }
  
  // Update lastAccessedAt if not set and license is being activated
  if (this.hwid && !this.activatedAt) {
    this.activatedAt = new Date();
  }
  
  next();
});

/**
 * Create the model
 */
const License = mongoose.model('License', licenseSchema);

module.exports = License;
