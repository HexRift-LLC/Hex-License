const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    username: String,
    avatar: String,
    isStaff: {
        type: Boolean,
        default: false
    },
    licenses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'License'
    }]
});

module.exports = mongoose.model('User', UserSchema);
