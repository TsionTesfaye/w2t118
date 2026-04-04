/**
 * Notification Store — centralized unread count and notification list.
 * Replaces view-local polling in AppLayout and UserCenterView.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { NotificationService } from '../../services/NotificationService.js';

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0);
  const notifications = ref([]);
  let _pollInterval = null;

  /** Fetch just the unread count (lightweight — used for the badge). */
  async function fetchUnreadCount(session) {
    if (!session) return;
    try {
      unreadCount.value = await NotificationService.getUnreadCount(session);
    } catch {
      // Silently ignore — session may have expired
    }
  }

  /** Fetch full notification list and sync unread count from it. */
  async function fetchNotifications(session) {
    if (!session) return;
    try {
      const data = await NotificationService.getMyNotifications(session);
      notifications.value = data;
      unreadCount.value = data.filter(n => !n.isRead).length;
    } catch {
      // Silently ignore
    }
  }

  /** Mark all as read optimistically and persist. */
  async function markAllRead(session) {
    if (!session) return;
    try {
      await NotificationService.markAllAsRead(session);
      notifications.value.forEach(n => { n.isRead = true; });
      unreadCount.value = 0;
    } catch {
      // Refetch to reconcile
      await fetchNotifications(session);
    }
  }

  /**
   * Start periodic polling for unread count.
   * @param {Function} getSession - Reactive accessor returning current session
   * @param {number} interval - Poll interval in ms (default 30s)
   */
  function startPolling(getSession, interval = 30_000) {
    stopPolling();
    fetchUnreadCount(getSession());
    _pollInterval = setInterval(() => fetchUnreadCount(getSession()), interval);
  }

  function stopPolling() {
    if (_pollInterval) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }
  }

  function reset() {
    stopPolling();
    unreadCount.value = 0;
    notifications.value = [];
  }

  return {
    unreadCount,
    notifications,
    fetchUnreadCount,
    fetchNotifications,
    markAllRead,
    startPolling,
    stopPolling,
    reset,
  };
});
