# Changelog

## [3.0.0] - (2026.6.1)

### Breaking Changes
- **Complete codebase restructure** — source files are now organised under `src/cloud/`, `src/local/`, and `src/shared/` instead of the previous flat layout. No config changes needed for existing cloud users.
- Requires Node.js `^20 || ^22 || ^24 || ^25`.

### Added
- **Local LAN mode** — communicate directly with Tuya devices over TCP on your local network with no cloud connection required. Set `"mode": "local"` in your config.
- **Both mode** — run cloud and local connections simultaneously (`"mode": "both"`).
- **UDP auto-discovery** — automatically finds Tuya devices on the local network (ports 6666/6667/7000). Supports protocol versions 3.1–3.5 including AES-GCM (v3.5).
- **Full local protocol support** — LAN TCP client with AES-128-ECB (v3.1–v3.4) and AES-128-GCM (v3.5), 3-way key exchange for v3.4/v3.5, and automatic reconnection with exponential backoff.
- New `local` config block in Homebridge UI with device list and discovery options.
- New `mode` selector in the Homebridge UI config screen.

### Changed
- Updated `config.schema.json` with the new `mode` enum and `local` block; all cloud options now only appear when mode is `cloud` or `both`.
- Version bump to 3.0.0 to reflect the breaking restructure.
- Updated README with full cloud and local setup instructions.

## [2.2.0] - (2026.2.23)

### Fixed
 - Fixed the HeaterAccessory to follow the device’s schema information.
If you want to revert to the previous behavior, set the category code to qn_old. 

### Changed
 - Updated the handling of DP Codes so they are now processed in a case‑insensitive manner.
 - Updated the plugin settings window to mask the password field.

## [2.1.0] - (2026.1.5)

### Added
 - Support Towel Rack(mjj)
The implementation is almost identical to a thermostat.
The difference is that there is no limit on the set temperature.
The lower limit, upper limit, and step of the set temperature may sometimes differ from expectations. Since this is an issue with the product you are using, please override it to any desired value in Advanced Options.

## [2.0.3] - (2025.9.6)

First release after forking.
Homebridge verified.

### Added
 - Added an illuminance sensor to the IRControlHub.
 - Added an accessory that displays weather temperature and humidity.
 - config.schema.json to allow customizing the Service information for each accessory.

### Fixed
 - Fixed an issue where learned infrared codes in the IRControlHub would not work in some cases. This likely improves compatibility with older devices.
### Changed
 - Updated the IRControlHub to calculate WBGT based on its temperature and humidity readings and expose it as an accessory.
 - Updated the Outlet accessory so that its “in use” status can be checked in the Home app.

## [1.7.0] - (unreleased)

