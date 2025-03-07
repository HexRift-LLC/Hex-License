/**
 * Hex License - Discord Integration Utility
 * Handles logging and notification through Discord webhooks
 */

const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, Colors } = require('discord.js');
const yaml = require('yaml');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Load configuration
const configPath = path.join(__dirname, '../../config/config.yml');
const config = yaml.parse(fs.readFileSync(configPath, 'utf8'));

// Create Discord client with minimal required intents
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ],
    allowedMentions: { parse: [] }, // Prevent automatic mentions
    presence: {
        status: 'online',
        activities: [{
            name: 'Hex License',
            type: ActivityType.Watching
        }]
    }
});

// Connection states
let clientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

// Queue to store logs if client isn't ready
const logQueue = [];
const MAX_QUEUE_SIZE = 100;

/**
 * Initialize Discord connection with retry mechanism
 */
function initializeDiscord() {
    // Only attempt connection if token is provided
    if (!config.discord.bot_token) {
        console.warn('Discord bot token not configured. Discord logging is disabled.');
        return;
    }

    client.login(config.discord.bot_token)
        .catch(error => {
            console.error('Discord login error:', error);
            
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting Discord reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${RECONNECT_DELAY/1000}s...`);
                
                setTimeout(() => {
                    initializeDiscord();
                }, RECONNECT_DELAY);
            } else {
                console.error('Max Discord reconnection attempts reached. Discord logging disabled.');
            }
        });
}

// Initialize connection
initializeDiscord();

// Event handlers
client.once('ready', async () => {
    console.log(`Discord bot connected as ${client.user.tag}`);
    clientReady = true;
    reconnectAttempts = 0;
    
    // Process queued logs if any
    processLogQueue();
    
    // Check if configured log channel exists
    const channel = client.channels.cache.get(config.discord.logChannelId);
    if (!channel) {
        console.warn(`Discord log channel (${config.discord.logChannelId}) not found. Please check configuration.`);
    }
});

client.on('disconnect', () => {
    console.warn('Discord client disconnected');
    clientReady = false;
});

client.on('reconnecting', () => {
    console.log('Discord client reconnecting...');
});

client.on('error', error => {
    console.error('Discord client error:', error);
});

/**
 * Process logs in the queue when connection is available
 */
function processLogQueue() {
    if (!clientReady || logQueue.length === 0) return;
    
    console.log(`Processing ${logQueue.length} queued Discord logs...`);
    
    // Process logs in order
    while (logQueue.length > 0) {
        const { type, data } = logQueue.shift();
        sendLogToChannel(type, data).catch(err => {
            console.error('Error sending queued log:', err);
        });
    }
}

/**
 * Throttled version of sendLog to prevent rate limiting
 * Adds logs to queue if client isn't ready
 * 
 * @param {string} type - The type of log event
 * @param {object} data - The data associated with the event
 * @returns {Promise<void>}
 */
const sendLog = async (type, data) => {
    // Skip logging if Discord is disabled
    if (!config.discord.bot_token) return;
    
    // If client isn't ready, queue the log
    if (!clientReady) {
        // Add to queue if not full
        if (logQueue.length < MAX_QUEUE_SIZE) {
            logQueue.push({ type, data });
        }
        return;
    }
    
    // Send log directly
    try {
        await sendLogToChannel(type, data);
    } catch (error) {
        console.error('Error sending Discord log:', error);
        
        // Add to queue for retry if it was a connection error
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            if (logQueue.length < MAX_QUEUE_SIZE) {
                logQueue.push({ type, data });
            }
        }
    }
};

/**
 * Actual function to send logs to Discord channel
 * 
 * @param {string} type - The type of log event
 * @param {object} data - The data associated with the event
 * @returns {Promise<void>}
 */
async function sendLogToChannel(type, data) {
    const channel = client.channels.cache.get(config.discord.logChannelId);
    if (!channel) return;

    const embed = createEmbed(type, data);
    if (!embed) return; // Skip if no embed was created
    
    await channel.send({ embeds: [embed] });
}

/**
 * Create an appropriate embed based on log type
 * 
 * @param {string} type - The type of log event
 * @param {object} data - The data associated with the event
 * @returns {EmbedBuilder|null} - Discord embed or null if type is invalid
 */
function createEmbed(type, data) {
    // Base embed with common properties
    const embed = new EmbedBuilder()
        .setColor(config.discord.embedColor || Colors.Blurple)
        .setTimestamp()
        .setFooter({ 
            text: `Hex License v${require('../../package.json').version}`, 
            iconURL: config.discord.botIconUrl 
        });
    
    // Set thumbnail conditionally
    if (config.discord.botIconUrl) {
        embed.setThumbnail(config.discord.botIconUrl);
    }
    
    // Customize embed based on log type
    switch (type) {
        // License events
        case "license_created":
            embed
                .setTitle("🔑 License Created")
                .setDescription(`New license generated by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "Duration", value: data.duration ? `${data.duration} days` : 'Unlimited', inline: true }
                ]);
            break;

        case "license_deleted":
            embed
                .setTitle("🗑️ License Deleted")
                .setDescription(`License deleted by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "Product", value: data.product || 'Unknown', inline: true }
                ]);
            break;

        case "license_toggled":
            embed
                .setTitle(
                    data.status === "activated"
                        ? "✅ License Activated"
                        : "❌ License Deactivated"
                )
                .setDescription(`License ${data.status} by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "Product", value: data.product || 'Unknown', inline: true }
                ]);
            break;

        case "licenses_generated":
            embed
                .setTitle("🔑 Licenses Generated")
                .setDescription(`${data.quantity || 'Multiple'} licenses generated by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "Quantity", value: data.quantity?.toString() || 'Unknown', inline: true },
                    { name: "Duration", value: data.duration ? `${data.duration} days` : 'Unlimited', inline: true },
                    { name: "Assigned To", value: data.userId ? 'User Account' : (data.discordId ? 'Discord Account' : 'Unassigned'), inline: true }
                ]);
            break;

        // HWID events
        case "hwid_reset":
            embed
                .setTitle("🔄 HWID Reset")
                .setDescription(`HWID reset performed by ${data.username || 'Unknown'}`)
                .addFields([
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "License Owner", value: data.licenseOwner || 'Unassigned', inline: true },
                    { name: "Previous HWID", value: data.oldHwid || "None", inline: false }
                ]);
            break;

        case "license_hwid_bound":
            embed
                .setTitle("🔒 HWID Bound")
                .setDescription("License bound to new HWID")
                .addFields([
                    { name: "Owner", value: data.username || 'Unknown', inline: true },
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "HWID", value: data.hwid ? `||${data.hwid}||` : 'None', inline: false }
                ]);
            break;

        // User management events
        case "user_banned":
            embed
                .setTitle("🚫 User Banned")
                .setDescription(`User banned by ${data.staffMember || 'Unknown Staff'}`)
                .setColor(Colors.Red)
                .addFields([
                    { name: "User", value: data.username || 'Unknown', inline: true },
                    { name: "User ID", value: data.userId || 'Unknown', inline: true },
                    { name: "Reason", value: data.reason || 'No reason provided', inline: false }
                ]);
            break;

        case "user_unbanned":
            embed
                .setTitle("🔓 User Unbanned")
                .setDescription(`User unbanned by ${data.staffMember || 'Unknown Staff'}`)
                .setColor(Colors.Green)
                .addFields([
                    { name: "User", value: data.username || 'Unknown', inline: true },
                    { name: "User ID", value: data.userId || 'Unknown', inline: true }
                ]);
            break;

        case "staff_added":
            embed
                .setTitle("⭐ Staff Added")
                .setDescription(`New staff member added by ${data.staffMember || 'Unknown Admin'}`)
                .setColor(Colors.Gold)
                .addFields([
                    { name: "User", value: data.username || 'Unknown', inline: true },
                    { name: "User ID", value: data.userId || 'Unknown', inline: true }
                ]);
            break;

        case "staff_removed":
            embed
                .setTitle("👤 Staff Removed")
                .setDescription(`Staff member removed by ${data.staffMember || 'Unknown Admin'}`)
                .setColor(Colors.Orange)
                .addFields([
                    { name: "User", value: data.username || 'Unknown', inline: true },
                    { name: "User ID", value: data.userId || 'Unknown', inline: true }
                ]);
            break;

        // Product events
        case "product_created":
            embed
                .setTitle("📦 Product Created")
                .setDescription(`New product created by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "Product Name", value: data.productName || 'Unknown', inline: false },
                    { name: "Product ID", value: data.productId || 'Unknown', inline: true }
                ]);
            break;

        case "product_deleted":
            embed
                .setTitle("🗑️ Product Deleted")
                .setDescription(`Product deleted by ${data.username || 'Unknown Staff'}`)
                .addFields([
                    { name: "Product Name", value: data.productName || 'Unknown', inline: false },
                    { name: "Product ID", value: data.productId || 'Unknown', inline: true }
                ]);
            break;

        // License verification events
        case "license_verify_success":
            embed
                .setTitle("✅ License Verified")
                .setDescription("Successful license verification")
                .setColor(Colors.Green)
                .addFields([
                    { name: "Owner", value: data.username || 'Unknown', inline: true },
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "HWID", value: data.hwid ? `||${data.hwid}||` : 'None', inline: false }
                ]);
            break;

        case "license_verify_failed":
            embed
                .setTitle("❌ Verification Failed")
                .setDescription(`License verification failed: ${data.reason || 'Unknown reason'}`)
                .setColor(Colors.Red)
                .addFields([
                    { name: "Owner", value: data.username || 'Unknown', inline: true },
                    { name: "Product", value: data.product || 'Unknown', inline: true },
                    { name: "License Key", value: data.key ? `||${data.key}||` : 'Unknown', inline: false },
                    { name: "IP Address", value: data.ipAddress ? `||${data.ipAddress}||` : 'Unknown', inline: false }
                ]);
            break;

        // User profile events
        case "user_updated":
            embed
                .setTitle("👤 User Profile Updated")
                .setDescription(`User information has been synchronized`)
                .addFields([
                    { name: "User ID", value: data.discordId || 'Unknown', inline: false },
                    { name: "Old Username", value: data.oldUsername || 'Unknown', inline: true },
                    { name: "New Username", value: data.newUsername || 'Unknown', inline: true },
                    {
                        name: "Avatar Updated",
                        value: data.avatarChanged ? "Yes" : "No",
                        inline: true
                    }
                ]);
            break;

        case "user_check_status":
            embed
                .setTitle("🔍 User Sync Status")
                .setDescription(
                    data.hasUpdates
                        ? "Found updates for the following users:"
                        : "No updates found for any users"
                )
                .addFields(
                    (data.users || []).map((user) => ({
                        name: user.username || 'Unknown User',
                        value: user.hasUpdate ? "✅ Updated" : "✨ No changes needed",
                        inline: false,
                    }))
                );
            break;
            
        // Authentication events
        case "user_login":
            embed
                .setTitle("🔐 User Login")
                .setDescription(`User has logged in`)
                .addFields([
                    { name: "Username", value: data.username || 'Unknown', inline: true },
                    { name: "IP Address", value: data.ipAddress ? `||${data.ipAddress}||` : 'Unknown', inline: true },
                    { name: "User Agent", value: data.userAgent || 'Unknown', inline: false }
                ]);
            break;
            
        case "unauthorized_access":
            embed
                .setTitle("⚠️ Unauthorized Access Attempt")
                .setDescription(`Attempt to access restricted resource`)
                .setColor(Colors.Orange)
                .addFields([
                    { name: "Username", value: data.username || 'Unknown', inline: true },
                    { name: "Route", value: data.route || 'Unknown', inline: true },
                    { name: "IP Address", value: data.ip ? `||${data.ip}||` : 'Unknown', inline: true },
                    { name: "Timestamp", value: new Date().toISOString(), inline: false }
                ]);
            break;
            
        // System events
        case "server_started":
            embed
                .setTitle("🚀 Server Started")
                .setDescription(`Hex License server has started`)
                .setColor(Colors.Green)
                .addFields([
                    { name: "Version", value: data.version || 'Unknown', inline: true },
                    { name: "Environment", value: data.environment || 'development', inline: true },
                    { name: "Start Time", value: new Date().toISOString(), inline: false }
                ]);
            break;
            
        case "server_error":
            embed
                .setTitle("🔥 Server Error")
                .setDescription(`An error occurred on the server`)
                .setColor(Colors.Red)
                .addFields([
                    { name: "Error", value: data.error || 'Unknown error', inline: false },
                    { name: "Route", value: data.route || 'Unknown', inline: true },
                    { name: "Method", value: data.method || 'Unknown', inline: true },
                    { name: "Stack Trace", value: data.stack ? `\`\`\`${data.stack.substring(0, 1000)}\`\`\`` : 'Not available', inline: false }
                ]);
            break;
            
        // Data management events
        case "data_export":
            embed
                .setTitle("📊 Data Export")
                .setDescription(`Data exported by ${data.username || 'Unknown'}`)
                .addFields([
                    { name: "Data Type", value: data.dataType || 'Unknown', inline: true },
                    { name: "Format", value: data.format || 'Unknown', inline: true },
                    { name: "Timestamp", value: new Date().toISOString(), inline: false }
                ]);
            break;
            
        case "bulk_action":
            embed
                .setTitle("🔄 Bulk Action Performed")
                .setDescription(`Bulk action executed by ${data.username || 'Unknown'}`)
                .addFields([
                    { name: "Action", value: data.action || 'Unknown', inline: true },
                    { name: "Type", value: data.type || 'Unknown', inline: true },
                    { name: "Count", value: data.count?.toString() || '0', inline: true }
                ]);
            break;
            
        // Fallback for unknown event types
        default:
            // Log unknown events in a generic format
            if (!type) return null;
            
            embed
                .setTitle(`📝 ${formatEventTitle(type)}`)
                .setDescription(`${type} event occurred`);
                
            // Add all data fields automatically
            if (data) {
                Object.entries(data).forEach(([key, value]) => {
                    // Skip empty values or sensitive values over 1000 chars
                    if (value == null) return;
                    
                    // Format value for display
                    let formattedValue = value;
                    if (typeof value === 'object') {
                        formattedValue = '```json\n' + JSON.stringify(value, null, 2) + '\n```';
                    } else if (typeof value === 'boolean') {
                        formattedValue = value ? 'Yes' : 'No';
                    } else {
                        formattedValue = String(value);
                    }
                    
                    // Truncate long values
                    if (formattedValue.length > 1000) {
                        formattedValue = formattedValue.substring(0, 997) + '...';
                    }
                    
                    embed.addFields([{ name: formatFieldName(key), value: formattedValue, inline: false }]);
                });
            }
    }

    return embed;
}

