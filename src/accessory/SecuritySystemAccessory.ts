import type { PlatformAccessory } from 'homebridge';
import type { TuyaPlatform } from '../platform';
import BaseAccessory from './BaseAccessory';
import { configureSecuritySystemCurrentState, configureSecuritySystemTargetState } from './characteristic/SecuritySystemState';
import { configureName } from './characteristic/Name';

const SCHEMA_CODE = {
  MASTER_MODE: ['master_mode'],
  SOS_STATE: ['sos_state'],
};

export default class SecuritySystemAccessory extends BaseAccessory {

  isNightArm: boolean;

  constructor(platform: TuyaPlatform, accessory: PlatformAccessory) {
    super(platform, accessory);
    this.isNightArm = false;
  }

  requiredSchema() {
    return [SCHEMA_CODE.MASTER_MODE, SCHEMA_CODE.SOS_STATE];
  }

  configureServices() {
    const service = this.accessory.getService(this.Service.SecuritySystem)
      || this.accessory.addService(this.Service.SecuritySystem);

    configureName(this, service, this.device.name);

    configureSecuritySystemCurrentState(this, service, this.getSchema(...SCHEMA_CODE.MASTER_MODE),
      this.getSchema(...SCHEMA_CODE.SOS_STATE));
    configureSecuritySystemTargetState(this, service, this.getSchema(...SCHEMA_CODE.MASTER_MODE),
      this.getSchema(...SCHEMA_CODE.SOS_STATE));
  }
}