### Added
- Add scene support. (#118)
- Add Wireless Switch support (`wxkg`).
- Add Solar Light support (`tyndj`).
- Add Dehumidifier support (`cs`).
- Add Scene Switch support (`wxkg`).
- Add device overriding config support. "Non-standard DP" devices have possibility to be supported now. (#119)
- Add Camera support (`sp`). Thanks @ErrorErrorError for the contribution
- Add Air Conditioner support (`kt`). (#160)
- Add Air Conditioner Controller support (`ktkzq`). (#160)
- Add Diffuser support (`xxj`). (#175)
- Add Temperature Control Socket support (`wkcz`).
- Add Environmental Detector support (`hjjcy`).
- Add Water Valve Controller support (`sfkzq`).
- Add IR Remote Control support (`infrared_tv`, `infrared_stb`, `infrared_box`, `infrared_ac`, `infrared_fan`, `infrared_light`, `infrared_amplifier`, `infrared_projector`, `infrared_waterheater`, `infrared_airpurifier`). (#191)
- Add IR AC Controller support (`hwktwkq`).
- Add Fingerbot support (`szjqr`).
- Add Smart Lock support (`ms`, `jtmspro`). (#120) Thanks @pfgimutao for the contribution
- Add Alarm Host support (`mal`). (#246) Thanks @bFollon for the contribution
- Add Vibration Sensor support (`zd`). (#262)
- Add adaptive lighting support. (#272)
- Add Wireless Doorbell support (`wxml`). (#277)
- Add IR Remote Control support (`wsdykq`).
- Add Layout to display schema in sections. (#283) Thanks @donavanbecker for the contribution
- Add option to make accessory and unbridged accessory (#285) Thanks @donavanbecker for the contribution
- Add inching button for switches.
- Add support to 2ch windows covering. (#339) Thanks @CryptoIR for the contribution
- Add retry when network error happened.
- Add Pet Feeder support (`cwwsq`). (#483) Thanks @aselekoglu for the contribution


### Fixed
- Fix `RotationSpeed` missing one level. (#170)
- Fix `bright_value` not sent for the `C/CW` lights who doesn't have `work_mode`. (#171)
- Fix crash when camera sends an invalid status message.
- Fix incorrect Door and Window Controller state. (#178)
- Fix Thermostat cold mode not working (#242).
- Order temp before get the min and max for IRAirConditionerAccessory. (#433) Thanks @tuliocll for the contribution
- Fix energy usage not updated after homebridge restart. (#268)


### Changed
- Support Ceiling Fan icon customize and Floor Fan `lock`, `swing` feature. (#131)
- Adjust humidity range of dehumidifier and humidifier.
- Print scene id in logs.
- Update support for RGB Power Switch (`dj`).
- Support showing device online status via `StatusActive`. (#172)
- Update unit and range of `RotationSpeed`, need clean accessory cache to take effect. (#174, #273)
- Support Diffuser RGB light. (#184)
- Support Fan light temperature and color. (#184)
- Support Humidifier light. (#184)
- Expose energy usage for outlets/switches. (#190) Thanks @lstrojny for the contribution
- Strict config validate for `deviceOverrides`. (#278)
- Support AirPurifier air quality.
- Throw `HapStatusError` when device is offline.


## [1.6.0] - (2022.12.3)

This version has been completely rewritten in TypeScript, brings a lot of bug fix and new device support.

### New Accessories
- Add CO Detector support (`cobj`).
- Add CO2 Detector support (`co2bj`).
- Add Water Detector support (`sj`).
- Add Temperature and Humidity Sensor support (`wsdcg`, `wnykq`). Thanks @bimusiek for the contribution
- Add Light Sensor support (`ldcg`).
- Add Motion Sensor support (`pir`).
- Add PM2.5 Detector support (`pm25`).
- Add Door and Window Controller support (`mc`).
- Add Curtain Switch support (`clkg`). (#8)
- Add Human Presence Sensor support (`hps`). (#17)
- Add Thermostat support (`wk`). (#19) Thanks @burcadoruciprian for the contribution
- Add Spotlight support (`sxd`). (#21)
- Add Irrigator support (`ggq`). (#28)
- Add Scene Light Socket support (`qjdcz`). (#33)
- Add Ceiling Fan Light support (`fsd`). (#37)
- Add Thermostat Valve support (`wkf`). (#50)
- Add Motion Sensor Light support (`gyd`). (#65)
- Add Multiple Dimmer and Dimmer Switch support (`tgq`, `tgkg`). (#82)
- Add Humidifier support (`jsq`). (#89) Thanks @akaminsky-net for the contribution


### Added
- Add config validation during plugin initialization.
- Add instruction message for handling API errors.
- Add debounce in `BaseAccessory.sendCommands()` for better API request peformance.
- Persist `TuyaDeviceList.{uid}.json` for debugging. (#41)
- Add `homeWhitelist` option for whitelisting homes. (#84) Thanks @JulianLepinski for the contribution


### Fixed
- Fix 1004 signature error when url query has more than 2 elements.
- Fix 1010 token expired error when refresh access_token.
- Fix 1106 permission error when polling device info list.
- Fix 1100, 2017 errors when login. (via config validation)
- Fix Lightbulb `RGBW` and `RGBCW` work mode not switched properly (#12 #56 #59)
- Fix Lightbulb color temperature not working. (#13)
- Fix Thermostat temperature units handling. (#20)
- Fix Thermostat mode handling. (#26)
- Fix Curtain Switch with no position feature. (#27)
- Fallback when receiving MQTT message with wrong order. (#35)
- Fix wrong temperature on sensor. (#38)
- Fix fan speed issue. (#46 #51)
- Workaround for Thermostat with wrong schema property (#74)
- Fix Contact Sensor not working (#75)
- Fix iOS 16 default accessory name issue. (#85)


### Changed
- Rewritten in TypeScript, brings benefits of type checking, smart code hints, etc.
- Reimplement accessory logics. More friendly for accessory developers.
- Update device info list polling logic. Less API errors.
- Now `Manufactor`, `Serial Number` and `Model` will be correctly displayed in HomeKit.
- All devices will be shown in HomeKit by default (Including unsupported device).
- Updated unit test.
- Updated documentations. Thanks @prabch for the contribution


### Removed
- Remove `debug` option. Silence logs for users. For debugging, please refer to [troubleshooting](https://github.com/homebridge-plugins/homebridge-tuya#troubleshooting).
- Remove `lang` option.
- Remove `username` and `password` options for `Custom` project. User will be created and authorized automatically. (#11)
