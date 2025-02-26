const axios = require('axios');
const { EmbedBuilder, WebhookClient } = require('discord.js');
const colors = require('colors');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class WebhookManager {
    static #instance;
    #webhook;
    #embedDefaults;

    constructor() {
        const webhookUrl = 'https://discord.com/api/webhooks/1323946852097458196/Rt13PpQ0YFRZhJhTFlZ_7uKeHjiK1Tfgd6R3kMqpdHh86tOGXoBP4wSHqVYMpWUVCiJV';
        this.#webhook = new WebhookClient({ url: webhookUrl });
        this.#embedDefaults = {
            thumbnail: 'https://hexarion.net/Hex-License.png',
            footer: {
                text: '© 2023 - 2025 Hexarion',
                iconURL: 'https://hexarion.net/Hex-License.png',
            }
        };
    }

    static getInstance() {
        if (!WebhookManager.#instance) {
            WebhookManager.#instance = new WebhookManager();
        }
        return WebhookManager.#instance;
    }

    async sendLog(status, color, fields, options = {}) {
        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setThumbnail(this.#embedDefaults.thumbnail)
                .setFooter(this.#embedDefaults.footer)
                .setTimestamp();

            if (options.title) embed.setTitle(options.title);
            if (options.description) embed.setDescription(options.description);
            if (fields?.length) embed.addFields(fields);

            await this.#webhook.send({ embeds: [embed] });
            return true;
        } catch (error) {
            console.error('[WEBHOOK]'.brightRed, 'Failed to send webhook:', error);
            return false;
        }
    }
}

class LicenseChecker {
    #webhookManager;
    #currentVersion = '2.2.2';
    #baseUrl = 'https://api.hexarion.net/api';
    #hwid;

    constructor() {
        this.#webhookManager = WebhookManager.getInstance();
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
            const configPath = path.join(__dirname, '../../config/config.yml');
            const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
            const key = config.auth.key;
    
            if (!key) {
                console.log('[AUTH]'.brightRed, 'No license key found in config');
                return false;
            }
    
            const response = await axios.post(`${this.#baseUrl}/verify`, {
                key,
                hwid: this.#hwid,
                product: 'Hex-License'
            });
    
            if (response.data?.valid) {
                console.log('[AUTH]'.green, 'License validated successfully');
                await this.#handleSuccessfulAuth('License validated successfully');
                return true;
            } else {
                const errorMessage = response.data?.error || 'License validation failed';
                console.log('[AUTH]'.brightRed, 'Authentication failed:', errorMessage);
                await this.#handleFailedAuth(errorMessage);
                return false;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error || 
                                 error.response?.data?.details || 
                                 error.message || 
                                 'Connection error with license server';
            console.log('[AUTH]'.brightRed, 'Authentication error:', errorMessage);
            await this.#handleAuthError(errorMessage);
            return false;
        }
    }
    
    
    
    async #handleSuccessfulAuth(details) {
        await this.#webhookManager.sendLog(
            'Authorization Successful',
            '#00FF00',
            [{
                name: 'Status',
                value: 'Successful',
                inline: true
            },
            {
                name: 'Product',
                value: 'Hex License',
                inline: true
            },
            {
                name: 'Version',
                value: this.#currentVersion,
                inline: true
            },
            {
                name: 'HWID',
                value: this.#hwid,
                inline: true
            }], {
                title: 'Authentication Success',
                description: 'Hex License successfully authenticated'
            }
        );
    }

    async #handleFailedAuth(reason) {
        await this.#webhookManager.sendLog(
            'Authorization Failed',
            '#FF0000',
            [{
                name: 'Status',
                value: 'Failed',
                inline: true
            },
            {
                name: 'Product',
                value: 'Hex License',
                inline: true
            },
            {
                name: 'Version',
                value: this.#currentVersion || 'Unknown',
                inline: true
            },
            {
                name: 'HWID',
                value: this.#hwid || 'Unknown',
                inline: true
            },
            {
                name: 'Reason',
                value: reason || 'Unknown error occurred',
                inline: true
            }], {
                title: 'Authentication Failure',
                description: 'Hex License authentication failed'
            }
        );
    }
    

    async #handleAuthError(error) {
        await this.#webhookManager.sendLog(
            'Authorization Error',
            '#FF0000',
            [{
                name: 'Status',
                value: 'Error',
                inline: true
            },
            {
                name: 'Product',
                value: 'Hex License',
                inline: true
            },
            {
                name: 'Version',
                value: this.#currentVersion,
                inline: true
            },
            {
                name: 'HWID',
                value: this.#hwid,
                inline: true
            },
            {
                name: 'Error Details',
                value: error,
                inline: true
            }], {
                title: 'Authentication Error',
                description: 'An error occurred during authentication'
            }
        );
    }
}

async function Auth(callback) {
    const licenseChecker = new LicenseChecker();
    const isValid = await licenseChecker.validateLicense();
    if (isValid && callback) {
        callback();
    }
    return isValid;
}

module.exports = { Auth };
