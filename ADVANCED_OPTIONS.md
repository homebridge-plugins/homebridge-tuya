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
- `garageDoorTiming` - **optional**: For garage door controllers without a door contact sensor. An object with `opening`, `open` and `closing` in seconds (defaults 12, 20, 12). See [Timed garage door state](#timed-garage-door-state).
- `lockTiming` - **optional**: For locks that don't report their state. An object with `unlocked` in seconds; `0` or `-1` uses the lock's `auto_lock_time` + 1s. See [Timed lock state](#timed-lock-state).
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


### Timed garage door state

Some `ckmkzq` controllers are a relay that pulses an opener and have no door contact sensor (or one that never changes). HomeKit then can't know whether the door is open. With `garageDoorTiming`, Open sends a single pulse and HomeKit shows Opening, Open, Closing and Closed on the timings you set. Close sends nothing, because a second pulse would start the motor again; it only resets the tile to Closed. Presses from the Tuya app or a scene run the same cycle.

The option takes effect only when the device has no `doorcontact_state`. If it has one that doesn't work, hide it:

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "schema": [{ "code": "doorcontact_state", "hidden": true }],
      "garageDoorTiming": { "opening": 8, "open": 17, "closing": 8 }
    }]
  }
}
```


### Timed lock state

Some locks (for example Bluetooth key boxes behind a gateway) unlock remotely but never report whether they are locked, so the tile stays on Unlocking. With `lockTiming`, an unlock from HomeKit shows Unlocked for `unlocked` seconds and then Locked. Locking from HomeKit sends nothing, because the lock relocks itself. Unlocks the lock reports through its `unlock_*` record DPs (fingerprint, card, password, app) run the same cycle.

```js
{
  "options": {
    // ...
    "deviceOverrides": [{
      "id": "{device_id}",
      "lockTiming": { "unlocked": -1 }
    }]
  }
}
```

`-1` (or `0`) follows the lock's own `auto_lock_time` plus one second.


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

HEATIT/Jiahong ET-72GW thermostats with verified product ID **`m2dkohai78cwr3yd`** are automatically recognized by `AccessoryFactory` before the generic category resolver. The dedicated `ET72GWAccessory` needs **no device override or feature option**. Other product IDs continue to use their existing category accessory; other ET-72GW variants are not assumed to share this profile. No cache reset or re-pairing is required.

The dedicated accessory retains the existing accessory/service identities and maps the verified product's operating modes. It supplies the measured floor temperature and actual heating activity from one bounded `GET /v2.0/cloud/thing/{device_id}/shadow/properties` through the existing authenticated API client:

| Cloud property | DP | Interpretation |
| --- | --- | --- |
| `FloorTemper` | 106 | Floor temperature in tenths of the device's unit |
| `TemperUnitChange` | 107 | Boolean: `true` Fahrenheit, `false` Celsius |
| `work_status` | 118 | Boolean: `true` heating, `false` idle |
| `power1` | 101 | Thermostat power; power off reports current and target state OFF |
| `ControlMode` | 103 | `Smart` = HomeKit Auto; `Manual` = HomeKit Heat |

HomeKit receives Celsius. For example, `FloorTemper = 820` with Fahrenheit selected is 82°F, approximately 27.8°C. Room temperature and the setpoint are never used as substitutes for a missing floor reading. Idle means HomeKit's **current** heating state is OFF; it does not change the thermostat's configured target mode. Heating activity is never inferred from target/current temperature comparisons.

**Auto** follows the thermostat's internal weekly schedule. **Heat** selects its Manual mode, suitable when Apple Home automations manage the target temperature; it does not mean the relay is continuously active. Relay activity still comes independently from DP118. HomeKit has no standard Manual label. Unsupported modes (including frost protection) are unavailable rather than misreported as Auto or Cool.

Explicit HomeKit Heat/Auto selections send one bounded `POST /v2.0/cloud/thing/{device_id}/shadow/properties/issue` with JSON-string `properties` containing `ControlMode: "Manual"`/`"Smart"` and `power1: true` only when the validated power state or a just-issued Off command indicates power-on is needed. An already-powered thermostat receives only the requested `ControlMode`; an unavailable power cache prevents a guessed command. Off keeps the existing standard `switch: false` command without changing the stored mode. These commands never include DP102 or change the setpoint directly. Mode selection may itself invoke device firmware's schedule/hold behavior. The POST uses the current session, 10-second deadline and response cap, with no automatic retry, refresh or login. A timeout has an uncertain device outcome and is not retried automatically. [Tuya Send Property API](https://developer.tuya.com/en/docs/cloud/c057ad5cfd?id=Kcp2kxdzftp91).

On accessory setup, a service configuration-change notification lets HomeKit refresh its cached mode capabilities without removing/re-pairing the accessory. This is not emitted by measurement polling. Mode, power, floor and relay reports share the existing shadow GET and polling budget. Getters and notifications never send commands. Mode feedback is confirmed at the next scheduled read, without an extra post-command request; clients may show the previous reported mode until then. Mode cache expiry, malformed/duplicate/conflicting or regressing reports, and authorization failures produce unavailable state. An unchanged old mode timestamp is valid for a persistent setting. Mode transitions require no setpoint conversion override.

The verified target datapoint (`SetTemp`/102, exposed by standard status as `temp_set`) also uses native tenths. The generic target scaling alone does not convert Fahrenheit to Celsius; this accessory reads the reported `temp_unit_convert`/`c_f` value for conversion. For example, a native Fahrenheit setpoint of 800 is 80°F/26.6667°C, and a HomeKit target of 27.3°C writes 811 (81.1°F). Celsius setpoints use tenths directly. Writes round once to the device integer, preserving `Math.round(C * 10 * 9 / 5 + 320)` in Fahrenheit. No `temp_set` conversion override is needed. The advertised range metadata may remain Celsius while native values are Fahrenheit; range metadata and live value units are handled separately, retaining the existing HomeKit target limits. Unknown live units or invalid values make the target unavailable and prevent a native command.

Explicit schema `onGet`/`onSet` handlers remain supported independently through the existing override pipeline. Their converted values use the unit/scale in the effective schema (Celsius when the unit is omitted); the accessory does not convert them twice. Existing Celsius-conversion handlers can therefore remain in place, although they are no longer required. Unit/scale metadata must be valid for explicit conversion handlers.

Internal defaults are **300-second polling**, **900-second retrieval-cache lifetime**, and **no maximum age for unchanged last-reported property timestamps**. There are no ET-72GW public configuration fields. A recognized online device starts one read when configured, then polls at most once per interval; concurrent refreshes share one request. HomeKit getters read the cache. Polling stops on accessory removal, reconfiguration or Homebridge shutdown. One continuously online thermostat adds approximately **8,640 cloud API calls per 30 days**, plus existing plugin traffic. Check your Tuya project allowance, permissions and subscription: successful authentication does not prove sufficient monthly entitlement.

The reusable shadow reader has a 10-second total deadline and 256 KiB response limit, with no immediate HTTP retry, redirect, login or token refresh. Normal plugin authentication remains responsible for the session. HTTP rate limiting uses `Retry-After` (numeric seconds or HTTP date, capped at one day) and the normal polling cooldown. Late callbacks never trigger catch-up bursts. Authorization rejection invalidates measured values and stops that polling instance; resolve the cloud permission/session issue before restarting the child bridge. Target-temperature commands remain separate from the measurement cache; target mode uses the validated mode/power cache.

Cloud timestamps are last-reported timestamps, not HTTP retrieval times. A stable temperature, power setting or relay can retain an old timestamp across successful reads. This implementation accepts unchanged reports while enforcing retrieval-cache age; it does **not** independently prove physical sensor liveness. A newer unit report cannot reinterpret an older floor sample, while power and relay timestamps are independent: a newer power report does not invalidate an unchanged relay report. Heating activity uses the last-reported DP118 boolean gated by the last-reported power state. It is reported cloud activity, not an independently confirmed physical relay observation. [Tuya defines each timestamp as that property’s last update](https://developer.tuya.com/en/docs/cloud/116cc8bf6f?id=Kcp2kwfrpe719). Missing, malformed, duplicated, conflicting, future or regressed properties invalidate the affected measurement independently. Offline or unavailable measurements report HomeKit communication failure, never zero, the target setpoint or invented activity. Valid cached values can survive transport/session failures only until the 900-second retrieval lifetime expires. Changes explicitly update existing HomeKit characteristics. Failure/recovery logs contain fixed categories without raw responses or credentials.
