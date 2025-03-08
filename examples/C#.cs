using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Tasks;

namespace HexLicense
{
    /// <summary>
    /// Hex License C# Client
    /// Compatible with Hex Status 2.0 authentication system
    /// </summary>
    public class LicenseClient
    {
        // Configuration
        private string ApiUrl { get; set; } = "https://api.hexrift.net/api";
        private string ProductId { get; set; } = "Hex-Status-2.0";
        private string Version { get; set; } = "2.0.0";
        private string LicenseKey { get; set; }
        private string CacheDir { get; set; }
        private string CacheFile { get; set; }
        private string Hwid { get; set; }
        private LicenseInfo LicenseInfo { get; set; }
        private bool OfflineMode { get; set; } = false;

        // Constants
        private const int OfflineGraceDays = 7;
        private const int ApiTimeoutSeconds = 10;

        public LicenseClient(Dictionary<string, string> options = null)
        {
            options = options ?? new Dictionary<string, string>();

            // Set options from parameters or use defaults
            if (options.ContainsKey("apiUrl")) ApiUrl = options["apiUrl"];
            if (options.ContainsKey("productId")) ProductId = options["productId"];
            if (options.ContainsKey("version")) Version = options["version"];
            if (options.ContainsKey("licenseKey")) LicenseKey = options["licenseKey"];

            // Set up cache directory
            CacheDir = options.ContainsKey("cacheDir") 
                ? options["cacheDir"] 
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".hexlicense");
            CacheFile = Path.Combine(CacheDir, "license.cache");

            // Create cache directory if it doesn't exist
            if (!Directory.Exists(CacheDir))
            {
                Directory.CreateDirectory(CacheDir);
            }

            // Generate hardware ID
            Hwid = GenerateHwid();
        }

