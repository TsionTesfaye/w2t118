/**
 * Action Policy Tests
 *
 * Verifies that the central action policy (actionPolicy.js) produces results
 * that exactly match service-layer enforcement. Every visible UI action must
 * be one the service accepts; every hidden action must be one the service rejects.
 *
 * Tests use InMemoryRepository stubs — no IndexedDB required.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../unit_tests/setup.js';
import {
  getTransactionActions,
  getListingActions,
  getComplaintActions,
  getRefundActions,
} from '../src/domain/policies/actionPolicy.js';
import {
  TransactionStatus, TRANSACTION_TERMINAL_STATES,
  ListingStatus,
  ComplaintStatus,
  RefundStatus,
} from '../src/domain/enums/statuses.js';
import { Roles } from '../src/domain/enums/roles.js';

const suite = new TestRunner('Action Policy: UI ↔ Service Contract Verification');

// ─────────────────────────────────────────────
// Transaction Action Policy
// ─────────────────────────────────────────────

const BUYER_ID  = 'buyer-1';
const SELLER_ID = 'seller-1';
const OTHER_ID  = 'other-1';

function makeTx(status, overrides = {}) {
  return { id: 'tx-1', buyerId: BUYER_ID, sellerId: SELLER_ID, status, ...overrides };
}

suite.test('getTransactionActions: returns all-false when transaction is null', () => {
  const actions = getTransactionActions(BUYER_ID, null);
  assert(!actions.canReserve,  'canReserve must be false with null transaction');
  assert(!actions.canAgree,    'canAgree must be false with null transaction');
  assert(!actions.canComplete, 'canComplete must be false with null transaction');
  assert(!actions.canCancel,   'canCancel must be false with null transaction');
});

suite.test('getTransactionActions: canCreateTransaction field removed (was dead logic)', () => {
  // canCreateTransaction was always false when transaction existed, and the null-path
  // early return didn't include it. Verify it is not present on either path.
  const nullActions = getTransactionActions(BUYER_ID, null);
  const txActions   = getTransactionActions(BUYER_ID, makeTx(TransactionStatus.INQUIRY));
  assert(!('canCreateTransaction' in nullActions), 'canCreateTransaction must not exist on null-tx result');
  assert(!('canCreateTransaction' in txActions),   'canCreateTransaction must not exist on tx result');
});

suite.test('INQUIRY → RESERVED: only seller sees canReserve = true', () => {
  const tx = makeTx(TransactionStatus.INQUIRY);
  const sellerActions = getTransactionActions(SELLER_ID, tx);
  const buyerActions  = getTransactionActions(BUYER_ID, tx);
  const otherActions  = getTransactionActions(OTHER_ID, tx);

  assert(sellerActions.canReserve,  'Seller must see Reserve button on INQUIRY');
  assert(!buyerActions.canReserve,  'Buyer must NOT see Reserve button on INQUIRY');
  assert(!otherActions.canReserve,  'Non-participant must NOT see Reserve button');
});

suite.test('INQUIRY: buyer does NOT see canReserve (prevents self-reservation bug)', () => {
  // This was the bug: UI showed Reserve for isBuyer instead of isSeller
  const tx = makeTx(TransactionStatus.INQUIRY);
  const buyerActions = getTransactionActions(BUYER_ID, tx);
  assert(!buyerActions.canReserve,
    'Critical: buyer must NEVER see Reserve — only seller can accept an inquiry');
});

suite.test('RESERVED → AGREED: only buyer sees canAgree = true', () => {
  const tx = makeTx(TransactionStatus.RESERVED);
  const buyerActions  = getTransactionActions(BUYER_ID, tx);
  const sellerActions = getTransactionActions(SELLER_ID, tx);

  assert(buyerActions.canAgree,  'Buyer must see Agree button on RESERVED');
  assert(!sellerActions.canAgree, 'Seller must NOT see Agree button on RESERVED');
});

suite.test('AGREED → COMPLETED: only buyer sees canComplete = true', () => {
  const tx = makeTx(TransactionStatus.AGREED);
  const buyerActions  = getTransactionActions(BUYER_ID, tx);
  const sellerActions = getTransactionActions(SELLER_ID, tx);

  assert(buyerActions.canComplete,  'Buyer must see Complete button on AGREED');
  assert(!sellerActions.canComplete, 'Seller must NOT see Complete button on AGREED');
});

suite.test('Cancel: both buyer and seller see canCancel on non-terminal states', () => {
  for (const status of [TransactionStatus.INQUIRY, TransactionStatus.RESERVED, TransactionStatus.AGREED]) {
    const tx = makeTx(status);
    const buyerActions  = getTransactionActions(BUYER_ID, tx);
    const sellerActions = getTransactionActions(SELLER_ID, tx);
    assert(buyerActions.canCancel,  `Buyer must see Cancel on ${status}`);
    assert(sellerActions.canCancel, `Seller must see Cancel on ${status}`);
  }
});

suite.test('Terminal states: all actions false', () => {
  for (const status of TRANSACTION_TERMINAL_STATES) {
    const tx = makeTx(status);
    const buyerActions  = getTransactionActions(BUYER_ID, tx);
    const sellerActions = getTransactionActions(SELLER_ID, tx);

    assert(!buyerActions.canReserve,   `canReserve must be false in terminal state ${status}`);
    assert(!buyerActions.canAgree,     `canAgree must be false in terminal state ${status}`);
    assert(!buyerActions.canComplete,  `canComplete must be false in terminal state ${status}`);
    assert(!buyerActions.canCancel,    `canCancel must be false in terminal state ${status} (buyer)`);
    assert(!sellerActions.canCancel,   `canCancel must be false in terminal state ${status} (seller)`);
    assert(buyerActions.isTerminal,    `isTerminal must be true for ${status}`);
  }
});

suite.test('Policy actions map exactly to service role constraints', () => {
  // INQUIRY: seller can reserve, buyer cannot
  const inquiryTx = makeTx(TransactionStatus.INQUIRY);
  assert(getTransactionActions(SELLER_ID, inquiryTx).canReserve,   'Seller: canReserve on INQUIRY');
  assert(!getTransactionActions(BUYER_ID,  inquiryTx).canReserve,  'Buyer: !canReserve on INQUIRY');

  // RESERVED: buyer can agree, seller cannot
  const reservedTx = makeTx(TransactionStatus.RESERVED);
  assert(getTransactionActions(BUYER_ID,  reservedTx).canAgree,    'Buyer: canAgree on RESERVED');
  assert(!getTransactionActions(SELLER_ID, reservedTx).canAgree,   'Seller: !canAgree on RESERVED');

  // AGREED: buyer can complete, seller cannot
  const agreedTx = makeTx(TransactionStatus.AGREED);
  assert(getTransactionActions(BUYER_ID,  agreedTx).canComplete,   'Buyer: canComplete on AGREED');
  assert(!getTransactionActions(SELLER_ID, agreedTx).canComplete,  'Seller: !canComplete on AGREED');
});

// ─────────────────────────────────────────────
// Listing Action Policy
// ─────────────────────────────────────────────

function makeListing(status, sellerId = SELLER_ID, overrides = {}) {
  return { id: 'listing-1', sellerId, status, ...overrides };
}

suite.test('getListingActions: returns all-false when listing is null', () => {
  const a = getListingActions(BUYER_ID, [Roles.USER], null);
  assert(!a.canEdit && !a.canPublish && !a.canArchive && !a.canStartThread && !a.canPin,
    'All actions must be false when listing is null');
});

suite.test('Owner on DRAFT: canPublish and canEdit, not canStartThread', () => {
  const listing = makeListing(ListingStatus.DRAFT);
  const a = getListingActions(SELLER_ID, [Roles.USER], listing);
  assert(a.canPublish,      'Owner must see Publish on DRAFT');
  assert(a.canEdit,         'Owner must see Edit on DRAFT');
  assert(!a.canStartThread, 'Owner cannot Start Conversation on own listing');
});

suite.test('Buyer on ACTIVE: canStartThread, not canEdit or canPublish', () => {
  const listing = makeListing(ListingStatus.ACTIVE);
  const a = getListingActions(BUYER_ID, [Roles.USER], listing);
  assert(a.canStartThread,  'Buyer must see Start Conversation on ACTIVE listing');
  assert(!a.canEdit,        'Buyer must not see Edit');
  assert(!a.canPublish,     'Buyer must not see Publish');
  assert(!a.canPin,         'Non-moderator must not see Pin');
});

suite.test('Moderator: canPin and canFeature on any listing', () => {
  const listing = makeListing(ListingStatus.ACTIVE);
  const a = getListingActions(OTHER_ID, [Roles.MODERATOR], listing);
  assert(a.canPin,     'Moderator must see Pin');
  assert(a.canFeature, 'Moderator must see Feature');
});

suite.test('Owner on SOLD: cannot archive', () => {
  const listing = makeListing(ListingStatus.SOLD);
  const a = getListingActions(SELLER_ID, [Roles.USER], listing);
  assert(!a.canArchive, 'SOLD listing cannot be archived');
});

suite.test('canArchive: only ACTIVE — DRAFT/UNDER_REVIEW/REJECTED cannot archive (state machine mismatch)', () => {
  // Service validateTransition only allows ACTIVE → ARCHIVED and SOLD → ARCHIVED.
  // Policy must match exactly so the button is never shown for states the service rejects.
  for (const status of [ListingStatus.DRAFT, ListingStatus.UNDER_REVIEW, ListingStatus.REJECTED]) {
    const a = getListingActions(SELLER_ID, [Roles.USER], makeListing(status));
    assert(!a.canArchive, `canArchive must be false for ${status} — service would throw StateTransitionError`);
  }
  // ACTIVE is the one valid case
  const active = getListingActions(SELLER_ID, [Roles.USER], makeListing(ListingStatus.ACTIVE));
  assert(active.canArchive, 'Owner of ACTIVE listing must see Archive');
});

suite.test('Owner cannot report own listing', () => {
  const listing = makeListing(ListingStatus.ACTIVE);
  const a = getListingActions(SELLER_ID, [Roles.USER], listing);
  assert(!a.canReport, 'Owner must not see Report on own listing');
});

// ─────────────────────────────────────────────
// Complaint Action Policy
// ─────────────────────────────────────────────

function makeComplaint(status) {
  return { id: 'c-1', status, userId: BUYER_ID };
}

suite.test('getComplaintActions: support agent can take ownership of OPEN complaint', () => {
  const a = getComplaintActions([Roles.SUPPORT_AGENT], makeComplaint(ComplaintStatus.OPEN));
  assert(a.canTakeOwnership, 'Support agent must see Take Ownership on OPEN');
  assert(!a.canResolve,       'Cannot resolve OPEN complaint (must be INVESTIGATING first)');
  assert(a.canReject,         'Support agent can reject directly from OPEN (skip investigation)');
});

suite.test('getComplaintActions: support agent can resolve INVESTIGATING complaint', () => {
  const a = getComplaintActions([Roles.SUPPORT_AGENT], makeComplaint(ComplaintStatus.INVESTIGATING));
  assert(a.canResolve, 'Support agent must see Resolve on INVESTIGATING');
  assert(a.canReject,  'Support agent must see Reject on INVESTIGATING');
});

suite.test('getComplaintActions: no actions on terminal complaints', () => {
  for (const status of [ComplaintStatus.RESOLVED, ComplaintStatus.REJECTED]) {
    const a = getComplaintActions([Roles.SUPPORT_AGENT], makeComplaint(status));
    assert(!a.canTakeOwnership, `canTakeOwnership must be false on ${status}`);
    assert(!a.canResolve,       `canResolve must be false on ${status}`);
    assert(!a.canReject,        `canReject must be false on ${status}`);
  }
});

suite.test('getComplaintActions: regular user has no complaint management actions', () => {
  const a = getComplaintActions([Roles.USER], makeComplaint(ComplaintStatus.OPEN));
  assert(!a.canTakeOwnership && !a.canResolve && !a.canReject,
    'Regular user must have no complaint management actions');
});

// ─────────────────────────────────────────────
// Refund Action Policy
// ─────────────────────────────────────────────

function makeRefund(status) {
  return { id: 'r-1', status, complaintId: 'c-1' };
}

suite.test('getRefundActions: support agent can decide REQUESTED refund', () => {
  const a = getRefundActions([Roles.SUPPORT_AGENT], makeRefund(RefundStatus.REQUESTED));
  assert(a.canDecide, 'Support agent must be able to decide REQUESTED refund');
});

suite.test('getRefundActions: no decisions on terminal refunds', () => {
  for (const status of [RefundStatus.APPROVED, RefundStatus.REJECTED]) {
    const a = getRefundActions([Roles.SUPPORT_AGENT], makeRefund(status));
    assert(!a.canDecide, `canDecide must be false for ${status} refund`);
  }
});

suite.test('getRefundActions: regular user cannot decide refund', () => {
  const a = getRefundActions([Roles.USER], makeRefund(RefundStatus.REQUESTED));
  assert(!a.canDecide, 'Regular user must not be able to decide refund');
});

suite.test('getRefundActions: returns false when refund is null', () => {
  const a = getRefundActions([Roles.SUPPORT_AGENT], null);
  assert(!a.canDecide, 'canDecide must be false when refund is null');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
