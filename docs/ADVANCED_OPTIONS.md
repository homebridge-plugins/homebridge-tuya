# Advanced Options

This document covers advanced device customization using device schema overrides. These options allow you to:

- 🔧 Map non-standard device properties to HomeKit standards
- 🔄 Transform data types and value ranges
- 🎨 Enable special features like Adaptive Lighting
- 👁️ Hide unsupported or unwanted device properties
- 🏠 Unbridge accessories for custom HomeKit organization

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Device Overrides Reference](#device-overrides-reference)
3. [Schema Override Reference](#schema-override-reference)
4. [Common Use Cases](#common-use-cases)
5. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before using device overrides, you should:

1. **Understand device schema** — Data Points (DPs) are device properties. See [Tuya Standard Instruction Set](https://developer.tuya.com/en/docs/iot/standarddescription?id=K9i5ql6waswzq)
2. **Enable debug logging** — To see your device's actual DPs:
   ```json
   {
     "options": {
       "debug": true
     }
   }
   ```
3. **Find your device info** — After connecting, find the device list at the path shown in logs:
   ```
   [TuyaPlatform] Device list saved at /path/to/persist/TuyaDeviceList.{uid}.json
   ```
   This JSON contains your device's actual schema and data point codes.

4. **Basic JavaScript knowledge** — The `onGet` and `onSet` transformations use JavaScript

---

## Device Overrides Reference

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "device_id_or_product_id",
        "category": "light",
        "unbridged": false,
        "adaptiveLighting": false,
        "garageDoorUseContactSensorForState": false,
        "schema": []
      }
    ]
  }
}
```

### Device Override Fields

| Field | Required | Type | Description | Default |
|-------|----------|------|-------------|---------|
| `id` | ✅ | string | Device ID, Product ID, Scene ID, or `"global"` | — |
| `category` | ➖ | string | Override device category (e.g., `"light"`, `"switch"`) or `"hidden"` | auto-detect |
| `unbridged` | ➖ | boolean | Create as unbridged accessory in HomeKit | `false` |
| `adaptiveLighting` | ➖ | boolean | Enable Apple Adaptive Lighting (lights only) | `false` |
| `garageDoorUseContactSensorForState` | ➖ | boolean | Garage doors: read state from contact sensor | `false` |
| `configFor` | ➖ | string | Apply to specific mode: `"cloud"`, `"local"`, or `"both"` | `"cloud"` |
| `schema` | ➖ | array | Array of DP (Data Point) overrides | `[]` |

### Targeting Devices

**By Device ID** (most common):
```json
{
  "id": "bf1234567890abcd",
  "category": "light"
}
```

**By Product ID** (applies to all devices of that product):
```json
{
  "id": "dzxsq0rnibq6szvq",
  "schema": [/* ... */]
}
```

**By Scene ID** (for Tuya Scenes):
```json
{
  "id": "scene_123456789",
  "category": "hidden"
}
```

**Globally** (apply to all devices):
```json
{
  "id": "global",
  "adaptiveLighting": true
}
```

---

## Schema Override Reference

The `schema` array contains overrides for individual Data Points (DPs).

```json
{
  "schema": [
    {
      "code": "switch_led",
      "newCode": "switch",
      "type": "Boolean",
      "property": { "min": 0, "max": 100, "scale": 0.1, "step": 1 },
      "onGet": "Boolean(value)",
      "onSet": "value ? 1 : 0",
      "hidden": false
    }
  ]
}
```

### Schema Override Fields

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| `code` | ✅ | string | Original DP code | `"switch_led"` |
| `newCode` | ➖ | string | Rename the DP code | `"switch"` |
| `type` | ➖ | string | New type: `Boolean`, `Integer`, `Enum`, `String`, `Json`, `Raw` | `"Boolean"` |
| `property` | ➖ | object | Type-specific properties (min, max, scale, step, range) | `{ min: 0, max: 100 }` |
| `onGet` | ➖ | string | JavaScript to transform device→HomeKit value | `"value * 2"` |
| `onSet` | ➖ | string | JavaScript to transform HomeKit→device value | `"value / 2"` |
| `hidden` | ➖ | boolean | Hide this DP from HomeKit | `false` |

### Property Object

**For Integer types:**
```json
{
  "type": "Integer",
  "property": {
    "min": 0,
    "max": 100,
    "scale": 0.5,
    "step": 1
  }
}
```

**For Enum types:**
```json
{
  "type": "Enum",
  "property": {
    "range": ["off", "low", "medium", "high"]
  }
}
```

---

## Common Use Cases

### 1. Hide Device / Scene

Hide a device or scene from HomeKit entirely.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "category": "hidden"
      }
    ]
  }
}
```

**When to use:**
- Device is already controlled through another plugin
- Duplicate entry in HomeKit
- Unsupported device you don't want visible

---

### 2. Hide Specific Device Property

Hide a camera's floodlight or other unwanted properties.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{camera_id}",
        "schema": [
          {
            "code": "floodlight_switch",
            "hidden": true
          }
        ]
      }
    ]
  }
}
```

---

### 3. Enable Adaptive Lighting

Enable Apple's Adaptive Lighting feature for compatible lights.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{light_id}",
        "adaptiveLighting": true
      }
    ]
  }
}
```

**Requirements:**
- Light must support color temperature adjustment
- `color_temp` DP must be present and working

---

### 4. Garage Door Contact Sensor

For garage doors that report incorrect state, use contact sensor instead of switch state.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{garage_door_id}",
        "garageDoorUseContactSensorForState": true
      }
    ]
  }
}
```

---

### 5. Change Device Category

Override detected category for non-standard devices.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "category": "light"
      }
    ]
  }
}
```