        /// <summary>
        /// Generate a hardware ID based on system information
        /// </summary>
        private string GenerateHwid()
        {
            var systemInfo = new List<string>();

            // Get hostname
            systemInfo.Add(Environment.MachineName);

            // Get OS info
            systemInfo.Add(Environment.OSVersion.ToString());

            // Get processor info
            systemInfo.Add(Environment.ProcessorCount.ToString());

            // Get MAC addresses
            var macAddresses = new List<string>();
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus == OperationalStatus.Up && 
                    nic.NetworkInterfaceType != NetworkInterfaceType.Loopback)
                {
                    var mac = nic.GetPhysicalAddress().ToString();
                    if (!string.IsNullOrEmpty(mac) && mac != "000000000000")
                    {
                        macAddresses.Add(mac);
                    }
                }
            }
            systemInfo.Add(string.Join(",", macAddresses));

            // Get total memory
            systemInfo.Add(GC.GetGCMemoryInfo().TotalAvailableMemoryBytes.ToString());

            // Join all information and create hash
            var systemString = string.Join("|", systemInfo.Where(s => !string.IsNullOrEmpty(s)));
            using (var sha256 = SHA256.Create())
            {
                var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(systemString));
                return BitConverter.ToString(hashBytes).Replace("-", "").ToLower();
            }
        }

        /// <summary>
        /// Validate license with the API server
        /// </summary>
        public async Task<bool> ValidateAsync()
        {
            Console.WriteLine("Validating license with server...");

            if (string.IsNullOrEmpty(LicenseKey))
            {
                Console.WriteLine("Error: No license key provided");
                return false;
            }

            // Try to validate online
            try
            {
                using (var httpClient = new HttpClient())
                {
                    httpClient.Timeout = TimeSpan.FromSeconds(ApiTimeoutSeconds);
                    httpClient.DefaultRequestHeaders.Add("User-Agent", $"HexLicense-CSharpClient/{Version}");

                    var machineInfo = new
                    {
                        os = Environment.OSVersion.Platform.ToString(),
                        version = Environment.OSVersion.Version.ToString(),
                        arch = Environment.Is64BitOperatingSystem ? "x64" : "x86",
                        hostname = Environment.MachineName
                    };

                    var requestData = new
                    {
                        key = LicenseKey,
                        hwid = Hwid,
                        product = ProductId,
                        version = Version,
                        machine = machineInfo
                    };

                    var json = JsonSerializer.Serialize(requestData);
                    var content = new StringContent(json, Encoding.UTF8, "application/json");

                    var response = await httpClient.PostAsync($"{ApiUrl}/verify", content);
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var licenseResponse = JsonSerializer.Deserialize<LicenseResponse>(responseContent);

                    if (licenseResponse.Valid)
                    {
                        // License is valid
                        LicenseInfo = new LicenseInfo
                        {
                            Valid = true,
                            ExpiresAt = licenseResponse.ExpiresAt,
                            Features = licenseResponse.Features ?? new List<string>(),
                            Owner = licenseResponse.Owner ?? "Unknown",
                            ValidatedAt = DateTime.UtcNow.ToString("o"),
                            OfflineMode = false
                        };

                        // Save license info to cache
                        SaveCache();

                        Console.WriteLine("License validated successfully");
                        return true;
                    }
                    else
                    {
                        // License is invalid
                        LicenseInfo = new LicenseInfo
                        {
                            Valid = false,
                            Error = licenseResponse.Error ?? "License validation failed"
                        };

                        Console.WriteLine($"License validation failed: {LicenseInfo.Error}");
                        return false;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"License validation error: {ex.Message}");

                // Try offline validation
                if (await ValidateOfflineAsync())
                {
                    Console.WriteLine("Using cached license in offline mode");
                    return true;
                }

                return false;
            }
        }

        /// <summary>
        /// Try to validate using cached license data
        /// </summary>
        private async Task<bool> ValidateOfflineAsync()
        {
            try
            {
                if (!File.Exists(CacheFile))
                {
                    return false;
                }

                // Read and decrypt cache file
                var data = await File.ReadAllTextAsync(CacheFile);
                var parts = data.Split(':');
                if (parts.Length != 2)
                {
                    return false;
                }

                var iv = Convert.FromHexString(parts[0]);
                var encryptedData = Convert.FromHexString(parts[1]);

                using (var sha256 = SHA256.Create())
                {
                    var keyBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(Hwid));
                    var key = new byte[32]; // Use first 32 bytes for AES-256
                    Array.Copy(keyBytes, key, Math.Min(keyBytes.Length, 32));

                    using (var aes = Aes.Create())
                    {
                        aes.Key = key;
                        aes.IV = iv;
                        aes.Mode = CipherMode.CBC;
                        aes.Padding = PaddingMode.PKCS7;

                        using (var decryptor = aes.CreateDecryptor())
                        using (var ms = new MemoryStream(encryptedData))
                        using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read))
                        using (var reader = new StreamReader(cs))
                        {
                            var json = await reader.ReadToEndAsync();
                            var cache = JsonSerializer.Deserialize<LicenseInfo>(json);

                            // Check if cache is valid
                            if (string.IsNullOrEmpty(cache.ValidatedAt) || string.IsNullOrEmpty(cache.ExpiresAt))
                            {
                                return false;
                            }

                            // Check cache expiration (7-day offline limit)
                            var validatedAt = DateTime.Parse(cache.ValidatedAt);
                            var offlineExpires = validatedAt.AddDays(OfflineGraceDays);

                            if (DateTime.UtcNow > offlineExpires)
                            {
                                Console.WriteLine("Offline validation period expired");
                                return false;
                            }

                            // Check if license has expired
                            if (DateTime.UtcNow > DateTime.Parse(cache.ExpiresAt))
                            {
                                Console.WriteLine("Cached license has expired");
                                return false;
                            }

                            // Set license info from cache
                            LicenseInfo = cache;
                            LicenseInfo.OfflineMode = true;
                            OfflineMode = true;

                            return true;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Offline validation error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Save license information to encrypted cache
        /// </summary>
        private void SaveCache()
        {
            try
            {
                if (LicenseInfo == null || !LicenseInfo.Valid)
                {
                    return;
                }

                // Encrypt the cache data
                using (var sha256 = SHA256.Create())
                {
                    var keyBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(Hwid));
                    var key = new byte[32]; // Use first 32 bytes for AES-256
                    Array.Copy(keyBytes, key, Math.Min(keyBytes.Length, 32));

                    using (var aes = Aes.Create())
                    {
                        aes.Key = key;
                        aes.GenerateIV(); // Generate random IV
                        aes.Mode = CipherMode.CBC;
                        aes.Padding = PaddingMode.PKCS7;

                        var iv = aes.IV;
                        var json = JsonSerializer.Serialize(LicenseInfo);

                        using (var ms = new MemoryStream())
                        using (var encryptor = aes.CreateEncryptor())
                        using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
                        using (var writer = new StreamWriter(cs))
                        {
                            writer.Write(json);
                            writer.Flush();
                            cs.FlushFinalBlock();

                            var encryptedData = ms.ToArray();
                            var encryptedString = Convert.ToHexString(iv).ToLower() + ":" + 
                                                  Convert.ToHexString(encryptedData).ToLower();

                            File.WriteAllText(CacheFile, encryptedString);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to save license cache: {ex.Message}");
            }
        }

        /// <summary>
        /// Display license information
        /// </summary>
        public void DisplayLicenseInfo()
        {
            if (LicenseInfo == null)
            {
                Console.WriteLine("No license information available");
                return;
            }

            Console.WriteLine("\n=== LICENSE INFORMATION ===");

            if (LicenseInfo.Valid)
            {
                Console.WriteLine("Status: Valid");
                Console.WriteLine($"Product: {ProductId}");
                Console.WriteLine($"Owner: {LicenseInfo.Owner ?? "Unknown"}");

                if (!string.IsNullOrEmpty(LicenseInfo.ExpiresAt))
                {
                    var expiryDate = DateTime.Parse(LicenseInfo.ExpiresAt);
                    var daysLeft = (expiryDate - DateTime.UtcNow).Days;
                    Console.WriteLine($"Expires: {expiryDate:yyyy-MM-dd} ({daysLeft} days left)");
                }
                else
                {
                    Console.WriteLine("Expires: Never");
                }

                if (LicenseInfo.Features != null && LicenseInfo.Features.Count > 0)
                {
                    Console.WriteLine("Features:");
                    foreach (var feature in LicenseInfo.Features)
                    {
                        Console.WriteLine($"  - {feature}");
                    }
                }

                if (LicenseInfo.OfflineMode)
                {
                    Console.WriteLine("Mode: Offline (Limited functionality)");
                }
            }
            else
            {
                Console.WriteLine("Status: Invalid");
                Console.WriteLine($"Error: {LicenseInfo.Error ?? "Unknown error"}");
            }

            Console.WriteLine("===========================\n");
        }

        /// <summary>
        /// Check if license is valid
        /// </summary>
        public bool IsValid() => LicenseInfo != null && LicenseInfo.Valid;

        /// <summary>
        /// Check if running in offline mode
        /// </summary>
        public bool IsOfflineMode() => LicenseInfo != null && LicenseInfo.OfflineMode;

        /// <summary>
        /// Check if a specific feature is available
        /// </summary>
        public bool HasFeature(string featureName)
        {
            if (LicenseInfo == null || !LicenseInfo.Valid)
            {
                return false;
            }

            return LicenseInfo.Features != null && LicenseInfo.Features.Contains(featureName);
        }
    }

    /// <summary>
    /// Model class for license information
    /// </summary>
    public class LicenseInfo
    {
        [JsonPropertyName("valid")]
        public bool Valid { get; set; }

        [JsonPropertyName("expiresAt")]
        public string ExpiresAt { get; set; }

        [JsonPropertyName("features")]
        public List<string> Features { get; set; }

        [JsonPropertyName("owner")]
        public string Owner { get; set; }

        [JsonPropertyName("validatedAt")]
        public string ValidatedAt { get; set; }

        [JsonPropertyName("offlineMode")]
        public bool OfflineMode { get; set; }

        [JsonPropertyName("error")]
        public string Error { get; set; }
    }

    /// <summary>
    /// Model class for API responses
    /// </summary>
    public class LicenseResponse
    {
        [JsonPropertyName("valid")]
        public
    /// <summary>
    /// Model class for API responses
    /// </summary>
    public class LicenseResponse
    {
        [JsonPropertyName("valid")]
        public bool Valid { get; set; }

        [JsonPropertyName("expiresAt")]
        public string ExpiresAt { get; set; }

        [JsonPropertyName("features")]
        public List<string> Features { get; set; }

        [JsonPropertyName("owner")]
        public string Owner { get; set; }

        [JsonPropertyName("error")]
        public string Error { get; set; }
    }
}

// Example usage:
/*
class Program
{
    static async Task Main(string[] args)
    {
        var client = new HexLicense.LicenseClient(new Dictionary<string, string>
        {
            { "licenseKey", "YOUR-LICENSE-KEY-HERE" }
        });

        if (await client.ValidateAsync())
        {
            client.DisplayLicenseInfo();
            // Start your application here
        }
        else
        {
            Console.WriteLine("License validation failed! Application will exit.");
            Environment.Exit(1);
        }
    }
}
*/