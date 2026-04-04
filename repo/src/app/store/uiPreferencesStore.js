/**
 * UI Preferences Store — theme and notification preferences.
 *
 * Persistence strategy:
 *  - Theme: localStorage only (no server storage needed — pure UI preference)
 *  - Notification prefs: localStorage (fast hydration) + IndexedDB via UserService
 *    (server-side persistence for cross-device consistency)
 *
 * On startup: hydrate from localStorage immediately, then overwrite with
 * IndexedDB values when the user profile loads (UserCenterView/settings tab).
 */

import { defineStore } from 'pinia';
import { ref, reactive } from 'vue';
import { LocalStorageAdapter, StorageKeys } from '../../repositories/localStorageAdapter.js';

const DEFAULT_THEME = 'light';
const DEFAULT_NOTIF_PREFS = {
  messages: true,
  moderation: true,
  transactions: true,
  complaints: true,
};

export const useUiPreferencesStore = defineStore('uiPreferences', () => {
  // ── Theme ──
  const theme = ref(LocalStorageAdapter.get(StorageKeys.THEME, DEFAULT_THEME));

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function setTheme(newTheme) {
    theme.value = newTheme;
    LocalStorageAdapter.set(StorageKeys.THEME, newTheme);
    applyTheme(newTheme);
  }

  function toggleTheme() {
    setTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  // Apply theme immediately when the store is created
  applyTheme(theme.value);

  // ── Notification Preferences ──
  const notificationPrefs = reactive({
    ...DEFAULT_NOTIF_PREFS,
    ...LocalStorageAdapter.get(StorageKeys.NOTIFICATION_PREFS, {}),
  });

  /**
   * Set a single notification preference and persist to localStorage.
   * Call UserService.updateNotificationPreferences() separately to persist
   * to IndexedDB for cross-device consistency.
   */
  function setNotificationPref(key, value) {
    notificationPrefs[key] = value;
    LocalStorageAdapter.set(StorageKeys.NOTIFICATION_PREFS, { ...notificationPrefs });
  }

  /**
   * Overwrite all notification preferences (called after profile load from IndexedDB).
   * Also syncs the updated values to localStorage.
   */
  function hydrateNotificationPrefs(prefs) {
    if (!prefs) return;
    Object.assign(notificationPrefs, { ...DEFAULT_NOTIF_PREFS, ...prefs });
    LocalStorageAdapter.set(StorageKeys.NOTIFICATION_PREFS, { ...notificationPrefs });
  }

  return {
    theme,
    notificationPrefs,
    setTheme,
    toggleTheme,
    setNotificationPref,
    hydrateNotificationPrefs,
  };
});
