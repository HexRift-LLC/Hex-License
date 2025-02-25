const mongoose = require('mongoose');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const config = yaml.load(fs.readFileSync(path.join(__dirname, 'config.yml'), 'utf8'));

const connectDB = async () => {
    try {
        await mongoose.connect(config.database.uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

module.exports = connectDB;
