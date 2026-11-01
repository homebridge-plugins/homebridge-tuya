# Advanced Options

**During the beta version, the options are unstable, may get changed during updates.**

The main function of `deviceOverrides` is to convert "non-standard schema" to "standard schema", making the device compatible with this plugin.

Before configuring, you may need to:
- Have basic programming skills in JavaScript (Only used in `onGet`/`onSet` handlers).
- Understand the concept of device schema (also known as Data Type): [Tuya IoT Development Platform > Cloud Development > Standard Instruction Set > Data Type](https://developer.tuya.com/en/docs/iot/datatypedescription?id=K9i5ql2jo7j1k)
- Read the documentation of your device product in [SUPPORTED_DEVICES.md](./SUPPORTED_DEVICES.md).
- Obtain device info json from `/path/to/persist/TuyaDeviceList.xxx.json` (the full path can be found from logs).
- Locate any "incorrect schema" in your device info json, and convert it to the "correct schema".


### Configuration

`options.deviceOverrides` is an **optional** array of device overriding config objects, which is used for converting "non-standard schema" to "standard schema", making the device compatible with this plugin. The structure of each element in the array is described as follows:

- `id` - **required**: Device ID, Product ID, Scene ID, or `global`.
- `category` - **optional**: Device category code. See [SUPPORTED_DEVICES.md](./SUPPORTED_DEVICES.md). Also you can use `hidden` to hide the device, product, or scene. **⚠️Overriding this property may lead to unexpected behaviors and exceptions, so please remove the accessory cache after making changes.**
- `unbridged` - **optional**: Unbridge accessories. Defaults to `false`.
- `adaptiveLighting` - **optional**: Adaptive Lighting. Defaults to `false`. Not all light device support this feature, please use it on demand.
- `addExtraFeaturesAutomatically` - **optional**: Automatically expose supported read/write datapoints that are not used by the standard accessory as extra HomeKit services. Boolean datapoints are exposed as switches, Enum datapoints as switches for their available values, and Integer datapoints as sliders. Defaults to `false`.
- `garageDoorUseContactSensorForState` - **optional**: For garage door controllers. When `true`, `CurrentDoorState` and `TargetDoorState` reads use `doorcontact_state` only, while set commands still use `switch_1`. Defaults to `false`.
- `et72gwCloudMeasurements` - **optional**: Opt in a supported ET-72GW device to measured floor temperature and actual heating activity. See [ET-72GW cloud measurements](#et-72gw-measured-floor-temperature-and-heating-activity).
- `schema` - **optional**: An array of schema overriding config objects, used for describing datapoint (DP). When your device has non-standard DP, you need to transform them manually with configuration. Each element in the schema array is described as follows:
  - `code` - **required**: DP code.
  - `newCode` - **optional**: New DP code.
  - `type` - **optional**: New DP type. One of `Boolean`, `Integer`, `Enum`, `String`, `Json`, or `Raw`.
  - `property` - **optional**: New DP property object. For `Integer` type, the object should contain `min`, `max`, `scale`, and `step`. For `Enum` type, the object should contain `range`. For more information, see `TuyaDeviceSchemaProperty` in [TuyaDevice.ts](./src/device/TuyaDevice.ts).
  - `onGet` - **optional**: A one-line JavaScript code to convert the old value to the new value. The function is called with two arguments: `device` and `value`.
  - `onSet` - **optional**: A one-line JavaScript code to convert the new value to the old value. The function is called with two arguments: `device` and `value`. Returning `undefined` means to skip sending the command.
  - `hidden` - **optional**: Hide the schema. Defaults to `false`.


## Examples

### Change category code

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "category": "xxx"
    }]
  }
}
```

### Hide device / scene

Just the same way as changing category code.

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id_or_scene_id}",
      "category": "hidden"
    }]
  }
}
```

### Hide DP

An example of hide camera's floodlight (`floodlight_switch`):
```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "floodlight_switch",
        "hidden": true
      }]
    }]
  }
}
```