**Note:** ⚠️ Changing category may cause unexpected behavior. Clear HomeKit cache after changes:
```bash
rm -rf ~/.homebridge/persist/AccessoryInfo.*.json
```

---

### 6. Show Device as Unbridged

Create as separate HomeKit accessory instead of under bridge.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "unbridged": true
      }
    ]
  }
}
```

---

### 7. Convert Enum to Boolean

Convert enum values like `"open"`/`"close"` to `true`/`false`.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "schema": [
          {
            "code": "open_close",
            "type": "Boolean",
            "onGet": "(value === 'open') ? true : false",
            "onSet": "(value === true) ? 'open' : 'close'"
          }
        ]
      }
    ]
  }
}
```

---

### 8. Transform Value Range

Adjust numeric ranges for temperature, brightness, or other integer values.

**Scenario:** Device sends brightness 0-255, but needs to be 0-100.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "schema": [
          {
            "code": "bright_value",
            "type": "Integer",
            "property": {
              "min": 0,
              "max": 100,
              "scale": 1,
              "step": 1
            },
            "onGet": "Math.round(value / 2.55)",
            "onSet": "Math.round(value * 2.55)"
          }
        ]
      }
    ]
  }
}
```

---

### 9. Handle Device Offline State

Show device as "Off" when it goes offline.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "schema": [
          {
            "code": "switch_led",
            "onGet": "(device.online && value)"
          }
        ]
      }
    ]
  }
}
```

---

### 10. Temperature Unit Conversion

Convert between Fahrenheit and Celsius.

**Formula:**
- F → C: `(F - 32) / 1.8`
- C → F: `C * 1.8 + 32`

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{thermostat_id}",
        "schema": [
          {
            "code": "temp_current",
            "onGet": "Math.round((value - 32) / 1.8)",
            "onSet": "Math.round(value * 1.8 + 32)"
          }
        ]
      }
    ]
  }
}
```

---

### 11. Reverse Curtain Direction

Reverse curtain open/close if motor direction is backwards.

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{curtain_id}",
        "schema": [
          {
            "code": "percent_control",
            "onGet": "(100 - value)",
            "onSet": "(100 - value)"
          },
          {
            "code": "percent_state",
            "onGet": "(100 - value)"
          }
        ]
      }
    ]
  }
}
```

**Alternative:** Most Tuya devices have a "reverse" setting in the Tuya app — use that first.

---

### 12. Fix Double-Brightness Issue

Skip on/off command when brightness slider is touched (prevents sending duplicate commands).

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{dimmer_id}",
        "schema": [
          {
            "code": "switch_led",
            "onSet": "(value === device.status.find(s => s.code === 'switch_led').value) ? undefined : value"
          }
        ]
      }
    ]
  }
}
```

---

### 13. Handle Half-Degree Temperature

Device stores double the value to preserve decimal (e.g., `41` = `20.5°C`).

```json
{
  "options": {
    "deviceOverrides": [
      {
        "id": "{device_id}",
        "schema": [
          {
            "code": "temp_set",
            "onGet": "(value * 5)",
            "onSet": "(value / 5)",
            "property": {
              "min": 50,
              "max": 350,
              "scale": 1,
              "step": 5
            }
          }
        ]
      }
    ]
  }
}
```

---

## Troubleshooting

### "onGet is not a function" Error

**Issue:** Syntax error in JavaScript transformation.

**Solution:** Check your `onGet`/`onSet` code:
```json
{
  "onGet": "Math.round(value / 2)",  // ✅ Correct
  "onGet": "Math.round(value / 2);"  // ❌ Don't add semicolon
}
```

### Device Not Responding to Commands

**Issue:** `onSet` returns `undefined`, skipping the command.

**Solution:** Ensure `onSet` returns a value:
```json
{
  "onSet": "value ? 1 : 0"  // ✅ Returns 0 or 1
}
```

### Device Appears Twice in HomeKit

**Issue:** Product-level override conflicts with device-level.

**Solution:** Use device ID for specificity:
```json
{
  "id": "bf1234567890abcd"  // ✅ Device ID (specific)
}
```
Rather than:
```json
{
  "id": "dzxsq0rnibq6szvq"  // Product ID (all devices of type)
}
```

### Changes Not Taking Effect

**Solution:** Clear HomeKit accessories cache and restart Homebridge:
```bash
rm -rf ~/.homebridge/persist/AccessoryInfo.*.json
systemctl --user restart homebridge
```

---

## Advanced: Complex Transformations

### Conditional Logic

```json
{
  "onGet": "(value === 0) ? 'off' : (value < 50) ? 'low' : 'high'"
}
```

### Using Device State

```json
{
  "onGet": "device.status.find(s => s.code === 'power').value ? value : 0"
}
```

### Complex Math

```json
{
  "onGet": "Math.max(0, Math.min(100, Math.round(value * 1.25)))"
}
```

---

## Resources

- 📖 [Tuya Standard Instruction Set](https://developer.tuya.com/en/docs/iot/standarddescription?id=K9i5ql6waswzq)
- 🔧 [TuyaDevice.ts Source](./src/cloud/device/TuyaDevice.ts) — See `TuyaDeviceSchemaProperty`
- 📱 [Supported Devices](./SUPPORTED_DEVICES.md)
- 💬 [GitHub Issues](https://github.com/homebridge-plugins/homebridge-tuya/issues)

---

## Contributing Device Configs

If you create a working device override, consider sharing it! Open an issue or pull request with:

1. Device model and category
2. Your device override config
3. Explanation of what it fixes

This helps other users with the same device.
