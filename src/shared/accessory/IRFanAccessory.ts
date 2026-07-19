import { PlatformAccessory } from 'homebridge';
import { TuyaDeviceSchemaType, TuyaDeviceStatus } from '../../cloud/device/TuyaDevice';
import { TuyaPlatform, TuyaPluginAccessoryContext } from '../../platform';
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
    },
  },
];
const LEARNING_KEY_NAMES = {
  FAN_SPEED_UP: 'fan_speed_up',
  FAN_SPEED_DOWN: 'fan_speed_down',
}

export default class IRFanAccessory extends IRAdapter(FanAccessory) {
  private powerMap = KEY_ITEM_MAPS.find(i => i.key_name === 'power')!;

  constructor(
    public override readonly platform: TuyaPlatform,
    public override readonly accessory: PlatformAccessory<TuyaPluginAccessoryContext>,
  ) {
    super(platform, accessory);
    const fanSpeedMap = KEY_ITEM_MAPS.find(i => i.key_name === 'fan_speed');
    const fanSpeed = this.resolveKeyListItem(['fan_speed']);
    // custom key_name for fan_speed_up and fan_speed_down.
    // IR Learning may not control the fan speed directly, but can control the fan speed up and down.
    const fanSpeedUp = this.resolveKeyListItem([LEARNING_KEY_NAMES.FAN_SPEED_UP]);
    const fanSpeedDown = this.resolveKeyListItem([LEARNING_KEY_NAMES.FAN_SPEED_DOWN]);
    if (!fanSpeed && fanSpeedMap) {
      fanSpeedMap.key_name = fanSpeedUp?.key_name || fanSpeedDown?.key_name || fanSpeedMap.key_name;
    }
  }

  override async sendCommands(commands: TuyaDeviceStatus[], debounce?: boolean): Promise<boolean> {
    this.powerMap.defaultValue = true;
    const codes = commands.map(command => command.code);
    const keyItemMap = this.getKeyItemMaps().find(i => codes.includes(i.key_name) || codes.includes(i.dp_code));

    if ([LEARNING_KEY_NAMES.FAN_SPEED_UP, LEARNING_KEY_NAMES.FAN_SPEED_DOWN].includes(keyItemMap?.key_name || '')) {
      const value = commands.find(command => keyItemMap?.key_name === command.code)?.value as number ?? 50;
      const defaultValue = keyItemMap?.defaultValue as number ?? 50;
      this.powerMap.defaultValue = value !== 0;
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
