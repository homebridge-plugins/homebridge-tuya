/**
 * Dynamic Zigbee child device discovery for gateways.
 * 
 * Discovers children via:
 * 1. Tuya Cloud's gateway_id field (if available via cloud device list)
 * 2. Dynamic LAN_EXT_STREAM query to gateway for subdev_online_stat_query
 * 3. Auto-registration without requiring manual config
 */

import Logger from '../shared/util/Logger';
import { LocalDeviceConfig } from './config';

/**
 * Sub-device info returned by gateway's subdev_online_stat_query response.
 * Example: { id: "device_id_12345", cid: "00112233445566aa", online: 1, ... }
 */
export interface SubDeviceInfo {
  id?: string;           // Sub-device ID (may not always be provided)
  cid?: string;          // 16-char lowercase hex CID
  online?: 0 | 1;        // Online status (1 = online)
  productName?: string;  // Device type name
  category?: string;     // Device category (e.g., 'dj' for light)
  [key: string]: any;    // Other gateway-provided fields
}

/**
 * Result of a subdev_online_stat_query.
 * Gateway may return: { code: 0, msg: 'ok', data: { subdevList: [...] } } or similar.
 */
export interface SubDeviceQueryResult {
  code?: number;
  msg?: string;
  data?: {
    subdevList?: SubDeviceInfo[];
    subdevs?: SubDeviceInfo[];  // Alternative format
    deviceList?: SubDeviceInfo[];
  };
  subdevList?: SubDeviceInfo[];  // Flat format
  deviceList?: SubDeviceInfo[];
  dps?: Record<string, unknown>;  // May come as DPS values instead
  [key: string]: any;
}

/**
 * Discovers children from cloud device list.
 * 
 * If Tuya Cloud provides gateway_id field, we can identify the parent immediately
 * without needing to match by local key.
 * 
 * @param cloudDevices - Cloud API device array with optional gateway_id field
 * @returns Map of gateway_id → array of child device IDs
 */
export function discoverFromCloudList(cloudDevices: Array<{ id: string; gateway_id?: string }>): Map<string, string[]> {
  const gatewayToChildren = new Map<string, string[]>();

  for (const device of cloudDevices) {
    if (device.gateway_id && device.gateway_id !== device.id) {
      if (!gatewayToChildren.has(device.gateway_id)) {
        gatewayToChildren.set(device.gateway_id, []);
      }
      gatewayToChildren.get(device.gateway_id)!.push(device.id);
    }
  }

  return gatewayToChildren;
}

/**
 * Parse subdev_online_stat_query response to extract child device CIDs.
 * 
 * Gateways may return different formats; this handles multiple variants:
 * - { data: { subdevList: [...] } }
 * - { subdevList: [...] }
 * - { deviceList: [...] }
 * - { dps: { cid1: {...}, cid2: {...} } } (some gateways use DPS format)
 * 
 * @param response - Raw response from LAN_EXT_STREAM subdev_online_stat_query
 * @returns Array of sub-device info objects
 */
export function parseSubDeviceListResponse(response: any): SubDeviceInfo[] {
  if (!response) return [];

  const subdevs: SubDeviceInfo[] = [];

  // Try nested data format first
  if (response.data) {
    if (response.data.subdevList) {
      subdevs.push(...(Array.isArray(response.data.subdevList) ? response.data.subdevList : []));
    }
    if (response.data.subdevs) {
      subdevs.push(...(Array.isArray(response.data.subdevs) ? response.data.subdevs : []));
    }
    if (response.data.deviceList) {
      subdevs.push(...(Array.isArray(response.data.deviceList) ? response.data.deviceList : []));
    }
  }

  // Try flat format
  if (response.subdevList && Array.isArray(response.subdevList)) {
    subdevs.push(...response.subdevList);
  }

  if (response.deviceList && Array.isArray(response.deviceList)) {
    subdevs.push(...response.deviceList);
  }

  // Some gateways return DPS format: each DPS value is a CID-keyed object
  if (response.dps && typeof response.dps === 'object') {
    for (const [key, value] of Object.entries(response.dps)) {
      // Check if key looks like a CID (16 hex chars)
      if (/^[0-9a-f]{16}$/.test(key) && typeof value === 'object') {
        subdevs.push({ cid: key, ...value });
      }
    }
  }

  return subdevs;
}

/**
 * Filter sub-device list to get CIDs that are online.
 * 
 * @param subdevs - Sub-device info array from gateway
 * @returns Array of CIDs for online devices
 */
export function getOnlineCids(subdevs: SubDeviceInfo[]): string[] {
  return subdevs
    .filter(dev => dev.cid && (dev.online === 1 || dev.online === undefined))
    .map(dev => dev.cid as string);
}

/**
 * Build a LocalDeviceConfig for a dynamically discovered child.
 * 
 * Creates a child device config from gateway discovery info.
 * The config can be refined later by cloud device metadata.
 * 
 * @param gatewayDeviceId - Parent gateway's device ID
 * @param childCid - 16-char hex child CID
 * @param subdevInfo - Optional sub-device info from gateway (may include productName, category)
 * @param deviceIP - Parent gateway IP (children share parent's connection)
 * @param deviceKey - Parent gateway key (children use local protocol via parent)
 * @returns Minimal LocalDeviceConfig for the discovered child
 */
export function buildDiscoveredChildConfig(
  gatewayDeviceId: string,
  childCid: string,
  subdevInfo?: SubDeviceInfo,
  deviceIP?: string,
  deviceKey?: string,
): LocalDeviceConfig {
  const childId = subdevInfo?.id || `${gatewayDeviceId}_${childCid}`;

  return {
    tuyaDeviceId: childId,
    name: subdevInfo?.productName ? `${subdevInfo.productName} (CID: ${childCid})` : `Child ${childCid}`,
    ip: deviceIP,
    tuyaKey: deviceKey,
    parentDeviceId: gatewayDeviceId,
    zigbeeChildId: childCid,
    category: subdevInfo?.category,
  };
}

/**
 * Validate a discovered child's CID format.
 * 
 * @param cid - String to validate
 * @returns true if valid 16-character lowercase hex CID
 */
export function isValidDiscoveredCid(cid: string): boolean {
  return typeof cid === 'string' && /^[0-9a-f]{16}$/.test(cid);
}

/**
 * Check if a gateway supports dynamic child discovery (has children detected).
 * 
 * @param gatewayConfig - Gateway device config
 * @returns true if this device is marked as a Zigbee gateway
 */
export function supportsChildDiscovery(gatewayConfig: LocalDeviceConfig): boolean {
  return gatewayConfig.isZigbeeGateway === true || gatewayConfig.isZigbeeGateway === undefined;
}

/**
 * Log discovery results.
 * 
 * @param gatewayDeviceId - Gateway device ID
 * @param discoveredCids - Array of CIDs that were discovered
 * @param log - Logger instance
 */
export function logDiscoveryResults(gatewayDeviceId: string, discoveredCids: string[], log: Logger): void {
  if (discoveredCids.length === 0) {
    log.debug(`Zigbee gateway ${gatewayDeviceId}: no sub-devices discovered online`);
  } else {
    log.info(`Zigbee gateway ${gatewayDeviceId}: discovered ${discoveredCids.length} sub-device(s): ${discoveredCids.join(', ')}`);
  }
}
