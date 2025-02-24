const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'Active', enum: ['Active', 'Expired', 'Revoked'] },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model('License', licenseSchema);