### Enable Adaptive Lighting

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "adaptiveLighting": true
    }]
  }
}
```

### Automatically add manufacturer-specific features

Some devices expose manufacturer-specific datapoints that are not included in Tuya's standard device definition. Set `addExtraFeaturesAutomatically` to `true` for the device to expose supported read/write non-standard datapoints in HomeKit.

```json
{
  "options": {
    "deviceOverrides": [{
      "id": "{device_id}",
      "addExtraFeaturesAutomatically": true
    }]
  }
}
```

Boolean datapoints are added as switches, Enum datapoints are added as switches for their available values, and Integer datapoints are added as sliders. The option applies only to the device specified by `id` and leaves the standard accessory controls unchanged. Raw datapoints require an `extraRawSwitch` definition because their individual bit or byte meanings cannot be inferred automatically.

### Use garage door contact sensor for state

Some `ckmkzq` garage door controllers keep `switch_1` as `true`, which can make HomeKit show the door as stuck Opening or Closing. Enable this per-device option to read the door state from `doorcontact_state`, while commands are still sent to `switch_1`.

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "garageDoorUseContactSensorForState": true
    }]
  }
}
```


### Offline as off

If you want to display off status when device is offline:
```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "{dp_code}",
        "onGet": "(device.online && value)"
      }]
    }]
  }
}
```


### Change DP code

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
          "code": "{old_dp_code}",
          "newCode": "{new_dp_code}"
      }]
    }]
  }
}
```


### Convert from enum DP to boolean DP

An example of convert `open`/`close` into `true`/`false`:
```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "{dp_code}",
        "type": "Boolean",
        "onGet": "(value === 'open') ? true : false;",
        "onSet": "(value === true) ? 'open' : 'close';"
      }]
    }]
  }
}
```


### Adjust integer DP ranges

Some odd thermostat stores double of the real value to keep the decimal part (0.5°C).

We need override both range and value in order to make it working. (Only override value is not enough, range is required too.)

Here's an example of the invalid schema:
```js
{
  code: 'temp_set',
  mode: 'rw',
  type: 'Integer',
  property: { unit: '℃', min: 10, max: 70, scale: 1, step: 5 }
}
```

The value `41` actually represents for `20.5°C`, the range `10~70` actually represents for `5.0°C~35.0°C`.

To fix this, first we need set scale to `1`, and convert `41` to `205` when getting, convert `205` to `41` when getting, which means `value x 5` when getting, and `value / 5` when setting.

Here's the example config:
```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "temp_set",
        "onGet": "(value * 5);",
        "onSet": "(value / 5);",
        "property": {
          "min": 50,
          "max": 350,
          "scale": 1,
          "step": 5
        }
      }]
    }]
  }
}
```

After transform value using `onGet` and `onSet`, and new range in `property`, it should be working now.


### Reverse curtain motor's on/off state

Most curtain motor have "reverse mode" setting in the Tuya App, if you don't have this, you can reverse `percent_control`/`position` and `percent_state` in the plugin config:

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "percent_control",
        "onGet": "(100 - value)",
        "onSet": "(100 - value)"
      }, {
        "code": "percent_state",
        "onGet": "(100 - value)",
        "onSet": "(100 - value)"
      }]
    }]
  }
}
```

### Set an offset for the device’s status value.

Some devices return status values without applying any offset, so we override onGet and onSet to apply a custom offset.
For example, if you want to apply an offset of `+10` to the `temperature` dpCode.

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "temperature",
        "onGet": "(value + 10)",
        "onSet": "(value - 10)"
      }]
    }]
  }
}
```

### Skip send on/off command when touching brightness/speed slider

Some products (dimmer, fan) having issue when sending brightness/speed command with on/off command together. Here's an example of skip on/off command.

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "switch_led",
        "onSet": "(value === device.status.find(status => status.code === 'switch_led').value) ? undefined : value"
      }]
    }]
  }
}
```


### Convert Fahrenheit to Celsius

F = 1.8 * C + 32

