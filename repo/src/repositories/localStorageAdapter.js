/**
 * LocalStorage Adapter — for preferences and session metadata.
 * Wraps localStorage with JSON serialization and error handling.
 */

import { AppError } from '../utils/errors.js';

const NAMESPACE = 'tradeloop_';

export const LocalStorageAdapter = {
  /**
   * Get a value by key.
   * @param {string} key
   * @param {*} defaultValue
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(NAMESPACE + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Set a value by key.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    try {
      localStorage.setItem(NAMESPACE + key, JSON.stringify(value));
    } catch (e) {
      throw new AppError('STORAGE_ERROR', `LocalStorage write failed: ${e.message}`);
    }
  },

  /**
   * Remove a key.
   * @param {string} key
   */
  remove(key) {
    localStorage.removeItem(NAMESPACE + key);
  },

  /**
   * Clear all TradeLoop keys.
   */
  clear() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NAMESPACE)) {
        keys.push(k);
      }
    }
    keys.forEach(k => localStorage.removeItem(k));
  },
};

// Well-known keys
export const StorageKeys = Object.freeze({
  THEME: 'theme',
  NOTIFICATION_PREFS: 'notification_prefs',
  SESSION: 'session',
  LAST_ACTIVE: 'last_active',
});
