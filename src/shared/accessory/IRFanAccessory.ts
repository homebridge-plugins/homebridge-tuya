import { TuyaDeviceSchemaType, TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import FanAccessory from './FanAccessory';
import { IRAdapter, IRKeyItemMap } from './IRAdapter';

// IR Fan category id: 8
// https://openapi.tuyaus.com/v2.0/infrareds/8/base-key
// standard dpcode pairing, [ir, non-ir], If the key_name and dpCode match, the mapping entry can be omitted.
const KEY_ITEM_MAPS: IRKeyItemMap[] = [
  {
    key_name: 'power',
    dp_code: 'switch',
    defaultValue: false,
  },
  {
    key_name: 'fan_speed',
    dp_code: 'fan_speed',
    type: TuyaDeviceSchemaType.Integer,
    defaultValue: 50,
    property: {
      min: 0,
      max: 100,
      step: 50,
      scale: 0,
    },
  },
  {
    key_name: 'fan_speed_up',
    dp_code: 'fan_speed',
    type: TuyaDeviceSchemaType.Enum,
    defaultValue: 'default_position',
    property: {
      range: ['speed_down', 'default_position', 'speed_up'],
    },
  },
  {
    key_name: 'fan_speed_down',
    dp_code: 'fan_speed',
    type: TuyaDeviceSchemaType.Enum,
    defaultValue: 'default_position',
    property: {
      range: ['speed_down', 'default_position', 'speed_up'],
    },
  },
  {
    key_name: 'swing_mode',
    dp_code: 'switch_horizontal',
    defaultValue: 0,
    type: TuyaDeviceSchemaType.Integer,
    property: {
      min: 0,
      max: 1,
      step: 1,
      scale: 0,
    },
  },
];
const LEARNING_KEY_NAMES = {
  FAN_SPEED_UP: 'fan_speed_up',
  FAN_SPEED_DOWN: 'fan_speed_down',
}

export default class IRFanAccessory extends IRAdapter(FanAccessory) {
  private powerMap = KEY_ITEM_MAPS.find(i => i.key_name === 'power')!;

  override async sendCommands(commands: TuyaDeviceStatus[], debounce?: boolean): Promise<boolean> {
    this.powerMap.defaultValue = true;
    const codes = commands.map(command => command.code);
    const keyItemMap = this.getKeyItemMaps().find(i => codes.includes(i.key_name) || codes.includes(i.dp_code));

    if ([LEARNING_KEY_NAMES.FAN_SPEED_UP, LEARNING_KEY_NAMES.FAN_SPEED_DOWN].includes(keyItemMap?.key_name || '')) {
      const range = keyItemMap?.property?.['range'] ?? ['speed_down', 'default_position', 'speed_up'];
      const value = commands.find(command => keyItemMap?.key_name === command.code)?.value ?? Math.floor(range.length/2);
      // Rotation Speed for Enum adds status 'off' at index 0.
      const defaultValue = (range.indexOf(keyItemMap?.defaultValue) ?? Math.floor(range.length/2) + 1);
      this.powerMap.defaultValue = 0 !== value;
      // revert to default
      this.device.status.filter(_status => codes.includes(_status.code))
        .forEach(_status => _status.value = range.indexOf(keyItemMap?.defaultValue));
      if (value < defaultValue) {
        const speedDownKey = this.resolveKeyListItem([LEARNING_KEY_NAMES.FAN_SPEED_DOWN]);
        if (speedDownKey) {
          return super.sendInfraredCommands(speedDownKey);
        }
      } else if (defaultValue < value) {
        const speedUpKey = this.resolveKeyListItem([LEARNING_KEY_NAMES.FAN_SPEED_UP]);
        if (speedUpKey) {
          return super.sendInfraredCommands(speedUpKey);
        }
      } else {
        // nop
      }
    }

    if (codes.includes(this.powerMap.dp_code)) {
      this.powerMap.defaultValue = !this.powerMap.defaultValue;
    }

    return super.sendCommands(commands, debounce);
  }

  override getKeyItemMaps() : IRKeyItemMap[] {
    return KEY_ITEM_MAPS;
  }
}
