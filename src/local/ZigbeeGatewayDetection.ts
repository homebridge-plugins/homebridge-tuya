/**
 * ZigbeeGatewayDetection – resolves parent-child (gateway/sub-device) relationships
 * from the local device configuration.
 *
 * Tuya Zigbee devices operate through a WiFi gateway:
 *   - The **parent** gateway holds the TCP connection (it has an IP + localKey).
 *   - Each **child** sub-device is addressed via a CID (Child ID / node_id) that
 *     is embedded in the payload forwarded through the parent's connection.
 *
 * Hierarchy is expressed through two config fields:
 *   - `parentDeviceId`: tuyaDeviceId of the gateway (set on each child)
 *   - `zigbeeChildId`:  16-char hex CID assigned by the gateway (set on each child)
 *
 * This module validates those relationships and returns a structured map of
 * parent → children that LocalDeviceManager uses during device setup.
 */

import { LocalDeviceConfig } from './config';

/** One child entry as stored under the parent's relationship record. */
export interface ZigbeeChildEntry {
  /** Tuya device ID of the child (same as LocalDeviceConfig.tuyaDeviceId). */
  deviceId: string;
  /** Zigbee node ID / CID (16-char hex). */
  cid: string;
  /** Human-readable name (for logging). */
  name: string;
}

/** All relationship data for a single parent gateway. */
export interface GatewayRelationship {
  /** tuyaDeviceId of the parent. */
  parentId: string;
  /** Ordered list of child entries. */
  children: ZigbeeChildEntry[];
}

export class ZigbeeGatewayDetection {
  /**
   * Scan `devices` for `parentDeviceId` / `zigbeeChildId` entries and build a
   * map of parentId → GatewayRelationship.
   *
   * Throws a descriptive Error for any of the following invalid configurations:
   *  - A child has `parentDeviceId` but no `zigbeeChildId` (or vice-versa)
   *  - A `zigbeeChildId` is not a valid 16-hex-character string
   *  - A `parentDeviceId` references a device not present in the list
   *  - Two children under the same parent share the same CID
   *
   * @param devices  Full list of LocalDeviceConfig entries (may be empty)
   * @returns        Map from parentId to its GatewayRelationship (empty if none)
   */
  static detectFromDevices(
    devices: LocalDeviceConfig[],
  ): Map<string, GatewayRelationship> {
    const relationships = new Map<string, GatewayRelationship>();
    const deviceIds = new Set(devices.map(d => d.tuyaDeviceId));

    for (const cfg of devices) {
      const hasParent = !!cfg.parentDeviceId;
      const hasCid = !!cfg.zigbeeChildId;

      // Both fields must be set together
      if (hasParent && !hasCid) {
        throw new Error(
          `Device "${cfg.tuyaDeviceId}" has parentDeviceId but is missing zigbeeChildId. ` +
          'Both fields are required for Zigbee sub-devices.',
        );
      }
      if (!hasParent && hasCid) {
        throw new Error(
          `Device "${cfg.tuyaDeviceId}" has zigbeeChildId but is missing parentDeviceId. ` +
          'Both fields are required for Zigbee sub-devices.',
        );
      }

      if (!hasParent) {
        continue; // standalone / parent device — nothing to do here
      }

      const parentId = cfg.parentDeviceId!;
      const cid = cfg.zigbeeChildId!;

      // Validate CID format
      if (!/^[0-9a-f]{16}$/i.test(cid)) {
        throw new Error(
          `Device "${cfg.tuyaDeviceId}" has an invalid zigbeeChildId "${cid}". ` +
          'The CID must be exactly 16 hexadecimal characters (e.g. "0011223344556601").',
        );
      }

      // Validate parent exists in the same config list
      if (!deviceIds.has(parentId)) {
        throw new Error(
          `Device "${cfg.tuyaDeviceId}" references parent "${parentId}" ` +
          'which was not found in the local devices list. ' +
          'Make sure the gateway device is also listed in local.devices.',
        );
      }

      // Parent must not itself be a child
      const parentCfg = devices.find(d => d.tuyaDeviceId === parentId);
      if (parentCfg?.parentDeviceId) {
        throw new Error(
          `Device "${parentId}" is used as a parent gateway for "${cfg.tuyaDeviceId}" ` +
          'but it is itself configured as a child device. Chained gateways are not supported.',
        );
      }

      // Build / update the relationship entry
      if (!relationships.has(parentId)) {
        relationships.set(parentId, { parentId, children: [] });
      }
      const rel = relationships.get(parentId)!;

      // Check for duplicate CIDs under the same parent
      const dupCid = rel.children.find(c => c.cid.toLowerCase() === cid.toLowerCase());
      if (dupCid) {
        throw new Error(
          `Duplicate Zigbee CID "${cid}" under gateway "${parentId}": ` +
          `used by both "${dupCid.deviceId}" and "${cfg.tuyaDeviceId}".`,
        );
      }

      rel.children.push({
        deviceId: cfg.tuyaDeviceId,
        cid: cid.toLowerCase(),
        name: cfg.name ?? cfg.tuyaDeviceId,
      });
    }

    return relationships;
  }

  /**
   * Return true if a device config represents a Zigbee child (sub-device).
   */
  static isChild(cfg: LocalDeviceConfig): boolean {
    return !!cfg.parentDeviceId;
  }

  /**
   * Return true if a device config is (or should be treated as) a gateway.
   * A device is a gateway if it is explicitly flagged OR if any other device
   * in the list references it as a parent.
   */
  static isGateway(cfg: LocalDeviceConfig, allDevices: LocalDeviceConfig[]): boolean {
    if (cfg.isZigbeeGateway) {
      return true;
    }
    return allDevices.some(d => d.parentDeviceId === cfg.tuyaDeviceId);
  }
}
