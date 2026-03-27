/**
 * Zigbee Device Join/Leave Event Detection
 *
 * Monitors Tuya Zigbee gateway status frames for device join/leave messages.
 * When a child device joins or leaves the network, the gateway broadcasts status updates
 * that can be detected and acted upon (e.g., auto-register new children, mark as offline).
 *
 * Event formats may vary by gateway firmware version:
 * - Status DP with child list or device ID
 * - Extended stream (0x40) with subdevice list updates
 * - DPS change notifications with CID + status
 */

import LocalDevice from './LocalDevice';
import Logger from '../shared/util/Logger';

export enum ZigbeeDeviceEvent {
  JOINED = 'joined',
  LEFT = 'left',
  ONLINE = 'online',
  OFFLINE = 'offline',
}

export interface ZigbeeDeviceEventInfo {
  event: ZigbeeDeviceEvent;
  cid: string; // 16-char hex CID of the device
  timestamp: number;
  gatewayId?: string; // Parent gateway ID if available
  productName?: string; // Device type if reported by gateway
  online?: boolean; // Online status if reported
}

/**
 * Extract join/leave event from status update payload.
 *
 * Multiple gateway formats possible:
 * 1. DPS change: `{ dps: { subdev_event: "xxx" } }` (event codes)
 * 2. List format: `{ dps: { subdev_list: [...{cid, online}...] } }`
 * 3. Extended status: Parsed from extended stream response
 *
 * @param statusUpdate - Device status update from LocalDevice 'change' event
 * @param parentGatewayId - Parent gateway device ID for context
 * @returns Array of detected join/leave events, empty if none
 */
export function extractZigbeeEvents(
  statusUpdate: Record<string, any>,
  parentGatewayId?: string,
): ZigbeeDeviceEventInfo[] {
  const events: ZigbeeDeviceEventInfo[] = [];

  // Format 1: Explicit join/leave event codes (varies by firmware)
  // Examples: "subdev_join", "subdev_leave", "device_join", "device_leave"
  if (statusUpdate.subdev_event) {
    const event = String(statusUpdate.subdev_event).toLowerCase();
    if (event.includes('join') || event === '1') {
      events.push({
        event: ZigbeeDeviceEvent.JOINED,
        cid: extractCidFromPayload(statusUpdate),
        timestamp: Date.now(),
        gatewayId: parentGatewayId,
      });
    } else if (event.includes('leave') || event === '0') {
      events.push({
        event: ZigbeeDeviceEvent.LEFT,
        cid: extractCidFromPayload(statusUpdate),
        timestamp: Date.now(),
        gatewayId: parentGatewayId,
      });
    }
  }

  // Format 2: Device join code (0 = left, 1 = joined)
  if (statusUpdate.device_join !== undefined) {
    const joined = statusUpdate.device_join ? ZigbeeDeviceEvent.JOINED : ZigbeeDeviceEvent.LEFT;
    events.push({
      event: joined,
      cid: extractCidFromPayload(statusUpdate),
      timestamp: Date.now(),
      gatewayId: parentGatewayId,
    });
  }

  // Format 3: Sub-device list with online status changes
  if (Array.isArray(statusUpdate.subdev_list)) {
    for (const subdev of statusUpdate.subdev_list) {
      if (subdev.cid) {
        // Check if this is a new device or status change
        const online = subdev.online === 1 || subdev.online === true;
        events.push({
          event: online ? ZigbeeDeviceEvent.JOINED : ZigbeeDeviceEvent.LEFT,
          cid: subdev.cid,
          timestamp: Date.now(),
          gatewayId: parentGatewayId,
          productName: subdev.productName,
          online,
        });
      }
    }
  }

  // Format 4: Child list (alternative name for subdev_list)
  if (Array.isArray(statusUpdate.child_device_list)) {
    for (const child of statusUpdate.child_device_list) {
      if (child.cid) {
        const online = child.online === 1 || child.online === true;
        events.push({
          event: online ? ZigbeeDeviceEvent.JOINED : ZigbeeDeviceEvent.LEFT,
          cid: child.cid,
          timestamp: Date.now(),
          gatewayId: parentGatewayId,
          online,
        });
      }
    }
  }

  return events;
}

