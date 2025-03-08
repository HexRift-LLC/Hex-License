const axios = require('axios');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const chalk = require("chalk");

class AuthenticationManager {
  constructor(options = {}) {
    // Load config lazily to avoid circular dependency
    let config = {};
    try {
      if (fs.existsSync('./config/config.yml')) {
        const yaml = require('js-yaml');
        config = yaml.load(fs.readFileSync('./config/config.yml', 'utf8'));
      }
    } catch (err) {
      console.error(chalk.red("[Auth]"), 'Config loading error:', err.message);
    }

    this.apiUrl = options.apiUrl || 'https://api.hexrift.net/api';
    this.productId = options.productId || 'Hex-License';
    this.version = options.version || require('../../package.json').version;
    this.licenseKey = options.licenseKey || (config.auth && config.auth.key);
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.hexlicense');
    this.cacheFile = path.join(this.cacheDir, 'license.cache');
    this.hwid = this.generateHWID();
    this.licenseInfo = null;
    this.offlineMode = false;

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate hardware ID based on system information
   */
  generateHWID() {
    try {
      const cpus = os.cpus();
      const networkInterfaces = os.networkInterfaces();

      // Get MAC addresses from non-internal interfaces
      let macAddresses = [];
      Object.values(networkInterfaces).forEach(interfaces => {
        interfaces.forEach(iface => {
          if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
            macAddresses.push(iface.mac);
          }
        });
      });

      // Collect system information
      const systemInfo = [
        os.hostname(),
        os.platform(),
        os.release(),
        cpus.length > 0 ? cpus[0].model : '',
        os.totalmem().toString(),
        macAddresses.join(','),
        os.userInfo().username
      ].filter(Boolean).join('|');

      return crypto.createHash('sha256').update(systemInfo).digest('hex');
    } catch (error) {
      console.error(chalk.red("[Auth]"), 'HWID generation error:', error);
      // Fallback to basic system info with timestamp
      return crypto.createHash('sha256')
        .update(`${os.hostname()}-${os.platform()}-${Date.now()}`)
        .digest('hex');
    }
  }

  /**
   * Validate license with the API server
   */
  async validate() {
    console.log(chalk.cyan("[Auth]"), 'Validating license with server...');

    if (!this.licenseKey) {
      console.error(chalk.red("[Auth]"), 'Error: No license key provided');
      return false;
    }

    // Try to validate online
    try {
      const response = await axios.post(`${this.apiUrl}/verify`, {
        key: this.licenseKey,
        hwid: this.hwid,
        product: this.productId,
        version: this.version,
        machine: {
          os: os.platform(),
          version: os.release(),
          arch: os.arch(),
          hostname: os.hostname()
        }
      }, {
        headers: {
          'User-Agent': `HexLicense-NodeClient/${this.version}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      if (response.data && response.data.valid) {
        this.licenseInfo = {
          valid: true,
          expiresAt: response.data.expiresAt,
          features: response.data.features || [],
          owner: response.data.owner || 'Unknown',
          validatedAt: new Date().toISOString(),
        };

        // Save validated license to cache
        console.log(chalk.green("[Auth]"), 'License validated successfully');
        return true;
      } else {
        this.licenseInfo = {
          valid: false,
          error: response.data.error || "License validation failed"
        };
        console.error(chalk.red("[Auth]"), `License validation failed: ${this.licenseInfo.error}`);
        return false;
      }
    } catch (error) {
      // Change error message for 404 errors to "Unauthenticated user"
      if (error.response && error.response.status === 404) {
        console.error(chalk.red("[Auth]"), 'Unauthenticated user');

        this.licenseInfo = {
          valid: false,
          error: "Unauthenticated user"
        };
      } else {
        console.error(chalk.red("[Auth]"), `License validation error: ${error.message}`);

        this.licenseInfo = {
          valid: false,
          error: error.message
        };
      }

      // Don't attempt offline validation on startup
      return false;
    }
  }

  /**
   * Try to validate using cached license data
   */
  async validateOffline() {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return false;
      }

      // Read and decrypt cache file
      const data = fs.readFileSync(this.cacheFile, 'utf8');
      const [iv, encryptedData] = data.split(':');

      const key = crypto.createHash('sha256').update(this.hwid).digest().slice(0, 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const cache = JSON.parse(decrypted);

      // Check if cache is valid
      if (!cache.validatedAt || !cache.expiresAt) {
        return false;
      }

      // Check cache expiration (7-day offline limit)
      const validatedAt = new Date(cache.validatedAt);
      const offlineLimit = 7 * 24 * 60 * 60 * 1000; // 7 days
      const offlineExpires = new Date(validatedAt.getTime() + offlineLimit);

      if (new Date() > offlineExpires) {
        console.log(chalk.red("[Auth]"), 'Offline validation period expired');
        return false;
      }

      // Check if license has expired
      if (new Date() > new Date(cache.expiresAt)) {
        console.log(chalk.red("[Auth]"), 'Cached license has expired');
        return false;
      }

      // Set license info from cache
      this.licenseInfo = {
        ...cache,
        offlineMode: true
      };

      return true;
    } catch (error) {
      console.log(chalk.red("[Auth]"), 'Offline validation error:', error.message);
      return false;
    }
  }
  /**
   * Print license information to console
   */
  displayLicenseInfo() {
    if (!this.licenseInfo) {
      console.log(chalk.red("[Auth]"), 'No license information available');
      return;
    }

    console.log(chalk.cyan("[Auth]"), '\n=== LICENSE INFORMATION ===');

    if (this.licenseInfo.valid) {
      console.log(chalk.green("[Auth]"), 'Status: Valid');
      console.log(chalk.green("[Auth]"), `Product: ${this.productId}`);
      console.log(chalk.green("[Auth]"), `Owner: ${this.licenseInfo.owner || 'Unknown'}`);

      if (this.licenseInfo.expiresAt) {
        const expiryDate = new Date(this.licenseInfo.expiresAt);
        const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        console.log(chalk.green("[Auth]"), `Expires: ${expiryDate.toLocaleDateString()} (${daysLeft} days left)`);
      } else {
        console.log(chalk.green("[Auth]"), 'Expires: Never');
      }

      if (this.licenseInfo.features && this.licenseInfo.features.length > 0) {
        console.log(chalk.cyan("[Auth]"), 'Features:');
        this.licenseInfo.features.forEach(feature => {
          console.log(chalk.green("[Auth]"), `  - ${feature}`);
        });
      }

      if (this.licenseInfo.offlineMode) {
        console.log(chalk.red("[Auth]"), 'Mode: Offline (Limited functionality)');
      }
    } else {
      console.log(chalk.red("[Auth]"), 'Status: Invalid');
      console.log(chalk.red("[Auth]"), `Error: ${this.licenseInfo.error || 'Unknown error'}`);
    }

    console.log('===========================\n');
  }

  /**
   * Check if license is valid
   */
  isValid() {
    return this.licenseInfo && this.licenseInfo.valid;
  }

  /**
   * Check if running in offline mode
   */
  isOfflineMode() {
    return this.licenseInfo && this.licenseInfo.offlineMode;
  }
}

// Export the class directly without initializing
module.exports = AuthenticationManager;