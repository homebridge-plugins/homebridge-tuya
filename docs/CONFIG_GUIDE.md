# Configuration Guide

This guide covers all configuration options for the Homebridge Tuya plugin. Use the Homebridge Web UI for easier configuration, or edit `config.json` directly.

**Table of Contents:**
1. [Connection Modes](#connection-modes)
2. [Cloud Setup](#cloud-setup)
3. [Local Setup](#local-setup)
4. [Both Mode](#both-mode)
5. [Common Settings](#common-settings)
6. [Camera Settings](#camera-settings)
7. [Complete Examples](#complete-examples)

---

## Connection Modes

Choose one of three connection modes:

| Mode | Best For | Requirements | Features |
|------|----------|--------------|----------|
| `cloud` | Remote access, full features | Tuya IoT account | Scenes, automations, remote control |
| `local` | Privacy, fast response | Local network | Direct device control, no cloud |
| `both` | Reliability & performance | Both configs | Local-first with cloud fallback |

---

## Cloud Setup

### Prerequisites

1. **Tuya app account** — Add your devices to the Tuya Smart app first
2. **Tuya IoT Platform account** — Free trial at [iot.tuya.com](https://iot.tuya.com)
3. **Cloud project** — Create and configure a project
4. **API credentials** — Access ID and Access Key
5. **Required API subscriptions** — See below

### Step-by-Step Setup

#### 1. Create Tuya IoT Platform Account

1. Go to [Tuya IoT Platform](https://iot.tuya.com) and sign up
2. Verify your email and log in
3. Complete your company profile (use any name)

#### 2. Create Cloud Project

1. Navigate to **Cloud** → **Projects**
2. Click **Free Trial** under **TRIAL EDITION**
3. Click **Buy Now** (free trial)
4. Close the value-added services tab
5. Go back to **Cloud** → **Projects**
6. Click **Create** and select:
   - **Edition:** Smart Home PAAS (PAAS Edition)
   - **Region:** Select your data center region ([View mapping](https://developer.tuya.com/en/docs/iot/oem-app-data-center-distributed?id=Kafi0ku9l07qb))
7. Click **Create**

#### 3. Link Your Tuya App Account

1. Go to your project → **Devices Panel**
2. Click **Link Tuya App Account**
3. Scan the QR code with your Tuya Smart app or enter credentials
4. Select the account and home to link

#### 4. Subscribe to Required APIs

1. Go to your project → **Service API**
2. Click **Go to Authorize**
3. Subscribe to these services:
   - ✅ **Authorization Token Management** (required)
   - ✅ **Device Status Notification** (required)
   - ✅ **IoT Core** (required)
   - ✅ **IoT Video Live Stream** (for cameras)
   - ✅ **Smart Home Scene Linkage** (for scenes)
   - ✅ **Smart Lock Open Service** (for door locks)
   - ✅ **IR Control Hub Open Service** (for IR remotes)
   - ✅ **Industry Project Client Service** (Custom project only)

#### 5. Get Your Credentials

1. Go back to your project overview
2. Copy your:
   - **Access ID** (API ID)
   - **Access Key** (API Secret)
3. Note your **endpoint** URL based on your region

### Configuration: Smart Home Project (projectType: "2")

**Most users should use this project type.**

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "cloud",
  "options": {
    "projectType": "2",
    "accessId": "YOUR_ACCESS_ID",
    "accessKey": "YOUR_ACCESS_KEY",
    "countryCode": 1,
    "username": "your_tuya_email@example.com",
    "password": "your_tuya_password",
    "appSchema": "tuyaSmart",
    "debug": false
  }
}
```

**Field Details:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `projectType` | ✅ | Must be `"2"` for Smart Home | `"2"` |
| `accessId` | ✅ | API ID from platform | `"c5a7b3d2c1e9f4b8"` |
| `accessKey` | ✅ | API Secret from platform | `"1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o"` |
| `countryCode` | ✅ | Country code (see below) | `1` (US), `86` (China) |
| `username` | ✅ | Tuya app login email | `"user@example.com"` |
| `password` | ✅ | Tuya app password | (plain text or MD5 hash) |
| `appSchema` | ✅ | App identifier | `"tuyaSmart"` or `"smartlife"` |
| `endpoint` | ➖ | Override auto-detected endpoint | `"https://openapi-xxxxxx.tuyaeu.com"` |
| `homeWhitelist` | ➖ | Array of home IDs to include (blank = all) | `[123456789, 987654321]` |
| `generateWeatherAccessory` | ➖ | Create weather sensor (experimental) | `false` |
| `forceIPv4` | ➖ | Force IPv4 connections | `false` |
| `debug` | ➖ | Enable debug logging | `false` |
| `debugLevel` | ➖ | Log filter: `api`, `mqtt`, or device ID | `"api,mqtt"` |

**Country Codes:**

| Region | Code | Region | Code |
|--------|------|--------|------|
| China | `86` | India | `91` |
| USA | `1` | Mexico | `52` |
| Canada | `1` | Australia | `61` |
| Europe (EU) | `44` | Brazil | `55` |
| UK | `44` | Singapore | `65` |
| Russia | `7` | Japan | `81` |

### Configuration: Custom Project (projectType: "1")

**Advanced users only.** Use Smart Home (type 2) if unsure.

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "cloud",
  "options": {
    "projectType": "1",
    "endpoint": "https://openapi-xxxxxx.tuyaeu.com",
    "accessId": "YOUR_ACCESS_ID",
    "accessKey": "YOUR_ACCESS_KEY",
    "username": "your_tuya_email@example.com",
    "password": "your_tuya_password",
    "debug": false
  }
}
```

**Field Details:**

| Field | Required | Description |
|-------|----------|-------------|
| `projectType` | ✅ | Must be `"1"` |
| `endpoint` | ✅ | Full endpoint URL from API reference |
| `accessId` | ✅ | API ID |
| `accessKey` | ✅ | API Secret |
| `username` | ✅ | Tuya account email |
| `password` | ✅ | Tuya account password |

**Finding your endpoint:** [Tuya API Endpoints](https://developer.tuya.com/en/docs/iot/api-request?id=Ka4a8uuo1j4t4#title-1-Endpoints)

---

## Local Setup

### Prerequisites

1. **Homebridge and devices on same network** — LAN communication required
2. **Device local keys** — Retrieve from Tuya IoT Platform
3. **Device IDs** — Available in Tuya app device details
4. **UDP broadcast enabled** — Typically enabled by default on home networks

### Getting Local Keys

Follow the detailed guide: [Get Local Keys for Your Devices](./Get-Local-Keys-for-Your-Devices.md)

**Quick summary:**
1. Log in to [Tuya IoT Platform](https://iot.tuya.com)
2. Go to **Projects** → Your Project → **Devices Panel** → **All Devices**
3. Select a device and click the device ID or view the product
4. In the device details, you'll find the **local key**

### Configuration

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "local",
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5,
    "rediscoverInterval": 3600,
    "devices": [
      {
        "tuyaDeviceId": "abcdef1234567890",
        "tuyaKey": "0123456789abcdef",
        "name": "Living Room Light",
        "category": "light",
        "ip": "192.168.1.100",
        "protocolVersion": "3.4"
      }
    ]
  }
}
```

**Field Details:**

| Field | Required | Description | Default | Example |
|-------|----------|-------------|---------|---------|
| `autoDiscoverDevices` | ➖ | Auto-discover devices via UDP | `true` | `true` |
| `discoverTimeout` | ➖ | Discovery wait time (seconds) | `5` | `10` |
| `rediscoverInterval` | ➖ | Rediscovery interval (seconds) | `3600` | `7200` |
| `devices` | ➖ | Manual device list (optional) | | |

**Per-Device Fields:**

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `tuyaDeviceId` | ✅ | Device ID from Tuya | `"1234567890abcdef"` |
| `tuyaKey` | ✅ | Local AES key (16 chars) | `"0123456789abcdef"` |
| `name` | ➖ | Friendly name in HomeKit | `"Living Room Light"` |
| `ip` | ➖ | Fixed IP (auto-discover if blank) | `"192.168.1.100"` |
| `category` | ➖ | Device type override | `"light"`, `"switch"` |
| `protocolVersion` | ➖ | Protocol version (auto-detect if blank) | `"3.3"`, `"3.4"`, `"3.5"` |

### Troubleshooting Local Connection

**Device not auto-discovered?**
1. Verify device is on same network: `ping <device_ip>`
2. Ensure UDP port 6666 is open
3. Check network firewall settings
4. Try manually adding the device with `devices` array

**Connection timeout?**
1. Verify device IP is correct
2. Check device protocol version (try auto-detect)
3. Ensure local key is exactly 16 characters
4. Enable debug logging to diagnose

---

## Both Mode

Combines Cloud and Local for optimal performance and reliability.

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "both",
  "options": {
    "projectType": "2",
    "accessId": "YOUR_ACCESS_ID",
    "accessKey": "YOUR_ACCESS_KEY",
    "countryCode": 1,
    "username": "your@email.com",
    "password": "yourpassword",
    "appSchema": "tuyaSmart"
  },
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5
  }
}
```

**How it works:**
1. Plugin attempts local commands first (fast)
2. If local command confirms within 10 seconds, done
3. If no confirmation within 10 seconds, retries via cloud
4. Cloud status updates satisfy pending local commands (no double-send)

**Benefits:**
- ✅ Fast local response for normal operation
- ✅ Automatic fallback to cloud if local fails
- ✅ No duplicate commands sent
- ✅ Best reliability

---

## Common Settings

Add these options to any mode's config block for enhanced functionality.

### Debug Logging

```json
{
  "options": {
    "debug": true,
    "debugLevel": "api,mqtt"
  }
}
```

**Debug levels:**
- `api` — API call logs
- `mqtt` — MQTT message logs
- `{device_id}` — Specific device logs (e.g., `"abc123def456"`)

### Device Overrides

See [ADVANCED_OPTIONS.md](./ADVANCED_OPTIONS.md) for detailed examples.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "adaptiveLighting": true
      }
    ]
  }
}
```

---

## Camera Settings

### RTSP Camera Streaming

Configure RTSP streaming for cameras:

```json
{
  "local": {
    "cameras": [
      {
        "deviceId": "abcdef1234567890",
        "deviceName": "Front Door Camera",
        "rtspUrl": "rtsp://192.168.1.50:554/stream",
        "username": "admin",
        "password": "password123"
      }
    ]
  }
}
```

**Field Details:**

| Field | Required | Description |
|-------|----------|-------------|
| `deviceId` | ✅ | Tuya device ID |
| `deviceName` | ➖ | Friendly name in HomeKit |
| `rtspUrl` | ✅ | RTSP stream URL |
| `username` | ➖ | RTSP username |
| `password` | ➖ | RTSP password |

---

## Complete Examples

### Example 1: Cloud Only (Simple Setup)

Best for: Remote access, full features, easier setup

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "cloud",
  "options": {
    "projectType": "2",
    "accessId": "c5a7b3d2c1e9f4b8",
    "accessKey": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o",
    "countryCode": 1,
    "username": "alice@example.com",
    "password": "mypassword123",
    "appSchema": "tuyaSmart",
    "debug": false
  }
}
```

### Example 2: Local Only (Privacy-Focused)

Best for: Privacy, fast response, no cloud dependency

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "local",
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5,
    "devices": [
      {
        "tuyaDeviceId": "bf1234567890abcd",
        "tuyaKey": "0123456789abcdef",
        "name": "Living Room Light"
      },
      {
        "tuyaDeviceId": "cd1234567890abef",
        "tuyaKey": "fedcba9876543210",
        "name": "Kitchen Plug"
      }
    ]
  }
}
```

### Example 3: Both Modes (Recommended)

Best for: Reliability, optimal performance, local-first with cloud fallback

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "both",
  "options": {
    "projectType": "2",
    "accessId": "c5a7b3d2c1e9f4b8",
    "accessKey": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o",
    "countryCode": 1,
    "username": "alice@example.com",
    "password": "mypassword123",
    "appSchema": "tuyaSmart",
    "deviceOverrides": [
      {
        "id": "bf1234567890abcd",
        "adaptiveLighting": true
      }
    ],
    "debug": false
  },
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5,
    "rediscoverInterval": 3600
  }
}
```

### Example 4: Advanced Cloud with Custom Devices

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "cloud",
  "options": {
    "projectType": "2",
    "accessId": "c5a7b3d2c1e9f4b8",
    "accessKey": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o",
    "countryCode": 1,
    "username": "alice@example.com",
    "password": "mypassword123",
    "appSchema": "tuyaSmart",
    "homeWhitelist": [123456789],
    "generateWeatherAccessory": false,
    "deviceOverrides": [
      {
        "id": "bf1234567890abcd",
        "adaptiveLighting": true,
        "category": "light"
      },
      {
        "id": "scene123456789",
        "category": "hidden"
      }
    ],
    "debug": false,
    "debugLevel": "api"
  }
}
```

### Example 5: Complete Setup with Cameras

```json
{
  "platform": "TuyaPlatform",
  "name": "Tuya",
  "mode": "both",
  "options": {
    "projectType": "2",
    "accessId": "c5a7b3d2c1e9f4b8",
    "accessKey": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o",
    "countryCode": 1,
    "username": "alice@example.com",
    "password": "mypassword123",
    "appSchema": "tuyaSmart"
  },
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5,
    "cameras": [
      {
        "deviceId": "cam1234567890abc",
        "deviceName": "Front Door",
        "rtspUrl": "rtsp://192.168.1.50:554/stream",
        "username": "admin",
        "password": "admin123"
      }
    ]
  }
}
```

---

## Tips & Best Practices

### General

- 🔐 **Secure passwords** — Use strong, unique Tuya passwords
- 🔄 **Backup config** — Keep a copy of your `config.json`
- 📅 **Renew trial** — Set calendar reminder for API trial renewal (every 6 months)
- 🆔 **Separate accounts** — Use different Tuya accounts for different Homebridge instances

### Cloud Mode

- ⏰ **Monitor trial expiration** — API trial expires every 6 months; renewal is required
- 🏠 **Use Smart Home projects** — Easier setup than Custom projects
- 🗺️ **Verify region** — Ensure you select the correct data center during project creation

### Local Mode

- 🌐 **Network setup** — Ensure devices and Homebridge are on same subnet
- 🔑 **Backup local keys** — Store keys in a safe location
- 📡 **Protocol version** — Let auto-detect handle it unless you know your device version

### Both Mode

- ⚡ **Optimized for speed** — Local commands complete in <100ms
- 🔄 **Automatic failover** — Cloud fallback is transparent to user
- 🚀 **Best practice** — Recommended for most users

---

## Troubleshooting Configuration

### "projectType not found" Error

**Solution:** Ensure you're using `"2"` (Smart Home) or `"1"` (Custom) as a string:
```json
"projectType": "2"
```
(not `projectType: 2`)

### "Invalid endpoint" Error

**Solution:** Verify your endpoint matches your data center region. Check [Tuya endpoints](https://developer.tuya.com/en/docs/iot/api-request?id=Ka4a8uuo1j4t4#title-1-Endpoints).

### "Devices not appearing"

**Cloud mode:** Ensure APIs are subscribed and your app account is linked to the project.  
**Local mode:** Verify local keys are correct and devices are discoverable on your network.

### Config not updating

**Solution:** Restart Homebridge after editing config:
```bash
sudo systemctl restart homebridge
# or
systemctl --user restart homebridge
```

---

## More Help

- 📖 [Main README](../README.md)
- 🔧 [Advanced Options](./ADVANCED_OPTIONS.md)
- 📱 [Get Local Keys](./Get-Local-Keys-for-Your-Devices.md)
- 💬 [GitHub Issues](https://github.com/homebridge-plugins/homebridge-tuya/issues)
