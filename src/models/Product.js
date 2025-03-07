/**
 * Product Model
 * Represents a product that can have licenses issued for it
 * 
 * @module models/Product
 */

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Version Schema - Tracks product versions and updates
 */
const versionSchema = new Schema({
  number: { 
    type: String, 
    required: true,
    trim: true
  },
  releaseDate: { 
    type: Date, 
    default: Date.now 
  },
  notes: { 
    type: String,
    trim: true
  },
  isPublic: { 
    type: Boolean, 
    default: true 
  },
  downloadUrl: { 
    type: String,
    trim: true
  },
  fileSize: {
    type: Number, // in bytes
    min: 0
  }
}, { _id: false });

/**
 * Product Schema Definition
 */
const productSchema = new Schema({
  // Basic product information
  name: { 
    type: String, 
    required: [true, 'Product name is required'],
    unique: true,
    trim: true,
    index: true
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot be longer than 1000 characters']
  },
  shortDescription: {
    type: String,
    trim: true,
    maxlength: [200, 'Short description cannot be longer than 200 characters']
  },
  
  // Display properties
  displayImage: {
    type: String,
    trim: true
  },
  icon: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#6366f1', // Default color (accent from your CSS)
    trim: true,
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: props => `${props.value} is not a valid hex color!`
    }
  },
  
  // Status and visibility
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isPublic: {
    type: Boolean,
    default: true,
    index: true
  },
  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Product categorization 
  category: {
    type: String,
    trim: true,
    index: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  // Commercial information
  price: {
    type: Number,
    min: [0, 'Price cannot be negative'],
    default: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']
  },
  trial: {
    available: {
      type: Boolean,
      default: false
    },
    durationDays: {
      type: Number,
      min: [1, 'Trial duration must be at least 1 day'],
      default: 7
    }
  },
  
  // License options
  licenseOptions: {
    allowHwidReset: {
      type: Boolean,
      default: true
    },
    maxHwidResets: {
      type: Number,
      min: [0, 'Max HWID resets cannot be negative'],
      default: 3
    },
    resetCooldownHours: {
      type: Number,
      min: [0, 'Reset cooldown cannot be negative'],
      default: 24
    },
    ipRestriction: {
      type: Boolean,
      default: false
    }
  },
  
  // Support information
  supportEmail: {
    type: String,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
  },
  supportUrl: {
    type: String,
    trim: true
  },
  documentationUrl: {
    type: String,
    trim: true
  },
  
  // Version tracking
  currentVersion: {
    type: String,
    trim: true
  },
  versions: [versionSchema],
  
  // Developer/Publisher information
  developer: {
    name: {
      type: String,
      trim: true
    },
    website: {
      type: String,
      trim: true
    },
    contactEmail: {
      type: String,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address']
    }
  },
  
  // File and download info
  downloads: {
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    fileSize: {
      type: Number, // in bytes
      min: 0
    },
    filePath: {
      type: String,
      trim: true
    }
  },
  
  // Requirements
  systemRequirements: {
    os: [String],
    processor: String,
    memory: String,
    graphics: String,
    storage: String,
    additional: String
  },
  
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
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
// Text indexes for search
productSchema.index({ 
  name: 'text', 
  description: 'text', 
  shortDescription: 'text',
  tags: 'text' 
}, {
  weights: {
    name: 10,
    shortDescription: 5,
    tags: 3,
    description: 1
  }
});

/**
 * Virtual Properties
 */
// Get active license count (virtual relation to License model)
productSchema.virtual('licenseCount', {
  ref: 'License',
  localField: 'name',
  foreignField: 'product',
  count: true
});

// Get active license count
productSchema.virtual('activeLicenseCount', {
  ref: 'License',
  localField: 'name',
  foreignField: 'product',
  count: true,
  match: { isActive: true }
});

/**
 * Methods
 */
// Add a new version
productSchema.methods.addVersion = async function(versionData) {
  this.versions.unshift(versionData);
  
  // Update current version if this is public
  if (versionData.isPublic) {
    this.currentVersion = versionData.number;
  }
  
  await this.save();
  return this;
};

// Get version history, optionally filtered by public status
productSchema.methods.getVersionHistory = function(publicOnly = false) {
  if (publicOnly) {
    return this.versions.filter(v => v.isPublic);
  }
  return this.versions;
};

// Increment download count
productSchema.methods.incrementDownloads = async function() {
  this.downloads.count += 1;
  await this.save();
  return this.downloads.count;
};

/**
 * Static Methods
 */
// Find featured products
productSchema.statics.findFeatured = function() {
  return this.find({ 
    isActive: true,
    isPublic: true,
    isFeatured: true 
  }).sort({ createdAt: -1 });
};

// Find products by category
productSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category, 
    isActive: true,
    isPublic: true 
  }).sort({ name: 1 });
};

// Search products
productSchema.statics.search = function(query) {
  return this.find(
    { 
      $text: { $search: query },
      isActive: true,
      isPublic: true
    },
    { score: { $meta: "textScore" } }
  ).sort({ score: { $meta: "textScore" } });
};

/**
 * Pre-save hooks
 */
productSchema.pre('save', function(next) {
  // Generate slug from name if not provided
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  next();
});

/**
 * Create the model
 */
const Product = mongoose.model('Product', productSchema);

module.exports = Product;
