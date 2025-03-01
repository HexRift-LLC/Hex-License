const axios = require('axios');
const colors = require('colors');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');


class LicenseChecker {
    #currentVersion = '4.0.0';
    #baseUrl = 'https://dash.hexarion.net/api';
    #hwid;

    constructor() {
        this.#hwid = this.generateHWID();
    }

    generateHWID() {
        const systemInfo = [
            os.hostname(),
            os.platform(),
            os.arch(),
            os.cpus()[0].model,
            os.totalmem()
        ].join('');
        
        return crypto
            .createHash('sha256')
            .update(systemInfo)
            .digest('hex');
    }

    async validateLicense() {
        try {
            const configPath = path.join(__dirname, '../config/config.yml');
            const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
            const key = config.auth.key;
    
            if (!key) {
                console.log('[AUTH]'.brightRed, 'No license key found in config');
                process.exit(1);
            }
    
            const response = await axios.post(`${this.#baseUrl}/verify`, {
                key,
                hwid: this.#hwid,
                product: 'Hex-License'
            });
    
            if (response.data?.valid) {
                console.log('[AUTH]'.green, 'License validated successfully');
                return true;
            } else {
                const errorMessage = response.data?.error || 'License validation failed';
                console.log('[AUTH]'.brightRed, 'Authentication failed:', errorMessage);
                process.exit(1);
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error || 
                               error.response?.data?.details || 
                               error.message || 
                               'Connection error with license server';
            console.log('[AUTH]'.brightRed, 'Authentication error:', errorMessage);
            process.exit(1);
        }
    }
}

async function Auth() {
    const licenseChecker = new LicenseChecker();
    return await licenseChecker.validateLicense();
}

module.exports = { Auth };
