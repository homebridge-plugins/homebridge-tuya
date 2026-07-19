import {
  TuyaDeviceSchema,
  TuyaDeviceSchemaMode,
  TuyaDeviceSchemaProperty,
  TuyaDeviceSchemaType,
  TuyaDeviceStatus,
  TuyaIRRemoteKeyListItem,
} from '../../cloud/device/TuyaDevice';
import { internalCodeToBase64 } from '../util/InfraredTool';
import BaseAccessory from './BaseAccessory';
import { configureName } from './characteristic/Name';

export interface IRKeyItemMap {
  key_name: string, // key_name of IRKey
  dp_code: string,  // dpCode of Accessory
  defaultValue: boolean | string | number | object, // IR devices, operations are essentially Write-only
  type?: TuyaDeviceSchemaType,
  property?: TuyaDeviceSchemaProperty,
}

type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * An adapter that associates the learned IR codes with the schema information of
 *  an existing accessory. It maps IR code key_names (UI button labels)
 *  to the accessory’s dpCodes when they match.
 */
export function IRAdapter<TBase extends Constructor<BaseAccessory>>(Base: TBase) {
  return class extends Base {
    private tid:NodeJS.Timeout | undefined;
    private associatedIRRemoteKey: TuyaIRRemoteKeyListItem[] = [];

    override configureServices() {
      super.configureServices();
      // create a virtual switch for IR learning, which is not associated with any dpCode.
      for (const keyItem of this.device.remote_keys?.key_list || []) {
        if (!this.associatedIRRemoteKey.includes(keyItem)) {
          this.configureSwitch(keyItem);
        }
      }
    }

    override getSchema(...codes: string[]): TuyaDeviceSchema | undefined {
      const keyItem = this.resolveKeyListItem(codes);
      if (keyItem) {
        return this.createIRSchema(keyItem);
      } else {
        return undefined;
      }
    }

    // For IR devices, operations are essentially Write-only,
    //  and getStatus is primarily called as a Read (onGet). As a result, this value is displayed as a fixed value in the UI.
    override getStatus(code: string): TuyaDeviceStatus | undefined {
      return this.createIRStatus(code);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override async sendCommands(commands: TuyaDeviceStatus[], debounce?: boolean): Promise<boolean> {
      const codes = commands.map(command => command.code);
      const keyItem = this.resolveKeyListItem(codes);
      this.sendInfraredCommands(keyItem!);
      return true;
    }

    getKeyItemMaps() : IRKeyItemMap[] {
      return [];
    }

    resolveKeyListItem(codes: string[]) : TuyaIRRemoteKeyListItem | undefined {
      const keyItemMap = this.getKeyItemMaps().find(i => codes.includes(i.dp_code));
      let remoteKeyItem: TuyaIRRemoteKeyListItem | undefined = undefined;
      if (keyItemMap) {
        // eslint-disable-next-line max-len
        remoteKeyItem = this.device.remote_keys?.key_list.find(key => key.key_name === keyItemMap.key_name || key.key_name === keyItemMap.dp_code);
      } else {
        remoteKeyItem = this.device.remote_keys?.key_list.find(key => codes.includes(key.key_name));
      }
      if (remoteKeyItem) {
        if (!this.associatedIRRemoteKey.includes(remoteKeyItem)) {
          this.associatedIRRemoteKey.push(remoteKeyItem);
        }
      }
      return remoteKeyItem;
    }

    createIRSchema(keyItem : TuyaIRRemoteKeyListItem): TuyaDeviceSchema {
      const keyItemMap = this.getKeyItemMaps().find(i => i.key_name === keyItem.key_name);
      if (this.isSubDevice()) {
        return {
          code: keyItem.key_name,
          mode: TuyaDeviceSchemaMode.WRITE_ONLY,
          type: keyItemMap?.type || TuyaDeviceSchemaType.Boolean,
          property: keyItemMap?.property || this.getDefaultSchemaProperty(keyItemMap?.type || TuyaDeviceSchemaType.Boolean),
        };
      } else {
        // todo
        return {
          code: keyItem.key_name,
          mode: TuyaDeviceSchemaMode.WRITE_ONLY,
          type: keyItemMap?.type || TuyaDeviceSchemaType.Boolean,
          property: keyItemMap?.property || this.getDefaultSchemaProperty(keyItemMap?.type || TuyaDeviceSchemaType.Boolean),
        };
      }
    }

    createIRStatus(code: string): TuyaDeviceStatus | undefined {
      return {
        code: code,
        value: this.resolveSchemaTypeDefaultValue(code),
      };
    }


    resolveSchemaTypeDefaultValue(code: string) : any {
      const keyItemMap = this.getKeyItemMaps().find(i => i.dp_code === code);
      if (keyItemMap) {
        return keyItemMap.defaultValue;
      } else {
        return false;
      }
    }

    async sendInfraredCommands(key: TuyaIRRemoteKeyListItem) : Promise<boolean> {
      if (this.tid) {
        clearTimeout(this.tid);
      }
      this.tid = setTimeout(this._sendInfraredCommands.bind(this, key), 500);
      return true;
    }

    async _sendInfraredCommands(key: TuyaIRRemoteKeyListItem) {
      const { parent_id, id } = this.device;
      const { category_id, remote_index } = this.device.remote_keys!;
      if (key.learning_code) {
        const buffer = internalCodeToBase64(key.learning_code, { trimPadding: true, endian: 'LE' });
        const commands:TuyaDeviceStatus[] = [{ 'code': 'key_data', 'value': buffer }];
        await this.deviceManager.sendCommands(parent_id || id, commands);
      } else {
        await this.deviceManager.sendInfraredCommands(parent_id!, id, category_id, remote_index, key.key, key.key_id);
      }
    }

    isSubDevice() {
      return !!this.device.parent_id;
    }

    getDefaultSchemaProperty(schemaType: TuyaDeviceSchemaType): TuyaDeviceSchemaProperty {
      switch (schemaType) {
        case TuyaDeviceSchemaType.Boolean:
          return {};
        case TuyaDeviceSchemaType.Integer:
          return {
            min: 0,
            max: 100,
            scale: 0,
            step: 1,
            unit: '%',
          };
        case TuyaDeviceSchemaType.Enum:
          return {
            range: [0, 1],
          };
        case TuyaDeviceSchemaType.String:
          return {};
        case TuyaDeviceSchemaType.Json:
          return {};
        default:
          return {};
      }
    }

    configureSwitch(key: TuyaIRRemoteKeyListItem) {
      const service = this.accessory.getService(key.key)
        || this.accessory.addService(this.Service.Switch, key.key, key.key);

      configureName(this, service, key.key_name);

      service.getCharacteristic(this.Characteristic.On)
        .onGet(() => false)
        .onSet(async value => {
          if (value === false) {
            return;
          }

          this.sendInfraredCommands(key);
          setTimeout(() => {
            service.getCharacteristic(this.Characteristic.On).updateValue(false);
          }, 150);
        });
    }
  };
}

