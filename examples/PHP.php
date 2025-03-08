<?php
/**
 * Hex License PHP Client
 * Compatible with Hex Status 2.0 authentication system
 */

class HexLicenseClient {
    // Configuration
    private $apiUrl = 'https://api.hexrift.net/api';
    private $productId = 'Hex-Status-2.0';
    private $version = '2.0.0';
    private $licenseKey = '';
    private $cacheDir = '';
    private $cacheFile = '';
    private $hwid = '';
    private $licenseInfo = null;
    private $offlineMode = false;
    
    // Constants
    const OFFLINE_GRACE_DAYS = 7;
    const API_TIMEOUT = 10;
    
    public function __construct($options = []) {
        // Set options from parameters or use defaults
        $this->apiUrl = $options['apiUrl'] ?? $this->apiUrl;
        $this->productId = $options['productId'] ?? $this->productId;
        $this->version = $options['version'] ?? $this->version;
        $this->licenseKey = $options['licenseKey'] ?? $this->licenseKey;
        
        // Set up cache directory
        $this->cacheDir = $options['cacheDir'] ?? $_SERVER['HOME'] . '/.hexlicense';
        $this->cacheFile = $this->cacheDir . '/license.cache';
        
        // Create cache directory if it doesn't exist
        if (!file_exists($this->cacheDir)) {
            mkdir($this->cacheDir, 0700, true);
        }
        
        // Generate hardware ID
        $this->hwid = $this->generateHWID();
    }
    
    /**
     * Generate a hardware ID based on system information
     */
    private function generateHWID() {
        $systemInfo = [];
        
        // Get hostname
        $systemInfo[] = gethostname();
        
        // Get OS info
        $systemInfo[] = PHP_OS;
        
        // Get CPU info if available
        if (is_readable('/proc/cpuinfo')) {
            $cpuinfo = file_get_contents('/proc/cpuinfo');
            preg_match('/model name.*: (.*)/i', $cpuinfo, $matches);
            if (isset($matches[1])) {
                $systemInfo[] = trim($matches[1]);
            }
        }
        
        // Get MAC addresses
        $macAddresses = [];
        if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            // Windows
            ob_start();
            system('getmac');
            $macInfo = ob_get_clean();
            preg_match_all('/([0-9A-F]{2}-){5}[0-9A-F]{2}/i', $macInfo, $matches);
            if (!empty($matches[0])) {
                $macAddresses = $matches[0];
            }
        } else {
            // Linux/Mac
            $ifconfigOutput = shell_exec('/sbin/ifconfig -a || /usr/sbin/ifconfig -a');
            preg_match_all('/ether ([0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2})/i', $ifconfigOutput, $matches);
            if (!empty($matches[1])) {
                $macAddresses = $matches[1];
            }
        }
        
        // Add MAC addresses to system info
        if (!empty($macAddresses)) {
            $systemInfo[] = implode(',', $macAddresses);
        }
        
        // Get total memory
        if (is_readable('/proc/meminfo')) {
            $meminfo = file_get_contents('/proc/meminfo');
            preg_match('/MemTotal:\s+(\d+)/i', $meminfo, $matches);
            if (isset($matches[1])) {
                $systemInfo[] = trim($matches[1]);
            }
        }
        
