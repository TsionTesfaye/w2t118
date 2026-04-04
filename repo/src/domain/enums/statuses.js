/**
 * All lifecycle state enums and their allowed transitions.
 * State machines are enforced in services — this is the definition source.
 */

// ── Transaction States ──
export const TransactionStatus = Object.freeze({
  INQUIRY: 'inquiry',
  RESERVED: 'reserved',
  AGREED: 'agreed',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
});

export const TRANSACTION_TRANSITIONS = Object.freeze({
  [TransactionStatus.INQUIRY]: [TransactionStatus.RESERVED, TransactionStatus.CANCELED],
  [TransactionStatus.RESERVED]: [TransactionStatus.AGREED, TransactionStatus.CANCELED],
  [TransactionStatus.AGREED]: [TransactionStatus.COMPLETED, TransactionStatus.CANCELED],
  [TransactionStatus.COMPLETED]: [], // terminal
  [TransactionStatus.CANCELED]: [],  // terminal
});

export const TRANSACTION_TERMINAL_STATES = Object.freeze([
  TransactionStatus.COMPLETED,
  TransactionStatus.CANCELED,
]);

// ── Listing States ──
export const ListingStatus = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  UNDER_REVIEW: 'under_review',
  REJECTED: 'rejected',
  SOLD: 'sold',
  ARCHIVED: 'archived',
});

export const LISTING_TRANSITIONS = Object.freeze({
  [ListingStatus.DRAFT]: [ListingStatus.ACTIVE, ListingStatus.UNDER_REVIEW],
  [ListingStatus.ACTIVE]: [ListingStatus.UNDER_REVIEW, ListingStatus.SOLD, ListingStatus.ARCHIVED],
  [ListingStatus.UNDER_REVIEW]: [ListingStatus.ACTIVE, ListingStatus.REJECTED],
  [ListingStatus.REJECTED]: [ListingStatus.UNDER_REVIEW], // resubmit after edit
  [ListingStatus.SOLD]: [ListingStatus.ARCHIVED],
  [ListingStatus.ARCHIVED]: [], // terminal
});

// ── Complaint States ──
export const ComplaintStatus = Object.freeze({
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
});

export const COMPLAINT_TRANSITIONS = Object.freeze({
  [ComplaintStatus.OPEN]: [ComplaintStatus.INVESTIGATING, ComplaintStatus.REJECTED],
  [ComplaintStatus.INVESTIGATING]: [ComplaintStatus.RESOLVED, ComplaintStatus.REJECTED],
  [ComplaintStatus.RESOLVED]: [], // terminal
  [ComplaintStatus.REJECTED]: [], // terminal
});

// ── Refund States ──
export const RefundStatus = Object.freeze({
  REQUESTED: 'requested',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const REFUND_TRANSITIONS = Object.freeze({
  [RefundStatus.REQUESTED]: [RefundStatus.APPROVED, RefundStatus.REJECTED],
  [RefundStatus.APPROVED]: [],  // terminal
  [RefundStatus.REJECTED]: [],  // terminal
});

// ── Moderation States ──
export const ModerationStatus = Object.freeze({
  PENDING: 'pending',        // pre-screen flagged
  IN_REVIEW: 'in_review',    // moderator picked up
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

export const MODERATION_TRANSITIONS = Object.freeze({
  [ModerationStatus.PENDING]: [ModerationStatus.IN_REVIEW],
  [ModerationStatus.IN_REVIEW]: [ModerationStatus.APPROVED, ModerationStatus.REJECTED],
  [ModerationStatus.APPROVED]: [],  // terminal
  [ModerationStatus.REJECTED]: [ModerationStatus.PENDING], // resubmit
});

// ── Report States ──
export const ReportStatus = Object.freeze({
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
});

export const REPORT_TRANSITIONS = Object.freeze({
  [ReportStatus.OPEN]: [ReportStatus.UNDER_REVIEW],
  [ReportStatus.UNDER_REVIEW]: [ReportStatus.RESOLVED, ReportStatus.DISMISSED],
  [ReportStatus.RESOLVED]: [],
  [ReportStatus.DISMISSED]: [],
});

// ── Cancellation Reason Codes ──
export const CancellationReasons = Object.freeze({
  BUYER_CHANGED_MIND: 'buyer_changed_mind',
  SELLER_UNAVAILABLE: 'seller_unavailable',
  ITEM_NO_LONGER_AVAILABLE: 'item_no_longer_available',
  PRICE_DISAGREEMENT: 'price_disagreement',
  RESERVATION_EXPIRED: 'reservation_expired',
  OTHER: 'other',
});
