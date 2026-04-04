/**
 * Flat Permission Model
 * Format: "Domain:Action"
 * Enforced in service layer before every operation.
 */

export const Permissions = Object.freeze({
  // Listings
  LISTING_CREATE: 'Listing:Create',
  LISTING_EDIT: 'Listing:Edit',
  LISTING_DELETE: 'Listing:Delete',
  LISTING_PIN: 'Listing:Pin',
  LISTING_FEATURE: 'Listing:Feature',
  LISTING_VIEW: 'Listing:View',
  LISTING_ROLLBACK: 'Listing:Rollback',

  // Content (Comments / Q&A)
  CONTENT_CREATE: 'Content:Create',
  CONTENT_EDIT: 'Content:Edit',
  CONTENT_DELETE: 'Content:Delete',
  CONTENT_VIEW: 'Content:View',

  // Threads / Messaging
  THREAD_CREATE: 'Thread:Create',
  THREAD_VIEW: 'Thread:View',
  THREAD_SEND_MESSAGE: 'Thread:SendMessage',

  // Transactions
  TRANSACTION_CREATE: 'Transaction:Create',
  TRANSACTION_UPDATE: 'Transaction:Update',
  TRANSACTION_VIEW: 'Transaction:View',
  TRANSACTION_CANCEL: 'Transaction:Cancel',

  // Delivery
  DELIVERY_BOOK: 'Delivery:Book',
  DELIVERY_MANAGE: 'Delivery:Manage',
  DELIVERY_VIEW_COVERAGE: 'Delivery:ViewCoverage',
  DELIVERY_MANAGE_COVERAGE: 'Delivery:ManageCoverage',

  // Addresses
  ADDRESS_CREATE: 'Address:Create',
  ADDRESS_EDIT: 'Address:Edit',
  ADDRESS_DELETE: 'Address:Delete',
  ADDRESS_VIEW: 'Address:View',

  // Moderation
  MODERATION_REVIEW: 'Moderation:Review',
  MODERATION_DECIDE: 'Moderation:Decide',
  MODERATION_VIEW_QUEUE: 'Moderation:ViewQueue',

  // Reports
  REPORT_CREATE: 'Report:Create',
  REPORT_VIEW: 'Report:View',
  REPORT_EXPORT: 'Report:Export',

  // Support / Complaints
  COMPLAINT_CREATE: 'Complaint:Create',
  COMPLAINT_VIEW: 'Complaint:View',
  COMPLAINT_MANAGE: 'Complaint:Manage',
  COMPLAINT_RESOLVE: 'Complaint:Resolve',

  // Refunds
  REFUND_REQUEST: 'Refund:Request',
  REFUND_APPROVE: 'Refund:Approve',
  REFUND_VIEW: 'Refund:View',

  // Users
  USER_VIEW_PROFILE: 'User:ViewProfile',
  USER_EDIT_PROFILE: 'User:EditProfile',
  USER_BLOCK: 'User:Block',
  USER_VIEW_ALL: 'User:ViewAll',
  USER_MANAGE_ROLES: 'User:ManageRoles',

  // Admin
  ADMIN_CONFIG: 'Admin:Config',
  ADMIN_EXPORT: 'Admin:Export',
  ADMIN_IMPORT: 'Admin:Import',
  ADMIN_VIEW_AUDIT: 'Admin:ViewAudit',
  ADMIN_MANAGE_CATEGORIES: 'Admin:ManageCategories',
  ADMIN_MANAGE_SENSITIVE_WORDS: 'Admin:ManageSensitiveWords',

  // Analytics
  ANALYTICS_VIEW: 'Analytics:View',
  ANALYTICS_EXPORT: 'Analytics:Export',

  // Notifications
  NOTIFICATION_VIEW: 'Notification:View',
  NOTIFICATION_MANAGE_PREFS: 'Notification:ManagePrefs',
});

/**
 * Role → Permission mapping.
 * This is the SINGLE SOURCE OF TRUTH for what each role can do.
 */
import { Roles } from './roles.js';

export const RolePermissions = Object.freeze({
  [Roles.USER]: [
    Permissions.LISTING_CREATE,
    Permissions.LISTING_EDIT, // own only — ownership checked in service
    Permissions.LISTING_DELETE, // own only
    Permissions.LISTING_VIEW,
    Permissions.LISTING_ROLLBACK, // own only
    Permissions.CONTENT_CREATE,
    Permissions.CONTENT_EDIT, // own only
    Permissions.CONTENT_VIEW,
    Permissions.THREAD_CREATE,
    Permissions.THREAD_VIEW, // own threads only
    Permissions.THREAD_SEND_MESSAGE,
    Permissions.TRANSACTION_CREATE,
    Permissions.TRANSACTION_UPDATE, // participant only
    Permissions.TRANSACTION_VIEW, // own only
    Permissions.TRANSACTION_CANCEL, // participant only
    Permissions.DELIVERY_BOOK,
    Permissions.DELIVERY_VIEW_COVERAGE,
    Permissions.ADDRESS_CREATE,
    Permissions.ADDRESS_EDIT,
    Permissions.ADDRESS_DELETE,
    Permissions.ADDRESS_VIEW,
    Permissions.REPORT_CREATE,
    Permissions.COMPLAINT_CREATE,
    Permissions.COMPLAINT_VIEW, // own only
    Permissions.REFUND_REQUEST,
    Permissions.REFUND_VIEW, // own only
    Permissions.USER_VIEW_PROFILE,
    Permissions.USER_EDIT_PROFILE, // own only
    Permissions.USER_BLOCK,
    Permissions.NOTIFICATION_VIEW,
    Permissions.NOTIFICATION_MANAGE_PREFS,
  ],
  [Roles.MODERATOR]: [
    // Inherits all user permissions
    Permissions.LISTING_VIEW,
    Permissions.CONTENT_VIEW,
    Permissions.CONTENT_DELETE, // any content
    Permissions.THREAD_VIEW, // any thread for moderation
    Permissions.MODERATION_REVIEW,
    Permissions.MODERATION_DECIDE,
    Permissions.MODERATION_VIEW_QUEUE,
    Permissions.REPORT_VIEW,
    Permissions.USER_VIEW_PROFILE,
    Permissions.NOTIFICATION_VIEW,
    Permissions.LISTING_PIN,
    Permissions.LISTING_FEATURE,
  ],
  [Roles.SUPPORT_AGENT]: [
    Permissions.COMPLAINT_VIEW, // all complaints
    Permissions.COMPLAINT_MANAGE,
    Permissions.COMPLAINT_RESOLVE,
    Permissions.REFUND_VIEW, // all refunds
    Permissions.REFUND_APPROVE,
    Permissions.TRANSACTION_VIEW, // for complaint context
    Permissions.THREAD_VIEW, // for complaint context
    Permissions.USER_VIEW_PROFILE,
    Permissions.NOTIFICATION_VIEW,
  ],
  [Roles.ADMIN]: [
    // Admin has ALL permissions
    ...Object.values(Permissions),
  ],
});