        // Join all information and create hash
        $systemString = implode('|', array_filter($systemInfo));
        return hash('sha256', $systemString);
    }
    
    /**
     * Validate license with the API server
     */
    public function validate() {
        echo "Validating license with server...\n";
        
        if (empty($this->licenseKey)) {
            echo "Error: No license key provided\n";
            return false;
        }
        
        // Try to validate online
        try {
            $data = [
                'key' => $this->licenseKey,
                'hwid' => $this->hwid,
                'product' => $this->productId,
                'version' => $this->version,
                'machine' => [
                    'os' => PHP_OS,
                    'version' => php_uname('r'),
                    'arch' => php_uname('m'),
                    'hostname' => gethostname()
                ]
            ];
            
            $options = [
                'http' => [
                    'method' => 'POST',
                    'header' => [
                        'Content-Type: application/json',
                        'User-Agent: HexLicense-PHPClient/' . $this->version
                    ],
                    'content' => json_encode($data),
                    'timeout' => self::API_TIMEOUT
                ]
            ];
            
            $context = stream_context_create($options);
            $result = file_get_contents($this->apiUrl . '/verify', false, $context);
            
            if ($result === false) {
                throw new Exception("API request failed");
            }
            
            $response = json_decode($result, true);
            
            if (isset($response['valid']) && $response['valid']) {
                // License is valid
                $this->licenseInfo = [
                    'valid' => true,
                    'expiresAt' => $response['expiresAt'] ?? null,
                    'features' => $response['features'] ?? [],
                    'owner' => $response['owner'] ?? 'Unknown',
                    'validatedAt' => date('c'),
                    'offlineMode' => false
                ];
                
                // Save license info to cache
                $this->saveCache();
                
                echo "License validated successfully\n";
                return true;
            } else {
                // License is invalid
                $this->licenseInfo = [
                    'valid' => false,
                    'error' => $response['error'] ?? 'License validation failed'
                ];
                
                echo "License validation failed: " . $this->licenseInfo['error'] . "\n";
                return false;
            }
        } catch (Exception $e) {
            echo "License validation error: " . $e->getMessage() . "\n";
            
            // Try offline validation
            if ($this->validateOffline()) {
                echo "Using cached license in offline mode\n";
                return true;
            }
            
            return false;
        }
    }
    
    /**
     * Try to validate using cached license data
     */
    private function validateOffline() {
        try {
            if (!file_exists($this->cacheFile)) {
                return false;
            }
            
            // Read and decrypt cache file
            $data = file_get_contents($this->cacheFile);
            list($iv, $encryptedData) = explode(':', $data);
            
            $key = substr(hash('sha256', $this->hwid, true), 0, 32);
            $iv = hex2bin($iv);
            $decrypted = openssl_decrypt(
                hex2bin($encryptedData),
                'AES-256-CBC',
                $key,
                OPENSSL_RAW_DATA,
                $iv
            );
            
            if ($decrypted === false) {
                return false;
            }
            
            $cache = json_decode($decrypted, true);
            
            // Check if cache is valid
            if (!isset($cache['validatedAt']) || !isset($cache['expiresAt'])) {
                return false;
            }
            
            // Check cache expiration (7-day offline limit)
            $validatedAt = new DateTime($cache['validatedAt']);
            $offlineLimit = self::OFFLINE_GRACE_DAYS * 24 * 60 * 60;
            $offlineExpires = new DateTime('@' . ($validatedAt->getTimestamp() + $offlineLimit));
            
            if (new DateTime() > $offlineExpires) {
                echo "Offline validation period expired\n";
                return false;
            }
            
            // Check if license has expired
            if (new DateTime() > new DateTime($cache['expiresAt'])) {
                echo "Cached license has expired\n";
                return false;
            }
            
            // Set license info from cache
            $this->licenseInfo = $cache;
            $this->licenseInfo['offlineMode'] = true;
            
            return true;
        } catch (Exception $e) {
            echo "Offline validation error: " . $e->getMessage() . "\n";
            return false;
        }
    }
    
    /**
     * Save license information to encrypted cache
     */
    private function saveCache() {
        try {
            if (!$this->licenseInfo || !$this->licenseInfo['valid']) {
                return false;
            }
            
            // Encrypt the cache data
            $key = substr(hash('sha256', $this->hwid, true), 0, 32);
            $iv = openssl_random_pseudo_bytes(16);
            
            $encrypted = openssl_encrypt(
                json_encode($this->licenseInfo),
                'AES-256-CBC',
                $key,
                OPENSSL_RAW_DATA,
                $iv
            );
            
            // Store IV with encrypted data
            $encryptedData = bin2hex($iv) . ':' . bin2hex($encrypted);
            
            file_put_contents($this->cacheFile, $encryptedData);
            chmod($this->cacheFile, 0600); // Only owner can read/write
            
            return true;
        } catch (Exception $e) {
            echo "Failed to save license cache: " . $e->getMessage() . "\n";
            return false;
        }
    }
    
    /**
     * Display license information
     */
    public function displayLicenseInfo() {
        if (!$this->licenseInfo) {
            echo "No license information available\n";
            return;
        }
        
        echo "\n=== LICENSE INFORMATION ===\n";
        
        if ($this->licenseInfo['valid']) {
            echo "Status: Valid\n";
            echo "Product: {$this->productId}\n";
            echo "Owner: " . ($this->licenseInfo['owner'] ?? 'Unknown') . "\n";
            
            if (isset($this->licenseInfo['expiresAt'])) {
                $expiryDate = new DateTime($this->licenseInfo['expiresAt']);
                $now = new DateTime();
                $daysLeft = $now->diff($expiryDate)->days;
                echo "Expires: " . $expiryDate->format('Y-m-d') . " ({$daysLeft} days left)\n";
            } else {
                echo "Expires: Never\n";
            }
            
            if (!empty($this->licenseInfo['features'])) {
                echo "Features:\n";
                foreach ($this->licenseInfo['features'] as $feature) {
                    echo "  - {$feature}\n";
                }
            }
            
            if ($this->licenseInfo['offlineMode']) {
                echo "Mode: Offline (Limited functionality)\n";
            }
        } else {
            echo "Status: Invalid\n";
            echo "Error: " . ($this->licenseInfo['error'] ?? 'Unknown error') . "\n";
        }
        
        echo "===========================\n\n";
    }
    
    /**
     * Check if license is valid
     */
    public function isValid() {
        return $this->licenseInfo && $this->licenseInfo['valid'];
    }
    
    /**
     * Check if running in offline mode
     */
    public function isOfflineMode() {
        return $this->licenseInfo && $this->licenseInfo['offlineMode'];
    }
    
    /**
     * Check if a specific feature is available
     */
    public function hasFeature($featureName) {
        if (!$this->licenseInfo || !$this->licenseInfo['valid']) {
            return false;
        }
        
        return isset($this->licenseInfo['features']) && 
               in_array($featureName, $this->licenseInfo['features']);
    }
}

// Example usage
/*
$client = new HexLicenseClient([
    'licenseKey' => 'YOUR-LICENSE-KEY-HERE'
]);

if ($client->validate()) {
    $client->displayLicenseInfo();
    // Start your application here
} else {
    echo "License validation failed! Application will exit.\n";
    exit(1);
}
*/
?>
