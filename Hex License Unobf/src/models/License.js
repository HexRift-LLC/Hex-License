const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    product: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    hwid: { type: String },
    createdAt: { type: Date, default: Date.now },
    authLogs: { type: [Object], default: [] },
    lastHwidReset: { type: Date }
});

module.exports = mongoose.model('License', licenseSchema);
