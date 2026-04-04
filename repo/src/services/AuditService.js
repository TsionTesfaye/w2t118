/**
 * Audit Service — centralized audit logging.
 * Called by all other services for critical actions.
 * Append-only. No deletion.
 */

import { auditLogRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

export const AuditActions = Object.freeze({
  // Auth
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_LOGOUT: 'user.logout',
  USER_LOCKED: 'user.locked',
  PASSWORD_CHANGED: 'user.password_changed',
  PASSWORD_RECOVERED: 'user.password_recovered',

  // Profile
  PROFILE_UPDATED: 'user.profile_updated',

  // Roles
  ROLE_ASSIGNED: 'user.role_assigned',
  ROLE_REMOVED: 'user.role_removed',

  // Listings
  LISTING_CREATED: 'listing.created',
  LISTING_UPDATED: 'listing.updated',
  LISTING_STATUS_CHANGED: 'listing.status_changed',
  LISTING_ROLLED_BACK: 'listing.rolled_back',
  LISTING_DELETED: 'listing.deleted',

  // Transactions
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_STATUS_CHANGED: 'transaction.status_changed',
  TRANSACTION_CANCELED: 'transaction.canceled',
  TRANSACTION_EXPIRED: 'transaction.expired',

  // Threads
  THREAD_CREATED: 'thread.created',
  MESSAGE_SENT: 'thread.message_sent',

  // Blocking
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',

  // Reports
  REPORT_CREATED: 'report.created',
  REPORT_STATUS_CHANGED: 'report.status_changed',

  // Moderation
  MODERATION_CASE_CREATED: 'moderation.case_created',
  MODERATION_DECISION: 'moderation.decision',

  // Complaints
  COMPLAINT_CREATED: 'complaint.created',
  COMPLAINT_STATUS_CHANGED: 'complaint.status_changed',

  // Refunds
  REFUND_REQUESTED: 'refund.requested',
  REFUND_DECISION: 'refund.decision',

  // Delivery
  DELIVERY_BOOKED: 'delivery.booked',

  // Admin
  CATEGORY_CREATED: 'admin.category_created',
  CATEGORY_UPDATED: 'admin.category_updated',
  SENSITIVE_WORD_ADDED: 'admin.sensitive_word_added',
  SENSITIVE_WORD_REMOVED: 'admin.sensitive_word_removed',
  DATA_EXPORTED: 'admin.data_exported',
  DATA_IMPORTED: 'admin.data_imported',
  COVERAGE_UPDATED: 'admin.coverage_updated',
});

export const AuditService = {
  /**
   * Log an audit event.
   * @param {string} actorId - Who performed the action (userId or 'system')
   * @param {string} action - One of AuditActions
   * @param {string} entityType - Type of entity affected
   * @param {string} entityId - ID of entity affected
   * @param {Object} metadata - Additional context
   */
  async log(actorId, action, entityType, entityId, metadata = {}) {
    const entry = {
      id: generateId(),
      actorId: actorId || 'system',
      action,
      entityType,
      entityId,
      timestamp: now(),
      metadata,
    };

    await auditLogRepository.create(entry);
    return entry;
  },

  /**
   * Query audit logs by actor.
   */
  async getByActor(actorId) {
    return auditLogRepository.getByActorId(actorId);
  },

  /**
   * Query audit logs by entity type.
   */
  async getByEntityType(entityType) {
    return auditLogRepository.getByEntityType(entityType);
  },

  /**
   * Get all audit logs (admin only).
   */
  async getAll(session) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_VIEW_AUDIT);
    return auditLogRepository.getAll();
  },

  /**
   * Get total count of audit logs.
   */
  async count() {
    return auditLogRepository.count();
  },
};
