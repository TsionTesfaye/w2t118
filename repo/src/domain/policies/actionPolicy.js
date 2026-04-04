/**
 * Central Action Policy
 *
 * Single source of truth for which UI actions are visible per (role × state).
 * ALL components MUST derive button/action visibility from these functions.
 * Services enforce the same rules — this layer makes them visible in the UI.
 *
 * Rule: if a service will reject an action, the UI must not show it.
 * Rule: never duplicate role/state logic in individual components.
 */

import {
  TransactionStatus,
  TRANSACTION_TERMINAL_STATES,
  ListingStatus,
  ComplaintStatus,
  RefundStatus,
} from '../enums/statuses.js';
import { Roles } from '../enums/roles.js';
import { Permissions } from '../enums/permissions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transaction actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns which transaction state-transition buttons the current user may see.
 *
 * Role constraints mirror TransactionService._requireRoleForTransition():
 *   INQUIRY  → RESERVED  : seller only   (seller accepts the inquiry)
 *   RESERVED → AGREED    : buyer only    (buyer confirms they want to proceed)
 *   AGREED   → COMPLETED : buyer only    (buyer confirms receipt)
 *   → CANCELED            : either party (any non-terminal state)
 *
 * @param {string}  userId      - Current user's ID
 * @param {object}  transaction - Transaction record
 * @returns {{canReserve, canAgree, canComplete, canCancel, isTerminal}}
 */
export function getTransactionActions(userId, transaction) {
  if (!transaction) {
    return { canReserve: false, canAgree: false, canComplete: false, canCancel: false, isTerminal: false };
  }

  const { status, buyerId, sellerId } = transaction;
  const isBuyer  = userId === buyerId;
  const isSeller = userId === sellerId;
  const isTerminal = TRANSACTION_TERMINAL_STATES.includes(status);

  return {
    isTerminal,
    // Only the SELLER can accept an inquiry
    canReserve:  status === TransactionStatus.INQUIRY  && isSeller,
    // Only the BUYER can confirm a reservation
    canAgree:    status === TransactionStatus.RESERVED && isBuyer,
    // Only the BUYER can confirm completion
    canComplete: status === TransactionStatus.AGREED   && isBuyer,
    // Either participant can cancel while non-terminal
    canCancel:   !isTerminal && (isBuyer || isSeller),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns which listing actions the current user may see.
 *
 * @param {string}   userId  - Current user's ID
 * @param {string[]} roles   - Current user's roles
 * @param {object}   listing - Listing record
 * @returns {{canEdit, canPublish, canArchive, canStartThread, canPin, canFeature, canReport}}
 */
export function getListingActions(userId, roles, listing) {
  if (!listing) {
    return { canEdit: false, canPublish: false, canArchive: false, canStartThread: false, canPin: false, canFeature: false, canReport: false };
  }

  const isOwner     = listing.sellerId === userId;
  const isModerator = roles.includes(Roles.MODERATOR) || roles.includes(Roles.ADMIN);
  const { status }  = listing;

  return {
    // Owner actions
    canEdit:        isOwner && [ListingStatus.DRAFT, ListingStatus.ACTIVE, ListingStatus.REJECTED].includes(status),
    canPublish:     isOwner && status === ListingStatus.DRAFT,
    // ACTIVE is the only state the service/state-machine allows to transition → ARCHIVED
    canArchive:     isOwner && status === ListingStatus.ACTIVE,
    // Buyer action (non-owner, active listing)
    canStartThread: !isOwner && status === ListingStatus.ACTIVE,
    // Moderator actions
    canPin:         isModerator,
    canFeature:     isModerator,
    canReport:      !isOwner,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Complaint actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns which complaint actions a support agent may perform.
 *
 * @param {string[]} roles     - Current user's roles
 * @param {object}   complaint - Complaint record
 * @returns {{canTakeOwnership, canResolve, canReject, canRequestRefund}}
 */
export function getComplaintActions(roles, complaint) {
  if (!complaint) {
    return { canTakeOwnership: false, canResolve: false, canReject: false };
  }

  const isSupportOrAdmin = roles.includes(Roles.SUPPORT_AGENT) || roles.includes(Roles.ADMIN);
  const { status } = complaint;

  return {
    canTakeOwnership: isSupportOrAdmin && status === ComplaintStatus.OPEN,
    canResolve:       isSupportOrAdmin && status === ComplaintStatus.INVESTIGATING,
    canReject:        isSupportOrAdmin && [ComplaintStatus.OPEN, ComplaintStatus.INVESTIGATING].includes(status),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refund actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether a refund decision can be made.
 *
 * @param {string[]} roles  - Current user's roles
 * @param {object}   refund - Refund record
 * @returns {{canDecide}}
 */
export function getRefundActions(roles, refund) {
  if (!refund) return { canDecide: false };
  const isSupportOrAdmin = roles.includes(Roles.SUPPORT_AGENT) || roles.includes(Roles.ADMIN);
  return {
    canDecide: isSupportOrAdmin && refund.status === RefundStatus.REQUESTED,
  };
}
