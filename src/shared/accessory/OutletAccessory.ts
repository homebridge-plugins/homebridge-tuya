import { configureOutletInUse } from './characteristic/OutletInUse';
import { TuyaDeviceSchema } from '../../cloud/device/TuyaDevice';
import SwitchAccessory from './SwitchAccessory';

const SCHEMA_CODE = {
  CURRENT: ['cur_current'],
};
export default class OutletAccessory extends SwitchAccessory {
  override mainService() {
    return this.Service.Outlet;
  }

  override configureSwitch(schema: TuyaDeviceSchema, name: string) {
    super.configureSwitch(schema, name);
    const service = this.accessory.getService(schema.code)
      || this.accessory.addService(this.mainService(), name, schema.code);
    configureOutletInUse(this, service, this.getSchema(...SCHEMA_CODE.CURRENT));
  }
}
