#!/usr/bin/env python3
"""
Hex License Python Client
Compatible with Hex Status 2.0 authentication system
"""

import os
import sys
import json
import time
import uuid
import socket
import hashlib
import platform
import datetime
import urllib.request
import urllib.error
from typing import Dict, List, Optional, Any, Union
import base64

try:
    # Try to import these modules for more accurate hardware info
    import psutil
    import netifaces
    HAS_NETINFO = True
except ImportError:
    HAS_NETINFO = False

try:
    # For encryption/decryption
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False


class LicenseClient:
    """Hex License Client for Python applications"""

    # Constants
    OFFLINE_GRACE_DAYS = 7
    API_TIMEOUT = 10  # seconds

    def __init__(self, **options):
        """Initialize the license client"""
        # Configuration
        self.api_url = options.get('api_url', 'https://api.hexrift.net/api')
        self.product_id = options.get('product_id', 'Hex-Status-2.0')
        self.version = options.get('version', '2.0.0')
        self.license_key = options.get('license_key', None)
        
        # Set up cache directory
        self.cache_dir = options.get('cache_dir', os.path.join(os.path.expanduser('~'), '.hexlicense'))
        self.cache_file = os.path.join(self.cache_dir, 'license.cache')
        
        # Create cache directory if it doesn't exist
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir, mode=0o700, exist_ok=True)
        
        # Generate hardware ID
        self.hwid = self.generate_hwid()
        
        # Initialize state
        self.license_info = None
        self.offline_mode = False

    def generate_hwid(self) -> str:
        """Generate a hardware ID based on system information"""
        system_info = []
        
        # Get hostname
        system_info.append(socket.gethostname())
        
        # Get OS info
        system_info.append(platform.system())
        system_info.append(platform.release())
        
        # Get CPU info
        system_info.append(platform.processor())
        system_info.append(str(os.cpu_count()))
        
        # Get MAC addresses
        mac_addresses = []
        if HAS_NETINFO:
            for interface in netifaces.interfaces():
                addresses = netifaces.ifaddresses(interface)
                # Get MAC address (link-layer address)
                if netifaces.AF_LINK in addresses:
                    addr = addresses[netifaces.AF_LINK]
                    if addr and 'addr' in addr[0]:
                        mac = addr[0]['addr']
                        if mac and mac != '00:00:00:00:00:00':
                            mac_addresses.append(mac)
        else:
            # Fallback method
            if sys.platform == 'win32':
                # Windows
                import subprocess
                output = subprocess.check_output('getmac /v /fo csv', shell=True).decode('utf-8')
                for line in output.splitlines()[1:]:  # Skip header
                    if ',' in line:
                        parts = line.split(',')
                        if len(parts) >= 3:
                            mac = parts[2].strip('"')
                            mac_addresses.append(mac)
            else:
                # Linux/Mac
                import subprocess
                output = subprocess.check_output('ifconfig -a || /sbin/ifconfig -a', shell=True).decode('utf-8')
                import re
                mac_pattern = re.compile(r'ether\s+([0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2})')
                matches = mac_pattern.findall(output)
                mac_addresses.extend(matches)
        
        if mac_addresses:
            system_info.append(','.join(mac_addresses))
        
        # Get memory info
        if HAS_NETINFO:
            mem = psutil.virtual_memory()
            system_info.append(str(mem.total))
        
        # Join all information and create hash
        system_string = '|'.join(filter(None, system_info))
        return hashlib.sha256(system_string.encode()).hexdigest()

    def validate(self) -> bool:
        """Validate license with the API server"""
        print("Validating license with server...")
        
        if not self.license_key:
            print("Error: No license key provided")
            return False
        
        # Try to validate online
        try:
            # Prepare request data
            machine_info = {
                'os': platform.system(),
                'version': platform.release(),
                'arch': platform.machine(),
                'hostname': socket.gethostname()
            }
            
            request_data = {
                'key': self.license_key,
                'hwid': self.hwid,
                'product': self.product_id,
                'version': self.version,
                'machine': machine_info
            }
            
            # Make request
            headers = {
                'Content-Type': 'application/json',
                'User-Agent': f'HexLicense-PythonClient/{self.version}'
            }
            
            req = urllib.request.Request(
                f"{self.api_url}/verify",
                data=json.dumps(request_data).encode('utf-8'),
                headers=headers,
                method='POST'
            )
            
            with urllib.request.urlopen(req, timeout=self.API_TIMEOUT) as response:
                response_data = json.loads(response.read().decode('utf-8'))
                
                if response_data.get('valid'):
                    # License is valid
                    self.license_info = {
                        'valid': True,
                        'expiresAt': response_data.get('expiresAt'),
                        'features': response_data.get('features', []),
                        'owner': response_data.get('owner', 'Unknown'),
                        'validatedAt': datetime.datetime.utcnow().isoformat(),
                        'offlineMode': False
                    }
                    
                    self.offline_mode = False
                    
                    # Save license info to cache
                    self.save_cache()
                    
                    print("License validated successfully")
                    return True
                else:
                    # License is invalid
                    self.license_info = {
                        'valid': False,
                        'error': response_data.get('error', 'License validation failed')
                    }
                    
                    print(f"License validation failed: {self.license_info['error']}")
                    return False
                
        except Exception as e:
            print(f"License validation error: {str(e)}")
            
            # Try offline validation
            if self.validate_offline():
                print("Using cached license in offline mode")
                return True
            
            return False

    def validate_offline(self) -> bool:
        """Try to validate using cached license data"""
        try:
            pass  # Placeholder for the actual validation logic
        except Exception as e:
            print(f"Error during offline validation: {str(e)}")
            return False

    def validate_offline(self) -> bool:
        """Try to validate using cached license data"""
        try:
            if not os.path.exists(self.cache_file):
                return False
            
            # Read and decrypt cache file
            with open(self.cache_file, 'r') as f:
                data = f.read()
                
            # Parse IV and encrypted data
            iv_hex, encrypted_data_hex = data.split(':')
            iv = bytes.fromhex(iv_hex)
            encrypted_data = bytes.fromhex(encrypted_data_hex)
            
            # Check if crypto is available
            if not HAS_CRYPTO:
                print("Warning: cryptography module not available, can't decrypt cache")
                return False
            
            # Generate key from HWID
            key = self._get_encryption_key()
            
            # Decrypt data
            decrypted = self._decrypt_aes(encrypted_data, key, iv)
            cache = json.loads(decrypted)
            
            # Check if cache is valid
            if 'validatedAt' not in cache or 'expiresAt' not in cache:
                return False
            
            # Check cache expiration (offline limit)
            validated_at = datetime.datetime.fromisoformat(cache['validatedAt'])
            now = datetime.datetime.utcnow()
            offline_limit = datetime.timedelta(days=self.OFFLINE_GRACE_DAYS)
            offline_expires = validated_at + offline_limit
            
            if now > offline_expires:
                print("Offline validation period expired")
                return False
            
            # Check if license has expired
            if cache['expiresAt'] and now > datetime.datetime.fromisoformat(cache['expiresAt']):
                print("Cached license has expired")
                return False
            
            # Set license info from cache
            self.license_info = cache
            self.license_info['offlineMode'] = True
            self.offline_mode = True
            
            return True
            
        except Exception as e:
            print(f"Offline validation error: {str(e)}")
            return False

    def save_cache(self) -> bool:
        """Save license information to encrypted cache"""
        try:
            if not self.license_info or not self.license_info.get('valid'):
                return False
                
            # Check if crypto is available
            if not HAS_CRYPTO:
                print("Warning: cryptography module not available, can't encrypt cache")
                return False
            
            # Encrypt the cache data
            key = self._get_encryption_key()
            iv = os.urandom(16)  # Generate random IV
            
            json_data = json.dumps(self.license_info)
            encrypted_data = self._encrypt_aes(json_data, key, iv)
            
            # Store IV with encrypted data
            iv_hex = iv.hex()
            encrypted_hex = encrypted_data.hex()
            encrypted_combined = f"{iv_hex}:{encrypted_hex}"
            
            # Write to file
            with open(self.cache_file, 'w') as f:
                f.write(encrypted_combined)
            
            # Set secure permissions
            os.chmod(self.cache_file, 0o600)
            
            return True
            
        except Exception as e:
            print(f"Failed to save license cache: {str(e)}")
            return False
    
    def _get_encryption_key(self) -> bytes:
        """Generate a key from the HWID"""
        return hashlib.sha256(self.hwid.encode()).digest()
    
    def _encrypt_aes(self, data: str, key: bytes, iv: bytes) -> bytes:
        """Encrypt data using AES-256-CBC"""
        backend = default_backend()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=backend)
        encryptor = cipher.encryptor()
        
        # Pad data to block size
        padded_data = self._pad_data(data.encode())
        
        return encryptor.update(padded_data) + encryptor.finalize()
    
    def _decrypt_aes(self, data: bytes, key: bytes, iv: bytes) -> str:
        """Decrypt data using AES-256-CBC"""
        backend = default_backend()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=backend)
        decryptor = cipher.decryptor()
        
        decrypted_data = decryptor.update(data) + decryptor.finalize()
        
        # Remove padding
        unpadded_data = self._unpad_data(decrypted_data)
        
        return unpadded_data.decode('utf-8')
    
    def _pad_data(self, data: bytes) -> bytes:
        """PKCS7 padding"""
        block_size = 16
        padding_size = block_size - (len(data) % block_size)
        padding = bytes([padding_size] * padding_size)
        return data + padding
    
    def _unpad_data(self, data: bytes) -> bytes:
        """Remove PKCS7 padding"""
        padding_size = data[-1]
        return data[:-padding_size]
    
    def display_license_info(self) -> None:
        """Print license information to console"""
        if not self.license_info:
            print("No license information available")
            return
            
        print("\n=== LICENSE INFORMATION ===")
        
        if self.license_info.get('valid'):
            print("Status: Valid")
            print(f"Product: {self.product_id}")
            print(f"Owner: {self.license_info.get('owner', 'Unknown')}")
            
            if self.license_info.get('expiresAt'):
                expires_at = datetime.datetime.fromisoformat(self.license_info['expiresAt'])
                now = datetime.datetime.utcnow()
                days_left = (expires_at - now).days
                print(f"Expires: {expires_at.strftime('%Y-%m-%d')} ({days_left} days left)")
            else:
                print("Expires: Never")
                
            if self.license_info.get('features'):
                print("Features:")
                for feature in self.license_info['features']:
                    print(f"  - {feature}")
                    
            if self.license_info.get('offlineMode'):
                print("Mode: Offline (Limited functionality)")
        else:
            print("Status: Invalid")
            print(f"Error: {self.license_info.get('error', 'Unknown error')}")
            
        print("===========================\n")
    
    def is_valid(self) -> bool:
        """Check if license is valid"""
        return self.license_info is not None and self.license_info.get('valid', False)
    
    def is_offline_mode(self) -> bool:
        """Check if running in offline mode"""
        return self.license_info is not None and self.license_info.get('offlineMode', False)
    
    def has_feature(self, feature_name: str) -> bool:
        """Check if a specific feature is available"""
        if not self.is_valid():
            return False
            
        features = self.license_info.get('features', [])
        return feature_name in features


# Example usage
if __name__ == "__main__":
    client = LicenseClient(
        license_key="YOUR-LICENSE-KEY-HERE"
    )
    
    if client.validate():
        client.display_license_info()
        
        # Check for specific features
        if client.has_feature("premium"):
            print("Premium features enabled!")
            
        # Start your application here
        print("Application starting...")
    else:
        print("License validation failed! Application will exit.")
        sys.exit(1)
