/**
 * Hex License Node.js Client Example
 * Demonstrates a complete Node.js application integrating with Hex License v7.0.0
 */

const axios = require('axios');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { version } = require("../package.json");

class AuthenticationManager {
  constructor(options = {}) {
    // Load config here to avoid circular dependency
    const config = yaml.load(fs.readFileSync('./config/config.yml', 'utf8'));
    
    this.apiUrl = options.apiUrl || 'https://api.hexrift.net/api';
    this.productId = options.productId || 'Hex-Status-2.0';
    this.version = options.version || version;
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
      console.error('HWID generation error:', error);
      // Fallback to basic system info with timestamp
      return crypto.createHash('sha256')
        .update(`${os.hostname()}-${os.platform()}-${Date.now()}`)
        .digest('hex');
    }
  }
  
  /**
   * Validate license with the API server - renamed to match app.js expectations
   */
  async validate() {
    try {
      console.log('Validating license with server...');
      
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
      
      // Check if validation was successful
      if (response.data.valid) {
        this.licenseInfo = {
          valid: true,
          expiresAt: response.data.expiresAt,
          features: response.data.features || [],
          owner: response.data.owner || 'Unknown',
          validatedAt: new Date().toISOString(),
          offlineMode: false
        };
        
        // Save license info to cache
        this.saveCache();
        
        console.log('License validated successfully');
        return true;
      } else {
        // License is invalid
        this.licenseInfo = {
          valid: false,
          error: response.data.error || 'License validation failed'
        };
        console.error('License validation failed:', this.licenseInfo.error);
        return false;
      }
    } catch (error) {
      console.error('License validation error:', error.message);
      
      // Try offline validation
      if (await this.validateOffline()) {
        console.log('Using cached license in offline mode');
        return true;
      }
      
      this.licenseInfo = {
        valid: false,
        error: `Validation error: ${error.message}`
      };
      
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
        console.log('Offline validation period expired');
        return false;
      }
      
      // Check if license has expired
      if (new Date() > new Date(cache.expiresAt)) {
        console.log('Cached license has expired');
        return false;
      }
      
      // Set license info from cache
      this.licenseInfo = {
        ...cache,
        offlineMode: true
      };
      
      return true;
    } catch (error) {
      console.error('Offline validation error:', error.message);
      return false;
    }
  }
  
  /**
   * Save license information to encrypted cache
   */
  saveCache() {
    try {
      if (!this.licenseInfo || !this.licenseInfo.valid) {
        return false;
      }
      
      // Encrypt the cache data
      const key = crypto.createHash('sha256').update(this.hwid).digest().slice(0, 32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      
      let encrypted = cipher.update(JSON.stringify(this.licenseInfo), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Store IV with encrypted data
      const encryptedData = `${iv.toString('hex')}:${encrypted}`;
      
      fs.writeFileSync(this.cacheFile, encryptedData, 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to save license cache:', error);
      return false;
    }
  }
  
  /**
   * Print license information to console
   */
  displayLicenseInfo() {
    if (!this.licenseInfo) {
      console.log('No license information available');
      return;
    }
    
    console.log('\n=== LICENSE INFORMATION ===');
    
    if (this.licenseInfo.valid) {
      console.log('Status: Valid');
      console.log(`Product: ${this.productId}`);
      console.log(`Owner: ${this.licenseInfo.owner || 'Unknown'}`);
      
      if (this.licenseInfo.expiresAt) {
        const expiryDate = new Date(this.licenseInfo.expiresAt);
        const daysLeft = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`Expires: ${expiryDate.toLocaleDateString()} (${daysLeft} days left)`);
      } else {
        console.log('Expires: Never');
      }
      
      if (this.licenseInfo.features && this.licenseInfo.features.length > 0) {
        console.log('Features:');
        this.licenseInfo.features.forEach(feature => {
          console.log(`  - ${feature}`);
        });
      }
      
      if (this.licenseInfo.offlineMode) {
        console.log('Mode: Offline (Limited functionality)');
      }
    } else {
      console.log('Status: Invalid');
      console.log(`Error: ${this.licenseInfo.error || 'Unknown error'}`);
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
  
  /**
   * Run system diagnostics for troubleshooting
   */
  async runDiagnostics() {
    console.log('\n=== DIAGNOSTICS ===');
    
    console.log('System Information:');
    console.log(`  Platform: ${os.platform()} ${os.release()}`);
    console.log(`  Architecture: ${os.arch()}`);
    console.log(`  CPU: ${os.cpus()[0]?.model || 'Unknown'} (${os.cpus().length} cores)`);
    console.log(`  Memory: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
    console.log(`  Hostname: ${os.hostname()}`);
    console.log(`  HWID: ${this.hwid.substring(0, 16)}...`);
    
    console.log('License Information:');
    console.log(`  Product: ${this.productId}`);
    console.log(`  License Key: ${this.licenseKey ? '***' + this.licenseKey.slice(-4) : 'Not set'}`);
    console.log(`  Valid: ${this.isValid() ? 'Yes' : 'No'}`);
    console.log(`  Offline Mode: ${this.isOfflineMode() ? 'Yes' : 'No'}`);
    
    console.log('Cache:');
    console.log(`  Cache Directory: ${this.cacheDir}`);
    console.log(`  Cache File Exists: ${fs.existsSync(this.cacheFile) ? 'Yes' : 'No'}`);
    
    try {
      // Test API connection
      console.log('Connectivity:');
      console.log('  Testing API connection...');
      
      try {
        await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
        console.log('  API Connection: Success');
      } catch (error) {
        console.log('  API Connection: Failed');
        console.log(`  Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Diagnostics error:', error);
    }
    
    console.log('===================\n');
  }
}

// Export the AuthenticationManager class for use in app.js
module.exports = AuthenticationManager;
