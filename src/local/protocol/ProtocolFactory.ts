/**
 * Factory for creating protocol handlers based on device version
 */
import { Protocol } from './Protocol';
import { ProtocolV31V32 } from './ProtocolV31V32';
import { ProtocolV33 } from './ProtocolV33';
import { ProtocolV34 } from './ProtocolV34';
import { ProtocolV35 } from './ProtocolV35';

export class ProtocolFactory {
  static createProtocol(version: string): Protocol {
    switch (version) {
      case '3.1':
        return new ProtocolV31V32('3.1');
      case '3.2':
        return new ProtocolV31V32('3.2');
      case '3.3':
        return new ProtocolV33();
      case '3.4':
        return new ProtocolV34();
      case '3.5':
        return new ProtocolV35();
      default:
        throw new Error(`Unsupported protocol version: ${version}`);
    }
  }
}
