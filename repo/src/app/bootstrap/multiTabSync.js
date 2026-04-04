/**
 * Multi-Tab Sync via BroadcastChannel API.
 * Strategy: last-write-wins.
 * Falls back to no-op if BroadcastChannel is unavailable.
 */

let channel = null;
const listeners = new Map();

const CHANNEL_NAME = 'tradeloop_sync';

export const SyncEvents = Object.freeze({
  SESSION_CHANGED: 'session_changed',
  SESSION_EXPIRED: 'session_expired',
  DATA_CHANGED: 'data_changed',
  LOGOUT: 'logout',
});

/**
 * Initialize multi-tab sync.
 */
export function initMultiTabSync() {
  if (typeof BroadcastChannel === 'undefined') {
    console.warn('BroadcastChannel not available — multi-tab sync disabled');
    return;
  }

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type && listeners.has(type)) {
        for (const callback of listeners.get(type)) {
          try {
            callback(payload);
          } catch (e) {
            console.error(`Sync listener error for ${type}:`, e);
          }
        }
      }
    };
  } catch (e) {
    console.warn('Failed to create BroadcastChannel:', e);
  }
}

/**
 * Broadcast an event to other tabs.
 */
export function broadcastSync(type, payload = null) {
  if (!channel) return;
  try {
    channel.postMessage({ type, payload, timestamp: Date.now() });
  } catch (e) {
    console.warn('Broadcast failed:', e);
  }
}

/**
 * Subscribe to a sync event.
 * @returns {Function} Unsubscribe function
 */
export function onSyncEvent(type, callback) {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  listeners.get(type).add(callback);

  return () => {
    const set = listeners.get(type);
    if (set) set.delete(callback);
  };
}

/**
 * Close the channel (for cleanup).
 */
export function closeSyncChannel() {
  if (channel) {
    channel.close();
    channel = null;
  }
  listeners.clear();
}