/**
 * Format event type into a human-readable title
 * 
 * @param {string} eventType - The raw event type
 * @returns {string} Formatted title
 */
function formatEventTitle(eventType) {
    return eventType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Format field name into a human-readable form
 * 
 * @param {string} fieldName - The raw field name
 * @returns {string} Formatted field name
 */
function formatFieldName(fieldName) {
    return fieldName
        .split(/(?=[A-Z])|_/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Send a startup message when server initializes
 * 
 * @param {object} data - Server startup information
 * @returns {Promise<void>}
 */
const sendStartupMessage = async (data = {}) => {
    // Wait a bit to ensure Discord connection is established
    setTimeout(() => {
        sendLog('server_started', {
            version: require('../../package.json').version,
            environment: config.server.NODE_ENV || 'Production',
            ...data
        });
    }, 5000);
};

/**
 * Gracefully disconnect Discord client
 * 
 * @returns {Promise<void>}
 */
const disconnect = async () => {
    if (client && client.isReady()) {
        console.log('Disconnecting Discord client...');
        await client.destroy();
    }
};

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down Discord client...');
    await disconnect();
});

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down Discord client...');
    await disconnect();
});

module.exports = { 
    sendLog,
    sendStartupMessage,
    disconnect,
    isReady: () => clientReady
};

