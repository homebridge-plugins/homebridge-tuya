# @homebridge-plugins/homebridge-tuya

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

![node](https://badgen.net/npm/node/@homebridge-plugins/homebridge-tuya)
![homebridge](https://img.shields.io/github/package-json/dependency-version/homebridge-plugins/homebridge-tuya/dev/homebridge)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ff69b4)](https://github.com/sponsors/tassy-h)
[![version](https://badgen.net/npm/v/@homebridge-plugins/homebridge-tuya)](https://npmjs.com/package/@homebridge-plugins/homebridge-tuya)
![size](https://img.shields.io/npm/unpacked-size/@homebridge-plugins/homebridge-tuya)
[![npm-downloads](https://badgen.net/npm/dt/@homebridge-plugins/homebridge-tuya)](https://npmjs.com/package/@homebridge-plugins/homebridge-tuya)
[![mit-license](https://badgen.net/npm/license/@homebridge-plugins/homebridge-tuya)](https://github.com/homebridge-plugins/homebridge-tuya/blob/main/LICENSE)
[![Build and Lint](https://github.com/homebridge-plugins/homebridge-tuya/actions/workflows/build.yml/badge.svg)](https://github.com/homebridge-plugins/homebridge-tuya/actions/workflows/build.yml)

Unified Homebridge plugin for Tuya smart devices — supports **Tuya Cloud** (REST/MQTT) and **Tuya Local** (direct LAN/TCP) communication, or both simultaneously.

---

## Features

- **Three connection modes**: Cloud, Local (LAN), or Both simultaneously.
- Optimized and improved code for better readability and maintainability.
- Enhanced stability and reduced API errors.
- Local LAN communication using the Tuya local protocol (v3.1–v3.5), no cloud connection required.
- Automatic UDP device discovery on the local network.
- Supports Tuya Scenes (Tap-to-Run) in Cloud mode.
- Device configuration overrides for non-standard DPs.
- Supports 60+ device categories including lights, switches, sensors, cameras, locks, IR remotes, and more.


## Supported Tuya Devices
See [SUPPORTED_DEVICES.md](./SUPPORTED_DEVICES.md)


## Changelogs
See [CHANGELOG.md](./CHANGELOG.md)


## Installation

#### Homebridge Web UI
Search for `@homebridge-plugins/homebridge-tuya` on the Plugins page and install it.

#### Command Line
```
npm install @homebridge-plugins/homebridge-tuya
```


## Configuration

### Connection Mode

Set `mode` in your config to one of:

| Mode | Description |
|------|-------------|
| `cloud` | Connect via Tuya Cloud API (default, backward-compatible) |
| `local` | Connect directly over LAN — no cloud needed |
| `both`  | Cloud + Local simultaneously |

---

### Cloud Mode (`mode: "cloud"`)

Requires a [Tuya IoT Platform](https://iot.tuya.com) account and cloud project:

1. Create a cloud project and select your data center. See [Mappings Between OEM App Accounts and Data Centers](https://developer.tuya.com/en/docs/iot/oem-app-data-center-distributed?id=Kafi0ku9l07qb).
2. On the Project Page > Devices Panel > Link Tuya App Account, link your Tuya app account.
3. On the Project Page > Service API > Go to Authorize, subscribe to:
   - Authorization Token Management
   - Device Status Notification
   - IoT Core
   - IoT Video Live Stream *(for cameras)*
   - Industry Project Client Service *(Custom project only)*
   - IR Control Hub Open Service *(for IR devices)*
   - Smart Home Scene Linkage *(for scenes)*
   - Smart Lock Open Service *(for locks)*
4. **⚠️ Extend the API trial every 6 months** at [IoT Core Cloud Services](https://iot.tuya.com/cloud/products/detail?abilityId=1442730014117204014&id=p1668587814138nv4h3n&abilityAuth=0&tab=1).

There are two project types:

#### Custom Project (`options.projectType: "1"`)

| Field | Required | Description |
|-------|----------|-------------|
| `options.projectType` | ✅ | `"1"` |
| `options.endpoint` | ✅ | Endpoint URL from [API Reference > Endpoints](https://developer.tuya.com/en/docs/iot/api-request?id=Ka4a8uuo1j4t4#title-1-Endpoints) |
| `options.accessId` | ✅ | Access ID from [Tuya IoT Platform](https://iot.tuya.com/cloud) |
| `options.accessKey` | ✅ | Access Secret from [Tuya IoT Platform](https://iot.tuya.com/cloud) |
| `options.debug` | ➖ | Enable debug logging (default: `false`) |
| `options.debugLevel` | ➖ | Comma-separated log filter: `api`, `mqtt`, or a device ID |

#### Smart Home Project (`options.projectType: "2"`)

| Field | Required | Description |
|-------|----------|-------------|
| `options.projectType` | ✅ | `"2"` |
| `options.accessId` | ✅ | Access ID |
| `options.accessKey` | ✅ | Access Secret |
| `options.countryCode` | ✅ | Country code of your app account's region |
| `options.username` | ✅ | Tuya/Smart Life app username |
| `options.password` | ✅ | App password (MD5 salted hash also accepted) |
| `options.appSchema` | ✅ | `"tuyaSmart"` or `"smartlife"` |
| `options.endpoint` | ➖ | Override endpoint (auto-detected from countryCode) |
| `options.homeWhitelist` | ➖ | Array of Home IDs to include; blank = all homes |
| `options.debug` | ➖ | Enable debug logging (default: `false`) |
| `options.debugLevel` | ➖ | Comma-separated log filter |

**Example cloud config:**
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
    "username": "your@email.com",
    "password": "yourpassword",
    "appSchema": "tuyaSmart"
  }
}
```

---

### Local Mode (`mode: "local"`)

Communicates directly with your Tuya devices over LAN — no internet or Tuya Cloud account required after initial key retrieval.

**Requirements:**
- Your Homebridge host and Tuya devices must be on the same network.
- Each device's **local key** (16-character AES key). You can retrieve your local keys from the [Tuya IoT Platform](https://iot.tuya.com) — see [Get Local Keys](https://github.com/homebridge-plugins/homebridge-tuya/wiki/Get-Local-Keys-for-Your-Devices) for a guide.

| Field | Required | Description |
|-------|----------|-------------|
| `local.autoDiscoverDevices` | ➖ | Auto-discover devices via UDP broadcast (default: `true`) |
| `local.discoverTimeout` | ➖ | Discovery listen time in seconds (default: `5`) |
| `local.devices` | ➖ | Optional list of known devices with their keys |
| `local.devices[].tuyaDeviceId` | ✅ | Tuya device ID |
| `local.devices[].tuyaKey` | ➖ | Local AES key (16 chars) |
| `local.devices[].ip` | ➖ | Fixed IP address (optional; otherwise auto-discovered) |
| `local.devices[].name` | ➖ | Friendly name |
| `local.devices[].category` | ➖ | Category code (e.g. `light`, `switch`) to pick the right accessory handler |
| `local.devices[].protocolVersion` | ➖ | Protocol version (e.g. `3.3`, `3.4`); auto-detected when blank |

**Example local config:**
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
        "tuyaDeviceId": "abcdef1234567890",
        "tuyaKey": "0123456789abcdef",
        "ip": "192.168.1.100",
        "name": "Living Room Light",
        "category": "light"
      }
    ]
  }
}
```

---

### Both Mode (`mode: "both"`)

Uses cloud + local simultaneously. Provide both `options` (cloud) and `local` blocks.
- Local LAN commands are attempted first when the device is available locally.
- The cloud connection remains active as a fallback.
- This fallback is only used when a local command does not receive confirmation within 10 seconds; normal local commands remain local.
- If a local command does not receive confirmation within 10 seconds, the plugin automatically retries it via cloud.
- Cloud status updates can also satisfy pending local commands so the device does not get double-sent commands.
---

### Advanced Options
See [ADVANCED_OPTIONS.md](./ADVANCED_OPTIONS.md)


## Limitations
- Using the same app account for multiple Homebridge/HomeAssistant instances is not recommended. Use separate app accounts per instance.
- **⚠️ Cloud API trial expires every 6 months** — set a calendar reminder to renew.
- Local mode requires devices and Homebridge to be on the same subnet.


## FAQ

#### About Login Issues

For most users, the data center is auto-detected. If you get error codes `1106` or `2406`:

1. Open the Tuya app → Me → Settings → Network Diagnosis.
2. Start diagnosis, select Upload Log → Copy the Log to Clipboard.
3. Find the line beginning with `Region code:`:
   - `AY` = China, `AZ` = West US, `EU` = Central Europe, `IN` = India.
4. Manually set `options.endpoint` in your config.

#### What is "Standard DP" and "Non-standard DP"?

"Standard DP" refers to device properties defined in [Tuya Standard Instruction Set](https://developer.tuya.com/en/docs/iot/standarddescription?id=K9i5ql6waswzq) (e.g. `switch_led`, `bright_value`). If your device works in the Tuya app but not this plugin, it likely has non-standard DPs.

#### Can "Non-standard DP" be supported?

Yes — override the device schema. See [ADVANCED_OPTIONS.md](./ADVANCED_OPTIONS.md).

Steps:
1. On the Tuya Platform → Your Project → Devices → All Devices → View by Product.
2. Click the pencil icon next to your product → select **DP Instruction** → save.
3. Add a `deviceOverrides` entry with schema mappings in the plugin config.


## Troubleshooting

#### 1. Get Device Information

After a successful start, the cloud device list is saved at the path shown in the Homebridge log:
```
[TuyaPlatform] Device list saved at /path/to/TuyaDeviceList.{uid}.json
```
**⚠️ Remove sensitive fields (`ip`, `lon`, `lat`, `local_key`, `uid`) before sharing.**

#### 2. Enable Debug Mode

Add `"debug": true` to your `options` block and restart Homebridge.

#### 3. Collect Logs

With debug enabled, operate your device physically or via the Tuya App and collect the MQTT/local protocol logs from the Homebridge log.
