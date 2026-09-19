import BaseAccessory from './BaseAccessory';
import { configureCurrentPosition } from './characteristic/CurrentPosition';
import { configurePositionState, configurePositionStateByPosition } from './characteristic/PositionState';
import { configureTargetPosition } from './characteristic/TargetPosition';

const SCHEMA_CODE = [
  {
    NAME : 'control',
    TARGET_POSITION_CONTROL: ['work_state', 'control', 'mach_operate'],
    TARGET_POSITION_PERCENT: ['percent_control', 'position'],
    CONTROL_BACK: ['control_back_mode', 'control_back', 'opposite'],
    CURRENT_POSITION_PERCENT: ['percent_state'],
  },
  {
    NAME : 'control_2',
    TARGET_POSITION_CONTROL: ['work_state2', 'control_2', 'mach_operate'],
    TARGET_POSITION_PERCENT: ['percent_control_2', 'position'],
    CONTROL_BACK: ['control_back_mode', 'control_back'],
    CURRENT_POSITION_PERCENT: ['percent_state'],
  },
];

export default class WindowCoveringAccessory extends BaseAccessory {

  requiredSchema() {
    // HAP mandates the presence of Current Position, Position State, and Target Position.
    // Because altering this logic may cause some devices to malfunction, the implementation will remain as it is.
    // return [SCHEMA_CODE[0].TARGET_POSITION_CONTROL];//, SCHEMA_CODE[1].TARGET_POSITION_CONTROL];
    return [];
  }

  configureServices() {
    let amount = 1;
    const schema = this.getSchema('control_2');
    if (schema) {
      amount = 2;
    }
    this.log.info('Curtain amount:', amount);
    for (let i = 0; i < amount; i++) {
      const service = this.accessory.getService(SCHEMA_CODE[i].NAME) ||
        this.accessory.addService(this.Service.WindowCovering, SCHEMA_CODE[i].NAME, SCHEMA_CODE[i].NAME);
      configureCurrentPosition(
        this,
        service,
        this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION_PERCENT, ...SCHEMA_CODE[i].TARGET_POSITION_PERCENT),
        this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
      );

      if (this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL)) {
        configurePositionState(
          this,
          service,
          this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
        );
      } else {
        this.log.warn('configurePositionStateByPosition');
        configurePositionStateByPosition(
          this,
          service,
          this.getSchema(...SCHEMA_CODE[i].CURRENT_POSITION_PERCENT),
          this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT),
        );
      }

      configureTargetPosition(
        this,
        service,
        this.getSchema(...SCHEMA_CODE[i].TARGET_POSITION_PERCENT, ...SCHEMA_CODE[i].TARGET_POSITION_CONTROL),
      );
    }
  }
}
