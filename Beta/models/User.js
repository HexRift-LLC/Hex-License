const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String },
    discriminator: { type: String },
    avatarURL: {
        type: String,
        get: function() {
            if (!this.avatar) {
                return `https://cdn.discordapp.com/embed/avatars/0.png`;
            }
            return `https://cdn.discordapp.com/avatars/${this.discordId}/${this.avatar}.png?size=128`;
        }
    },
    role: { type: String, default: 'User', enum: ['Owner', 'Admin', 'User'] },
    joinDate: { type: Date, default: Date.now },
    status: { type: String, default: 'Active', enum: ['Active', 'Banned'] }
});

userSchema.set('toJSON', { getters: true });
userSchema.set('toObject', { getters: true });

module.exports = mongoose.model('User', userSchema);