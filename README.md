# @homebridge-plugins/homebridge-tuya

<div align="center">

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

![node](https://badgen.net/npm/node/@homebridge-plugins/homebridge-tuya)
![homebridge](https://img.shields.io/github/package-json/dependency-version/homebridge-plugins/homebridge-tuya/peer/homebridge)

[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ff69b4)](https://github.com/sponsors/tassy-h)
[![version](https://badgen.net/npm/v/@homebridge-plugins/homebridge-tuya)](https://npmjs.com/package/@homebridge-plugins/homebridge-tuya)
![size](https://img.shields.io/npm/unpacked-size/@homebridge-plugins/homebridge-tuya)
[![npm-downloads](https://badgen.net/npm/dt/@homebridge-plugins/homebridge-tuya)](https://npmjs.com/package/@homebridge-plugins/homebridge-tuya)
[![mit-license](https://badgen.net/npm/license/@homebridge-plugins/homebridge-tuya)](https://github.com/homebridge-plugins/homebridge-tuya/blob/main/LICENSE)
[![Build and Lint](https://github.com/homebridge-plugins/homebridge-tuya/actions/workflows/build.yml/badge.svg)](https://github.com/homebridge-plugins/homebridge-tuya/actions/workflows/build.yml)

**A unified Homebridge plugin for Tuya smart devices**

Supports **Tuya Cloud** (REST/MQTT) and **Tuya Local** (direct LAN/TCP) communication — or both simultaneously.

</div>

---

## Overview

This plugin integrates Tuya smart home devices with Apple HomeKit through Homebridge. Choose your connection method based on your needs:

| Mode | Features | Requirements |
|------|----------|--------------|
| **Cloud** | Full features, remote access, scenes, automations | Tuya IoT account, internet |
| **Local** | Fast response, no cloud dependency, privacy-focused | Devices & Homebridge on same network |
| **Both** | Best of both worlds — local-first with cloud fallback | Both configurations |

**Supports 60+ device categories**: Lights, switches, sockets, outlets, fans, air conditioners, thermostats, door locks, cameras, sensors, garage doors, curtains, and more.

---

## Quick Features

✅ **Three connection modes** — Cloud, Local, or Both simultaneously  
✅ **60+ device categories** — Comprehensive device support  
✅ **Automatic discovery** — UDP broadcast discovery for local devices  
✅ **Tuya Scenes** — Support for Tap-to-Run scenes in Cloud mode  
✅ **Protocol support** — Tuya local protocol v3.1–v3.5  
✅ **Device overrides** — Custom schema mapping for non-standard devices  
✅ **Adaptive Lighting** — Supported on compatible light accessories  
✅ **NonStandard DP support** — Expose non-standard DP as extra HomeKit services.  
✅ **Enhanced stability** — Optimized code, reduced API errors  

---

## Installation

### Homebridge Web UI (Recommended)

1. Open Homebridge UI
2. Go to **Plugins** page
3. Search for `@homebridge-plugins/homebridge-tuya`
4. Click **Install**
5. Configure using the Settings UI

### Command Line

```bash
npm install @homebridge-plugins/homebridge-tuya
```

---

## Getting Started

### Step 1: Choose Your Connection Mode

Decide between **Cloud**, **Local**, or **Both**:

- **Cloud only**: Easiest setup, works remotely, but relies on internet
- **Local only**: Fastest response, no cloud dependency, but limited features
- **Both**: Recommended — local commands first, cloud as fallback

### Step 2: Configuration

Configuration uses the Homebridge Web UI or `config.json`. See [Configuration Guide](./docs/CONFIG_GUIDE.md) for detailed setup instructions.

**Quick example (Cloud mode):**
```json
{
  "platform": "TuyaPlatform",
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

**Quick example (Local mode):**
```json
{
  "platform": "TuyaPlatform",
  "mode": "local",
  "local": {
    "autoDiscoverDevices": true,
    "discoverTimeout": 5
  }
}
```

---

## Configuration Modes

### Cloud Mode

Connect via Tuya Cloud API with full feature support.

**Requirements:**
- Tuya IoT Platform account
- Cloud project setup
- API credentials
- Subscription to required services

**See:** [Cloud Setup Guide](./docs/CONFIG_GUIDE.md#cloud-setup)

### Local Mode

Direct LAN communication without cloud dependency — faster and more private.

**Requirements:**
- Devices and Homebridge on same network
- Device local keys
- UDP broadcast enabled on network

**See:** [Local Setup Guide](./docs/CONFIG_GUIDE.md#local-setup) and [Get Local Keys](./docs/Get-Local-Keys-for-Your-Devices.md)

### Both Mode

Hybrid mode using local commands with cloud fallback for reliability.

**See:** [Both Mode Setup](./docs/CONFIG_GUIDE.md#both-mode)

---

## Documentation

| Document | Purpose |
|----------|---------|
| [CONFIG_GUIDE.md](./docs/CONFIG_GUIDE.md) | **Detailed configuration reference** — all options explained |
| [ADVANCED_OPTIONS.md](./docs/ADVANCED_OPTIONS.md) | Device schema overrides, non-standard DPs, custom mappings |
| [SUPPORTED_DEVICES.md](./docs/SUPPORTED_DEVICES.md) | Complete list of 60+ supported device categories |
| [Get Local Keys](./docs/Get-Local-Keys-for-Your-Devices.md) | Step-by-step guide to retrieve device local keys |
| [CHANGELOG.md](./CHANGELOG.md) | Version history and updates |

---

## Supported Devices

This plugin supports **60+ device categories** from Tuya's ecosystem:

**Lighting:** Lights, ceiling lights, string lights, strip lights, dimmers, motion sensor lights, solar lights, and more  
**Electrical:** Switches, sockets, power strips, curtain switches, dimmer switches, fan switches, wireless switches  
**Climate:** Air conditioners, heaters, thermostats, humidifiers, dehumidifiers  
**Security:** Door locks, door/window sensors, motion sensors, smoke detectors, CO detectors  
**Cameras & Sensors:** Video cameras (with RTSP streaming), temperature/humidity sensors, air quality sensors  
**Other:** IR controllers, garage door openers, fans, robot vacuums, and more

**For a complete list:** See [SUPPORTED_DEVICES.md](./docs/SUPPORTED_DEVICES.md)


## Troubleshooting

### Common Issues

#### 1. Authentication Errors (`1106`, `2406`)

If you receive these error codes in Cloud mode:

1. Open the Tuya app → **Me** → **Settings** → **Network Diagnosis**
2. Start diagnosis and upload logs
3. Find the line starting with `Region code:`:
   - `AY` = China
   - `AZ` = West US
   - `EU` = Central Europe
   - `IN` = India
4. Manually set `options.endpoint` in your config with the correct region endpoint

**For help finding your endpoint:** [Tuya API Endpoints](https://developer.tuya.com/en/docs/iot/api-request?id=Ka4a8uuo1j4t4#title-1-Endpoints)

#### 2. Device Not Showing Up

**In Cloud mode:**
- Verify the device is added to your Tuya app
- Confirm the device category is in the [supported list](./docs/SUPPORTED_DEVICES.md)
- Check that required APIs are subscribed on your cloud project

**In Local mode:**
- Ensure Homebridge and devices are on the **same network**
- Disable any network isolation or guest network features
- Enable UDP broadcast on your router/network
- Manually add the device with its local key if auto-discovery fails

**For both modes:**
- Check HomeKit accessory cache: `rm -rf ~/.homebridge/persist/AccessoryInfo.${RANDOM}.json`
- Review logs with `debug: true` enabled

#### 3. Non-Standard Device Properties

Some devices have non-standard Data Points (DPs) that don't map to the standard schema.

**Solution:** Use device schema overrides. See [ADVANCED_OPTIONS.md](./docs/ADVANCED_OPTIONS.md) for examples.

**Steps:**
1. Enable debug mode and operate the device
2. Find `TuyaDeviceList.{uid}.json` path from logs
3. Identify the non-standard DP codes
4. Add a `deviceOverrides` entry with custom schema mappings

#### 4. Local Connection Not Working

**Check:**
- ✅ Homebridge can ping device: `ping <device_ip>`
- ✅ Device local key is correct (16 characters)
- ✅ Device protocol version is correct (try auto-detect first)
- ✅ UDP port 6666 is open (used for discovery)
- ✅ Network firewall allows local communication

#### 5. Cloud API Trial Expired

**⚠️ Important:** Tuya IoT Platform API trials expire every 6 months.

**To renew:**
1. Log in to [Tuya IoT Platform](https://iot.tuya.com)
2. Go to **Cloud** → **API** → **IoT Core Cloud Services**
3. Click **Extend** to renew trial
4. **Set a calendar reminder** for 6 months later

**Without renewal,** your plugin will stop working after expiration.

---

## Debug & Support

### Enable Debug Logging

Add to your config:
```json
{
  "platform": "TuyaPlatform",
  "options": {
    "debug": true,
    "debugLevel": "api,mqtt"
  }
}
```

**Debug levels:**
- `api` — API call logs
- `mqtt` — MQTT connection logs
- `{device_id}` — Specific device logs

### Getting Device Information

After a successful connection, the cloud device list is saved at the path shown in Homebridge logs:
```
[TuyaPlatform] Device list saved at /path/to/TuyaDeviceList.{uid}.json
```

**⚠️ Warning:** Remove sensitive fields (`ip`, `lon`, `lat`, `local_key`) before sharing logs.

### Reporting Issues

When reporting issues, include:
1. Plugin version (`npm list @homebridge-plugins/homebridge-tuya`)
2. Homebridge version and Node version
3. Device category and model
4. Relevant debug logs (without sensitive data)
5. Steps to reproduce

**GitHub Issues:** [Create an issue](https://github.com/homebridge-plugins/homebridge-tuya/issues)

---

## FAQ

### Connection Modes

**Q: Which mode should I use?**

- **Cloud only:** Simple setup, works remotely, but slower
- **Local only:** Fastest, most private, but limited features
- **Both (recommended):** Local commands first, cloud fallback for reliability

**Q: Can I switch modes later?**

Yes. Update the `mode` setting in your config and restart Homebridge.

---

### About Devices

**Q: What devices does this plugin support?**

This plugin supports 60+ Tuya device categories. See [SUPPORTED_DEVICES.md](./docs/SUPPORTED_DEVICES.md) for the complete list.

**Q: My device isn't showing up. What do I do?**

See [Troubleshooting → Device Not Showing Up](#2-device-not-showing-up).

**Q: Can I customize how my device appears in HomeKit?**

Yes. Use device overrides to:
- Change category type
- Map non-standard DPs to standard ones
- Hide specific device properties
- Enable Adaptive Lighting
- And more

See [ADVANCED_OPTIONS.md](./docs/ADVANCED_OPTIONS.md) for examples.

---

### About Tuya Account

**Q: Do I need a Tuya IoT account for Cloud mode?**

Yes. You need to create a free trial project on [Tuya IoT Platform](https://iot.tuya.com).

**Q: How do I get my local keys?**

Follow the step-by-step guide: [Get Local Keys for Your Devices](./docs/Get-Local-Keys-for-Your-Devices.md)

**Q: Can I use the same Tuya account for multiple Homebridge instances?**

Not recommended. Use separate Tuya app accounts per Homebridge instance to avoid conflicts.

---

### About Performance

**Q: Why are local commands faster than cloud?**

Local commands communicate directly with your devices over LAN (typically <100ms), while cloud commands go through Tuya's servers (typically >1 second).

**Q: Does the plugin consume a lot of bandwidth?**

No. In Local mode, it uses only local network traffic. In Cloud mode, it uses MQTT for efficient subscriptions and status updates.

---

## Limitations

- **Same app account recommendation:** Using the same Tuya account for multiple Homebridge/Home Assistant instances is not recommended. Create separate accounts.
- **Cloud API trial duration:** API trial must be renewed every 6 months.
- **Local network requirement:** Local mode requires devices and Homebridge on the same subnet.
- **Feature support variance:** Some features (Scenes, advanced automations) are only available in Cloud mode.

---

## Development

### Prerequisites

- Node.js 20+ (or 22, 24, 25)
- npm 10+

### Build & Test

```bash
# Install dependencies
npm install

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Run tests
npm test

# Generate coverage report
npm run coverage

# Build for deployment
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

### Project Structure

```
src/
├── index.ts              # Plugin entry point
├── platform.ts           # Main platform class
├── config.ts             # Config interfaces
├── settings.ts           # Constants
├── cloud/                # Cloud/API logic
│   ├── api/              # Tuya API clients
│   └── device/           # Cloud device handling
├── local/                # Local/LAN logic
│   ├── protocol/         # Tuya local protocol
│   └── device/           # Local device handling
└── shared/               # Shared utilities
    ├── accessory/        # HomeKit accessory factories
    └── util/             # Utilities

test/                     # Test suite
docs/                     # Documentation
```

### Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and test thoroughly
4. Run `npm run lint:fix` and `npm test`
5. Commit with clear messages
6. Push to your branch
7. Open a Pull Request

---

## License

MIT License — see [LICENSE](./LICENSE) file for details

---

## Support

- ⭐ Star this repo if you find it helpful
- 💖 [Sponsor the project](https://github.com/sponsors/tassy-h)
- 🐛 [Report issues](https://github.com/homebridge-plugins/homebridge-tuya/issues)
- 📖 [Documentation](./docs/CONFIG_GUIDE.md)

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## Sponsors

<img class="circle avatar-user" src="https://avatars.githubusercontent.com/u/314622938?s=52&amp;v=4" width="26" height="26" alt="@mlm-it">

This project is supported by generous sponsors on GitHub Sponsors.  
Thank you for helping me continue improving and maintaining this software!

[![Sponsor me](https://img.shields.io/badge/Sponsor%20me-❤-ff69b4)](https://github.com/sponsors/tassy-h)
