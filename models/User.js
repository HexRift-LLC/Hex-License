const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String },
    role: { type: String, default: 'User', enum: ['Owner', 'Admin', 'User'] },
    joinDate: { type: Date, default: Date.now },
    status: { type: String, default: 'Active', enum: ['Active', 'Banned'] }
});

module.exports = mongoose.model('User', userSchema);
