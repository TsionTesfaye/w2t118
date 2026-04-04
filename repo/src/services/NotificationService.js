/**
 * Notification Service — in-app notifications.
 * Called by other services when events occur.
 */

import { notificationRepository, userRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { AuthorizationError } from '../utils/errors.js';

/**
 * Map notification event type → user preference key.
 * Types not in this map are always delivered (system-level).
 */
const TYPE_TO_PREF = {
  message:     'messages',
  transaction: 'transactions',
  moderation:  'moderation',
  complaint:   'complaints',
  refund:      'complaints',
};

export const NotificationService = {
  /**
   * Create a notification for a user.
   * Called internally by other services — no permission check needed.
   * @param {string} userId - Recipient
   * @param {string} type - 'message' | 'transaction' | 'moderation' | 'complaint' | 'refund'
   * @param {string} referenceId - ID of the related entity
   * @param {string} message - Human-readable message
   */
  async create(userId, type, referenceId, message) {
    if (!userId || !type || !message) return null;

    // ── Preference enforcement ──
    const prefKey = TYPE_TO_PREF[type];
    if (prefKey) {
      try {
        const user = await userRepository.getById(userId);
        if (user?.notificationPreferences?.[prefKey] === false) {
          return null; // recipient has disabled this notification type
        }
      } catch {
        // If user fetch fails, fall through and deliver
      }
    }

    // ── Deduplication: skip if identical unread notification already exists ──
    if (referenceId) {
      const existing = await notificationRepository.findUnread(userId, type, referenceId);
      if (existing) return existing;
    }

    const notification = {
      id: generateId(),
      userId,
      type,
      referenceId,
      message,
      isRead: false,
      createdAt: now(),
    };

    await notificationRepository.create(notification);
    return notification;
  },

  /**
   * Get notifications for the current user.
   */
  async getMyNotifications(session) {
    validateSession(session);
    requirePermission(session, Permissions.NOTIFICATION_VIEW);

    const notifications = await notificationRepository.getByUserId(session.userId);
    return notifications.sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * Get unread count for the current user.
   */
  async getUnreadCount(session) {
    validateSession(session);
    requirePermission(session, Permissions.NOTIFICATION_VIEW);
    return notificationRepository.countUnreadByUserId(session.userId);
  },

  /**
   * Mark a notification as read.
   */
  async markAsRead(session, notificationId) {
    validateSession(session);

    const notification = await notificationRepository.getByIdOrFail(notificationId);
    if (notification.userId !== session.userId) {
      throw new AuthorizationError('Not your notification');
    }

    notification.isRead = true;
    await notificationRepository.update(notification);
    return notification;
  },

  /**
   * Mark all notifications as read for the current user.
   */
  async markAllAsRead(session) {
    validateSession(session);

    const unread = await notificationRepository.getUnreadByUserId(session.userId);
    for (const notification of unread) {
      notification.isRead = true;
      await notificationRepository.update(notification);
    }

    return unread.length;
  },
};
