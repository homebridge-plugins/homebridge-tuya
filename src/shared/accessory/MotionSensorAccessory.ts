import BaseAccessory from './BaseAccessory';
import { configureMotionDetected } from './characteristic/MotionDetected';

const SCHEMA_CODE = {
  PIR: ['pir'],
};

export default class MotionSensorAccessory extends BaseAccessory {

  override requiredSchema() {
    return [SCHEMA_CODE.PIR];
  }

  override configureServices() {
    configureMotionDetected(this, undefined, this.getSchema(...SCHEMA_CODE.PIR));
  }

}
