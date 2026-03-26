/**
 * Base protocol interface for Tuya local device communication.
 * Implementations handle version-specific encryption, framing, and key exchange.
 */
export interface Protocol {
  /**
   * Send raw frame data to device.
   * @param sessionKey  Post-exchange session key (v3.4/v3.5 only).
   * @param deviceKey   Real device local key; required by v3.4 during key exchange.
   * @returns Encoded buffer ready to write to socket.
   */
  encodeFrame(cmd: number, data: Buffer, seqNo: number, sessionKey?: Buffer, deviceKey?: Buffer): Buffer;

  /**
   * Decode incoming frame data from device.
   * @returns Decoded payload object or null if frame incomplete/invalid.
   */
  decodeFrame(frame: Buffer, deviceKey: Buffer, sessionKey?: Buffer): { cmd: number; payload: Buffer } | null;

  /**
   * Check if a frame is complete and ready to process.
   * @returns true if frame is complete, false if more data needed.
   */
  isFrameComplete(buffer: Buffer): boolean;

  /**
   * Extract complete frame from buffer.
   * @returns Frame buffer and remaining buffer, or null if incomplete.
   */
  extractFrame(buffer: Buffer): { frame: Buffer; remaining: Buffer } | null;

  /**
   * Perform key exchange if required by protocol version.
   * @returns Updated session key after exchange, or undefined if no exchange needed.
   */
  performKeyExchange?(
    incomingData: Buffer,
    localKey: Buffer,
    deviceKey: Buffer,
    sessionKey?: Buffer,
  ): { sessionKey?: Buffer; remoteKey?: Buffer } | null;
}
