/**
 * Cloud/Local Device Reconciliation
 *
 * When operating in hybrid mode, the same physical device may be discoverable
 * via both Tuya Cloud and local LAN. This module handles:
 * 1. Detecting when the same device appears in both sources (by UUID)
 * 2. Merging configurations with proper priority (local ≥ cloud)
 * 3. Ensuring single accessory per physical device
 * 4. Tracking source availability for fallback scenarios
 */

import TuyaDevice from '../cloud/device/TuyaDevice';
import Logger from '../shared/util/Logger';

export interface DeviceSourceInfo {
  cloud: boolean;       // Available via cloud API
  local: boolean;       // Available via local LAN discovery
  localIP?: string;     // IP if discovered locally
  localVersion?: string; // Protocol version if discovered locally
  connectedTo?: 'cloud' | 'local' | 'both'; // Which source currently active
}

/**
 * Reconcile cloud and local device lists by UUID.
 * Returns a unified device registry with source tracking.
 *
 * @param cloudDevices - Cloud API devices (with UUID)
 * @param localDevices - Local LAN devices (with UUID derived from device ID)
 * @param log - Logger instance
 * @returns Map of UUID → DeviceSourceInfo
 */
export function reconcileDeviceSources(
  cloudDevices: TuyaDevice[],
  localDevices: TuyaDevice[],
  log: Logger,
): Map<string, DeviceSourceInfo> {
  const sourceMap = new Map<string, DeviceSourceInfo>();

  // Track all devices from cloud
  for (const device of cloudDevices) {
    sourceMap.set(device.uuid, {
      cloud: true,
      local: false,
      connectedTo: 'cloud',
    });
  }

  // Track all devices from local (may overlap with cloud)
  for (const device of localDevices) {
    const existing = sourceMap.get(device.uuid);
    if (existing) {
      // Same device available via both sources
      existing.local = true;
      existing.localIP = (device as any).ip;
      existing.localVersion = (device as any).protocolVersion;
      existing.connectedTo = 'both'; // Updated to 'local' when actually connected
      log.info(`Device reconciliation: ${device.id} available via cloud AND local (${existing.localIP})`);
    } else {
      // Local-only device
      sourceMap.set(device.uuid, {
        cloud: false,
        local: true,
        localIP: (device as any).ip,
        localVersion: (device as any).protocolVersion,
        connectedTo: 'local',
      });
    }
  }

  return sourceMap;
}

/**
 * Determine which source should be preferred for a device given source availability.
 * Priority: local > cloud > fallback default.
 *
 * @param sourceInfo - Device source availability info
 * @param defaultSource - Fallback source if neither local nor cloud is available ('local' or 'cloud')
 * @returns Preferred source ('local' or 'cloud')
 */
export function getPreferredSource(
  sourceInfo: DeviceSourceInfo,
  defaultSource: 'local' | 'cloud' = 'local',
): 'local' | 'cloud' {
  if (sourceInfo.local && sourceInfo.cloud) {
    return 'local';
  }

  if (sourceInfo.local) {
    return 'local';
  }

  if (sourceInfo.cloud) {
    return 'cloud';
  }

  // Use fallback when neither source is explicitly available
  return defaultSource;
}

/**
 * Filter device list to include only devices from a specific source.
 * Useful for: "only control this device via local", "hide from cloud", etc.
 *
 * @param devices - Array of devices to filter
 * @param sourceFilter - 'local', 'cloud', or 'both'
 * @param sourceMap - Source availability map
 * @returns Filtered device array
 */
export function filterDevicesBySource(
  devices: TuyaDevice[],
  sourceFilter: 'local' | 'cloud' | 'both',
  sourceMap: Map<string, DeviceSourceInfo>,
): TuyaDevice[] {
  if (sourceFilter === 'both') {
    return devices;
  }

  return devices.filter(device => {
    const sourceInfo = sourceMap.get(device.uuid);
    if (!sourceInfo) {
      return false; // Device not in reconciliation map
    }

    if (sourceFilter === 'local') {
      return sourceInfo.local;
    } else if (sourceFilter === 'cloud') {
      return sourceInfo.cloud;
    }

    return true;
  });
}

/**
 * Mark a device as currently connected via a specific source.
 * Updates the internal `connectedTo` field to track which source is active.
 *
 * @param uuid - Device UUID
 * @param source - Source that just connected ('local' or 'cloud')
 * @param sourceMap - Mutable source availability map
 * @param log - Logger instance
 */
export function markDeviceConnected(
  uuid: string,
  source: 'local' | 'cloud',
  sourceMap: Map<string, DeviceSourceInfo>,
  log: Logger,
): void {
  const sourceInfo = sourceMap.get(uuid);
  if (!sourceInfo) {
    log.warn(`Attempted to mark unknown device ${uuid} as connected via ${source}`);
    return;
  }

  if (source === 'local' && !sourceInfo.local) {
    log.warn(`Attempted to mark device ${uuid} connected via local, but it's not available locally`);
    return;
  }
  if (source === 'cloud' && !sourceInfo.cloud) {
    log.warn(`Attempted to mark device ${uuid} connected via cloud, but it's not available via cloud`);
    return;
  }

  sourceInfo.connectedTo = sourceInfo.local && sourceInfo.cloud ? 'both' : source;
  log.debug(`Device ${uuid}: marked as connected via ${source}`);
}

/**
 * Check if a device should be hidden based on source restrictions.
 * Used during accessory creation to respect "hide device from source X" overrides.
 *
 * @param device - Device to check
 * @param currentSource - Current operation source ('local' or 'cloud')
 * @param sourceFilter - What the config specifies ('local', 'cloud', or 'both')
 * @returns true if device should be hidden from current source
 */
export function shouldHideFromSource(
  device: TuyaDevice,
  currentSource: 'local' | 'cloud',
  sourceFilter: 'local' | 'cloud' | 'both' | undefined,
): boolean {
  // Undefined source defaults to cloud-only (backward compatible)
  const effectiveSource = sourceFilter ?? 'cloud';

  if (effectiveSource === 'both') {
    return false; // Never hide if explicitly both
  }

  if (currentSource !== effectiveSource) {
    return true; // Hide if operating from non-matching source
  }

  return false;
}

/**
 * Log reconciliation summary.
 *
 * @param sourceMap - Device source availability map
 * @param log - Logger instance
 */
export function logReconciliationSummary(
  sourceMap: Map<string, DeviceSourceInfo>,
  log: Logger,
): void {
  let cloudOnly = 0;
  let localOnly = 0;
  let hybrid = 0;

  for (const sourceInfo of sourceMap.values()) {
    if (sourceInfo.cloud && sourceInfo.local) {
      hybrid++;
    } else if (sourceInfo.cloud) {
      cloudOnly++;
    } else if (sourceInfo.local) {
      localOnly++;
    }
  }

  log.info(
    `Cloud/Local reconciliation: ${hybrid} hybrid (both), ` +
    `${cloudOnly} cloud-only, ${localOnly} local-only devices`,
  );
}