/**
 * Extract CID from various payload formats.
 * Some gateways include the CID in the event notification.
 *
 * @param payload - Status payload
 * @returns CID string if found, empty string otherwise
 */
function extractCidFromPayload(payload: Record<string, any>): string {
  if (payload.cid && typeof payload.cid === 'string') {
    return payload.cid;
  }
  if (payload.device_cid && typeof payload.device_cid === 'string') {
    return payload.device_cid;
  }
  if (payload.child_cid && typeof payload.child_cid === 'string') {
    return payload.child_cid;
  }
  return '';
}

/**
 * Set up join/leave event monitoring on a Zigbee gateway.
 * Listens for status changes and extracts device join/leave events.
 *
 * @param gatewayConn - LocalDevice connection for the parent gateway
 * @param gatewayId - Gateway device ID for logging/context
 * @param onEvent - Callback when join/leave event detected
 * @param log - Logger instance
 * @returns Cleanup function to remove listeners
 */
export function setupZigbeeEventMonitoring(
  gatewayConn: LocalDevice,
  gatewayId: string,
  onEvent: (event: ZigbeeDeviceEventInfo) => void,
  log: Logger,
): () => void {
  const changeHandler = (changes: Record<string, any>) => {
    const events = extractZigbeeEvents(changes, gatewayId);
    for (const event of events) {
      log.info(
        `Zigbee gateway ${gatewayId}: child device ${event.event} ` +
        `(CID=${event.cid})${event.productName ? ` [${event.productName}]` : ''}`,
      );
      onEvent(event);
    }
  };

  gatewayConn.on('change', changeHandler);

  // Return cleanup function
  return () => {
    gatewayConn.removeListener('change', changeHandler);
  };
}

/**
 * Validate a detected join/leave event.
 * Ensures the CID format is correct and event has required fields.
 *
 * @param event - Event to validate
 * @returns true if event is valid and should be processed
 */
export function isValidZigbeeEvent(event: ZigbeeDeviceEventInfo): boolean {
  // CID must be 16 lowercase hex characters
  if (!event.cid || !/^[0-9a-f]{16}$/.test(event.cid)) {
    return false;
  }

  // Event must be one of the known types
  if (!Object.values(ZigbeeDeviceEvent).includes(event.event)) {
    return false;
  }

  return true;
}

/**
 * Batch process multiple detected events.
 * Filters invalid events and groups by action (join vs leave).
 *
 * @param events - Array of detected events
 * @param log - Logger instance
 * @returns Object with joined and left CID arrays
 */
export function batchProcessZigbeeEvents(
  events: ZigbeeDeviceEventInfo[],
  log: Logger,
): { joined: string[]; left: string[] } {
  const valid = events.filter(e => {
    if (!isValidZigbeeEvent(e)) {
      log.warn(`Invalid Zigbee event: CID=${e.cid}, event=${e.event}`);
      return false;
    }
    return true;
  });

  const joined = valid
    .filter(e => e.event === ZigbeeDeviceEvent.JOINED)
    .map(e => e.cid);

  const left = valid
    .filter(e => e.event === ZigbeeDeviceEvent.LEFT)
    .map(e => e.cid);

  return { joined, left };
}

/**
 * Log event summary after processing.
 *
 * @param joined - Array of CIDs that joined
 * @param left - Array of CIDs that left
 * @param log - Logger instance
 */
export function logEventProcessingSummary(joined: string[], left: string[], log: Logger): void {
  const totalEvents = joined.length + left.length;
  if (totalEvents === 0) {
    return;
  }

  log.debug(
    `Zigbee events: ${joined.length} joined, ${left.length} left`,
  );

  if (joined.length > 0) {
    log.debug(`  Joined: ${joined.join(', ')}`);
  }
  if (left.length > 0) {
    log.debug(`  Left: ${left.join(', ')}`);
  }
}
