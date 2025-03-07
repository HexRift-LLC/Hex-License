/**
 * User Model
 * Represents a user account with Discord integration and license management
 * 
 * @module models/User
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

/**
 * Activity Log Schema - Tracks user activities and logins
 */
const activityLogSchema = new Schema({
  type: { 
    type: String, 
    enum: ['login', 'license_added', 'license_removed', 'profile_updated', 'admin_action', 'other'],
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  ip: String,
  userAgent: String,
  details: Schema.Types.Mixed,
  location: String
}, { _id: false });

/**
 * Notification Schema - For user notifications
 */
const notificationSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'error', 'success'],
    default: 'info'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  link: String,
  icon: String
});

/**
 * User Schema Definition
 */
const userSchema = new Schema({
  // Discord integration
  discordId: {
    type: String,
    required: [true, 'Discord ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  username: {
    type: String,
    trim: true,
    index: true
  },
  discriminator: {
    type: String,
    trim: true
  },
  avatar: String,
  
  // Discord details
  bannerColor: String,
  bannerUrl: String,
  locale: String,
  
  // Status flags
  isBanned: {
    type: Boolean,
    default: false,
    index: true
  },
  banReason: {
    type: String,
    trim: true
  },
  banExpires: {
    type: Date
  },
  isStaff: {
    type: Boolean,
    default: false,
    index: true
  },
  staffLevel: {
    type: String,
    enum: ['admin', 'moderator', 'support', 'viewer'],
    default: 'support'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Personal info (optional)
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address'],
    sparse: true // Allows null/undefined but enforces uniqueness when present
  },
  displayName: {
    type: String,
    trim: true
  },
  
  // Contact & social
  websiteUrl: {
    type: String,
    trim: true
  },
  socialLinks: {
    twitter: String,
    github: String,
    youtube: String,
    twitch: String,
    instagram: String
  },
  
  // License management
  licenses: [{
    type: Schema.Types.ObjectId,
    ref: 'License',
    index: true
  }],
  
  // User preferences
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    discordNotifications: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    }
  },
  
  // Security
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String
  },
  securityKey: {
    type: String,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  // API access
  apiKey: {
    key: String,
    createdAt: Date,
    lastUsed: Date,
    permissions: [String]
  },
  
  // User activity
  lastLogin: {
    type: Date
  },
  activityLogs: {
    type: [activityLogSchema],
    default: []
  },
  loginCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Notifications
  notifications: {
    type: [notificationSchema],
    default: []
  },
  
  // Additional info
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot be longer than 1000 characters']
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Registration info
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  
  // Custom fields
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
// Index for username searches
userSchema.index({ username: 'text' });
// Compound index for staff filtering
userSchema.index({ isStaff: 1, staffLevel: 1 });

/**
 * Virtual Properties
 */
// Virtual for full Discord username (username#discriminator)
userSchema.virtual('fullUsername').get(function() {
  if (!this.discriminator || this.discriminator === '0') {
    return this.username;
  }
  return `${this.username}#${this.discriminator}`;
});

// Virtual for avatar URL
userSchema.virtual('avatarUrl').get(function() {
  if (!this.avatar) {
    return 'https://cdn.discordapp.com/embed/avatars/0.png'; // Default Discord avatar
  }
  
  const isGif = this.avatar.startsWith('a_');
  const extension = isGif ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${this.discordId}/${this.avatar}.${extension}?size=256`;
});

// Get active licenses count
userSchema.virtual('activeLicenseCount').get(function() {
  if (!this._activeLicenseCount) return null; // Return null when not populated
  return this._activeLicenseCount;
});

/**
 * Methods
 */
// Log user activity
userSchema.methods.logActivity = async function(activityData) {
  // Create activity log entry
  const logEntry = {
    type: activityData.type,
    timestamp: new Date(),
    ip: activityData.ip,
    userAgent: activityData.userAgent,
    details: activityData.details,
    location: activityData.location
  };
  
  // Add to activity logs, maintaining a maximum of 100 entries
  this.activityLogs.unshift(logEntry);
  if (this.activityLogs.length > 100) {
    this.activityLogs = this.activityLogs.slice(0, 100);
  }
  
  // Update login stats if this is a login
  if (activityData.type === 'login') {
    this.lastLogin = new Date();
    this.loginCount += 1;
  }
  
  // Save if requested
  if (activityData.save) {
    await this.save();
  }
  
  return logEntry;
};

// Add notification
userSchema.methods.addNotification = async function(notificationData) {
  const notification = {
    title: notificationData.title,
    message: notificationData.message,
    type: notificationData.type || 'info',
    createdAt: new Date(),
    isRead: false,
    link: notificationData.link,
    icon: notificationData.icon
  };
  
  this.notifications.unshift(notification);
  
  // Keep a maximum of 50 notifications
  if (this.notifications.length > 50) {
    this.notifications = this.notifications.slice(0, 50);
  }
  
  if (notificationData.save) {
    await this.save();
  }
  
  return notification;
};

// Mark notification as read
userSchema.methods.markNotificationRead = async function(notificationId) {
  const notification = this.notifications.id(notificationId);
  if (notification) {
    notification.isRead = true;
    await this.save();
    return true;
  }
  return false;
};

// Clear read notifications
userSchema.methods.clearReadNotifications = async function() {
  this.notifications = this.notifications.filter(n => !n.isRead);
  await this.save();
  return this.notifications;
};

// Ban user
userSchema.methods.ban = async function(reason, expiration = null) {
  this.isBanned = true;
  this.banReason = reason || 'Banned by administrator';
  
  if (expiration) {
    this.banExpires = expiration;
  } else {
    this.banExpires = null; // Permanent ban
  }
  
  await this.save();
  return this;
};

// Unban user
userSchema.methods.unban = async function() {
  this.isBanned = false;
  this.banReason = null;
  this.banExpires = null;
  
  await this.save();
  return this;
};

// Generate new API key
userSchema.methods.generateApiKey = async function(permissions = ['read']) {
  this.apiKey = {
    key: `hxl_${crypto.randomBytes(32).toString('hex')}`,
    createdAt: new Date(),
    lastUsed: null,
    permissions
  };
  
  await this.save();
  return this.apiKey.key;
};

// Revoke API key
userSchema.methods.revokeApiKey = async function() {
  this.apiKey = null;
  await this.save();
  return true;
};

// Update Discord profile information
userSchema.methods.updateDiscordInfo = async function(discordData) {
  const hasChanged = 
    this.username !== discordData.username ||
    this.discriminator !== discordData.discriminator ||
    this.avatar !== discordData.avatar;
  
  if (hasChanged) {
    this.username = discordData.username;
    this.discriminator = discordData.discriminator || '0';
    this.avatar = discordData.avatar;
    
    // Optionally update other Discord fields if provided
    if (discordData.locale) this.locale = discordData.locale;
    if (discordData.banner) this.bannerUrl = discordData.banner;
    if (discordData.banner_color) this.bannerColor = discordData.banner_color;
    
    await this.save();
    return true;
  }
  
  return false;
};

/**
 * Static Methods
 */
// Find staff members
userSchema.statics.findStaff = function(level = null) {
  const query = { isStaff: true };
  if (level) {
    query.staffLevel = level;
  }
  
  return this.find(query).sort({ username: 1 });
};

// Find users by license
userSchema.statics.findByLicense = function(licenseId) {
  return this.find({ 
    licenses: licenseId 
  });
};

// Find with active license count
userSchema.statics.findWithLicenseCounts = async function() {
  const License = mongoose.model('License');
  const users = await this.find();
  
  // Get all active licenses for these users
  const licenseAggs = await License.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$user', count: { $sum: 1 } } }
  ]);
  
  // Create a map of user IDs to license counts
  const licenseCounts = new Map();
  for (const agg of licenseAggs) {
    if (agg._id) {
      licenseCounts.set(agg._id.toString(), agg.count);
    }
  }
  
  // Add the counts to the user objects
  for (const user of users) {
    user._activeLicenseCount = licenseCounts.get(user._id.toString()) || 0;
  }
  
  return users;
};

/**
 * Pre-save hooks
 */
userSchema.pre('save', function(next) {
  // If displayName is not set, use the username
  if (!this.displayName && this.username) {
    this.displayName = this.username;
  }
  
  // Check if ban has expired
  if (this.isBanned && this.banExpires && this.banExpires < new Date()) {
    this.isBanned = false;
    this.banReason = null;
    this.banExpires = null;
  }
  
  next();
});

/**
 * Create the model
 */
const User = mongoose.model('User', userSchema);

module.exports = User;