C = (F - 32) / 1.8

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{
        "code": "temp_current",
        "onGet": "Math.round((value - 32) / 1.8);",
        "onSet": "Math.round(1.8 * value + 32);"
      }]
    }]
  }
}
```

### ET-72GW measured floor temperature and heating activity

HEATIT/Jiahong ET-72GW thermostats with product ID `m2dkohai78cwr3yd` can expose a target setpoint through Tuya's standard device status while their actual floor sensor and relay state are available only through the cloud property-shadow API. Enable `et72gwCloudMeasurements` on an override whose `id` is the thermostat's actual **device ID**. Product, UUID and `global` overrides do not activate it. Other product IDs are not enabled automatically because their property mappings have not been verified.

```json
{
  "options": {
    "deviceOverrides": [{
      "id": "your-et72gw-device-id",
      "et72gwCloudMeasurements": {
        "enabled": true,
        "pollIntervalSeconds": 180,
        "maxCacheAgeSeconds": 900,
        "maxReportAgeSeconds": 0,
        "maxHeatingReportAgeSeconds": 0
      }
    }]
  }
}
```

Merge the option into your existing device override; retain any `schema` entries, including existing `temp_set` conversion handlers. The option changes only `CurrentTemperature` and `CurrentHeatingCoolingState`. Target temperature, target mode, display-unit configuration, commands, accessory identity and pairing retain their existing behavior. When disabled or omitted, no shadow requests are made and existing thermostat behavior is unchanged. No accessory cache reset or re-pairing is needed.

The adapter uses one `GET /v2.0/cloud/thing/{device_id}/shadow/properties` for both measurements, through the plugin's existing authenticated API client:

| Cloud property | DP | Interpretation |
| --- | --- | --- |
| `FloorTemper` | 106 | Measured floor temperature, divided by 10 |
| `TemperUnitChange` | 107 | Boolean: `true` Fahrenheit, `false` Celsius |
| `work_status` | 118 | Boolean: `true` heating, `false` idle |
| `power1` | 101 | Boolean thermostat power; power off reports current activity OFF |

HomeKit always receives Celsius: for example, `FloorTemper = 820` with Fahrenheit selected represents 82°F, approximately 27.8°C. `RoomTemper`/105 and `SetTemp`/102 are not used as floor-temperature substitutes. Idle maps to HomeKit's current OFF state without turning off the configured operating mode. Heating activity is never inferred by comparing current and target temperatures.

| Setting | Default | Range/meaning |
| --- | --- | --- |
| `enabled` | `false` | Explicit per-device opt-in |
| `pollIntervalSeconds` | `300` | Integer 60–3600 seconds between attempts; example above chooses 180 |
| `maxCacheAgeSeconds` | `900` | Integer 60–86400; maximum age since a successful validated retrieval |
| `maxReportAgeSeconds` | `0` | Integer 0–604800; optional maximum floor-property report age; 0 disables this check |
| `maxHeatingReportAgeSeconds` | `0` | Integer 0–604800; optional maximum relay-property report age; 0 disables this check |

One request starts when the accessory is configured, followed by interval-based polling. Concurrent refreshes share the same request. HomeKit reads use the cache and do not trigger HTTP requests. Polling stops when the accessory is removed or Homebridge shuts down. Each request has a 10-second total deadline and a 256 KiB response limit, with no immediate retry, redirect, login or token refresh. Normal plugin session management remains responsible for authentication. HTTP rate limiting uses `Retry-After` (numeric seconds or HTTP date, capped at one day) and the normal cooldown; late timers do not cause catch-up bursts. Authorization rejection makes measurements unavailable and stops this polling instance; resolve cloud permissions/subscription/session issues before restarting the child bridge.

For one continuously online thermostat, 120/180/300-second polling adds approximately **21,600/14,400/8,640 calls per 30 days**, respectively, plus the plugin's other API traffic. Check your own Tuya project allowance and subscription; successful authentication does not establish sufficient monthly capacity. Multiple opted-in devices consume their own polling budgets. The conservative default is 300 seconds; 180 seconds has also been observed working in production.

Tuya property timestamps are last-reported timestamps, not the HTTP retrieval time. A stable temperature, power setting or relay state may retain an old timestamp across successful requests. Default zero report-age limits accept that last reported state while independently enforcing retrieval-cache age. This does not prove physical sensor liveness. Select stricter report ages if needed, accepting that legitimately stable reports can become unavailable. Persistent unit/power metadata may be older than the measurement; a newer unit report cannot reinterpret an older floor sample, and a newer power-on report cannot resurrect an older relay state.

Missing, duplicated, conflicting, malformed, future or regressed properties invalidate the affected measurement independently. Offline devices report unavailable. Transport/session failures retain a valid cached value only until its configured expiry; authorization rejection invalidates both measurements immediately. Unavailable values use HomeKit's communication-failure status, never zero, the setpoint or an inferred heating state. Changed measurements explicitly update the existing HomeKit characteristics. Logs contain fixed failure categories on changes and a recovery message, without raw cloud responses or credentials.
