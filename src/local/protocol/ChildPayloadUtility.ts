/**
 * ChildPayloadUtility – helpers for Zigbee sub-device (gateway/child) payloads.
 *
 * Tuya gateways route commands to Zigbee sub-devices by embedding a CID
 * (Child ID, also called node_id) inside the normal DP-update payload.
 * The exact structure differs between protocol versions:
 *
 *   v3.3:  { cid: "0011…", dps: { "1": true } }
 *   v3.4+: { protocol: 5, data: { cid: "0011…", dps: { "1": true } } }
 *
 * This file also provides the inverse – extracting CID + DPS from a response
 * payload coming *from* the gateway on behalf of a child device.
 */

/** Protocol versions that support child (Zigbee sub-device) routing. */
export type SupportedChildProtocol = '3.3' | '3.4' | '3.5';

/** Parsed child data extracted from a gateway response. */
export interface ChildData {
  childId: string;
  dps: Record<string, unknown>;
}

/** CID regex: exactly 16 lowercase hexadecimal characters */
const CID_RE = /^[0-9a-f]{16}$/i;

export class ChildPayloadUtility {
  /**
   * Validate that a CID string conforms to the expected 16-hex-character format.
   */
  static isValidCid(cid: string): boolean {
    return CID_RE.test(cid);
  }

  /**
   * Build the DPS-update payload that the parent gateway forwards to a child.
   *
   * @param childId  Zigbee CID (16-char hex, e.g. "0011223344556601")
   * @param dps      DP values to set on the child, e.g. { "1": true, "2": 100 }
   * @param version  Protocol version of the *parent* gateway connection
   */
  static prepareChildPayload(
    childId: string,
    dps: Record<string, unknown>,
    version: SupportedChildProtocol,
  ): Record<string, unknown> {
    if (!ChildPayloadUtility.isValidCid(childId)) {
      throw new Error(`Invalid Zigbee CID "${childId}" – must be a 16-character hex string`);
    }

    if (version === '3.3') {
      // v3.3 format: { cid, dps }  (gwId is filled in by the gateway firmware)
      return { cid: childId, dps };
    }

    // v3.4 / v3.5 format: { protocol: 5, data: { cid, dps } }
    return {
      protocol: 5,
      data: { cid: childId, dps },
    };
  }

  /**
   * Build a DPS-query payload to request the current state of a Zigbee child.
   *
   * @param childId  Zigbee CID
   * @param version  Protocol version of the parent gateway connection
   */
  static prepareChildQueryPayload(
    childId: string,
    version: SupportedChildProtocol,
  ): Record<string, unknown> {
    if (!ChildPayloadUtility.isValidCid(childId)) {
      throw new Error(`Invalid Zigbee CID "${childId}" – must be a 16-character hex string`);
    }

    if (version === '3.3') {
      return { cid: childId, dps: {} };
    }

    return {
      protocol: 5,
      data: { cid: childId, dps: {} },
    };
  }

  /**
   * Extract the child CID and DPS values from an incoming gateway payload.
   * Returns `null` when the payload does not contain child routing information
   * (i.e. it is a regular parent/standalone device update).
   *
   * @param payload  Decoded JSON payload received from the parent gateway
   */
  static extractChildData(payload: Record<string, unknown>): ChildData | null {
    // v3.3 format: { gwId?, cid, dps }
    if (typeof payload.cid === 'string' && payload.dps !== undefined) {
      return {
        childId: payload.cid,
        dps: payload.dps as Record<string, unknown>,
      };
    }

    // v3.4 / v3.5 format: { protocol: 5, data: { cid, dps } }
    if (payload.protocol === 5 && payload.data !== null && typeof payload.data === 'object') {
      const data = payload.data as Record<string, unknown>;
      if (typeof data.cid === 'string' && data.dps !== undefined) {
        return {
          childId: data.cid,
          dps: data.dps as Record<string, unknown>,
        };
      }
    }

    return null;
  }
}
