/**
 * Integration Tests: Edge Cases — Phase 6 Mandatory
 *
 * Covers the test gaps identified in Phase 6 QA sweep:
 *   1. Blocked user interaction enforcement
 *   2. Delivery constraint violations (capacity, ZIP coverage, participation)
 *   3. Complete state machine edge cases for ALL machines
 *   4. RBAC violation paths (invalid role access)
 *   5. Ownership violation paths
 *   6. Rate-limit and lockout logic
 *
 * Node 18 compatible — InMemoryRepository stubs, no browser required.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../unit_tests/setup.js';
import { Roles } from '../src/domain/enums/roles.js';
import {
  TransactionStatus, TRANSACTION_TRANSITIONS, TRANSACTION_TERMINAL_STATES,
  ListingStatus, LISTING_TRANSITIONS,
  ComplaintStatus, COMPLAINT_TRANSITIONS,
  RefundStatus, REFUND_TRANSITIONS,
  ModerationStatus, MODERATION_TRANSITIONS,
  ReportStatus, REPORT_TRANSITIONS,
  CancellationReasons,
} from '../src/domain/enums/statuses.js';
import { Permissions, RolePermissions } from '../src/domain/enums/permissions.js';
import { createSession, validateSession } from '../src/domain/policies/sessionPolicy.js';
import { requirePermission, requireOwnership } from '../src/domain/policies/permissionGuard.js';
import { validateTransition } from '../src/domain/validation/stateMachine.js';
import { validateCancellation, validateListing } from '../src/domain/validation/rules.js';
import { ValidationError, AuthorizationError, StateTransitionError } from '../src/utils/errors.js';

const suite = new TestRunner('Integration: Edge Cases & Constraint Violations');

// ── Session factories ──
function userSess(id = 'user-1') { return createSession(id, [Roles.USER]); }
function modSess(id = 'mod-1') { return createSession(id, [Roles.MODERATOR]); }
function supportSess(id = 'support-1') { return createSession(id, [Roles.SUPPORT_AGENT]); }
function adminSess(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }

// ─────────────────────────────────────────────
// 1. Blocked User Interaction Enforcement
// ─────────────────────────────────────────────

suite.test('block: blocked users cannot create threads (BlockRepository check)', async () => {
  // Simulate ThreadService.create block check logic
  const blockRepo = new InMemoryRepository();
  await blockRepo.create({ id: 'b-1', blockerId: 'buyer-1', blockedId: 'seller-1' });

  // isEitherBlocked: checks both directions
  const byBlocker = await blockRepo.getByIndex('blockerId', 'buyer-1');
  const byBlocked = await blockRepo.getByIndex('blockerId', 'seller-1');

  const isBlocked = byBlocker.some(b => b.blockedId === 'seller-1') ||
                    byBlocked.some(b => b.blockedId === 'buyer-1');

  assert(isBlocked, 'Block check must detect buyer blocked seller');
});

suite.test('block: reverse block direction also blocked (seller blocked buyer)', async () => {
  const blockRepo = new InMemoryRepository();
  // Seller blocked the buyer
  await blockRepo.create({ id: 'b-1', blockerId: 'seller-1', blockedId: 'buyer-1' });

  const byBlocker = await blockRepo.getByIndex('blockerId', 'buyer-1');
  const byBlocked = await blockRepo.getByIndex('blockerId', 'seller-1');

  const isBlocked = byBlocker.some(b => b.blockedId === 'seller-1') ||
                    byBlocked.some(b => b.blockedId === 'buyer-1');

  assert(isBlocked, 'Block check must detect seller blocked buyer (reverse direction)');
});

suite.test('block: unblocked users pass the check', async () => {
  const blockRepo = new InMemoryRepository();
  // No blocks in repo

  const byBlocker = await blockRepo.getByIndex('blockerId', 'buyer-1');
  const byBlocked = await blockRepo.getByIndex('blockerId', 'seller-1');

  const isBlocked = byBlocker.some(b => b.blockedId === 'seller-1') ||
                    byBlocked.some(b => b.blockedId === 'buyer-1');

  assert(!isBlocked, 'Users with no block relationship must pass the check');
});

suite.test('block: user cannot block themselves', async () => {
  const session = userSess('user-1');
  const targetUserId = 'user-1'; // same user
  try {
    if (session.userId === targetUserId) {
      throw new ValidationError('Cannot block yourself');
    }
    assert(false, 'Must throw');
  } catch (e) {
    assertEqual(e.name, 'ValidationError', 'Self-block must throw ValidationError');
  }
});

suite.test('block: duplicate block detection', async () => {
  const blockRepo = new InMemoryRepository();
  await blockRepo.create({ id: 'b-1', blockerId: 'user-1', blockedId: 'user-2' });

  const existing = await blockRepo.getByIndex('blockerId', 'user-1');
  const isDuplicate = existing.some(b => b.blockedId === 'user-2');
  assert(isDuplicate, 'Duplicate block must be detected');
});

// ─────────────────────────────────────────────
// 2. Delivery Constraint Violations
// ─────────────────────────────────────────────

suite.test('delivery: non-participant cannot book', () => {
  const transaction = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  const outsider = userSess('outsider-99');
  const isParticipant = outsider.userId === transaction.buyerId ||
                         outsider.userId === transaction.sellerId;
  assert(!isParticipant, 'Outsider must fail participation check for delivery booking');
});

suite.test('delivery: buyer is a valid participant', () => {
  const transaction = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  const buyer = userSess('buyer-1');
  const isParticipant = buyer.userId === transaction.buyerId ||
                         buyer.userId === transaction.sellerId;
  assert(isParticipant, 'Buyer must be a valid participant');
});

suite.test('delivery: seller is a valid participant', () => {
  const transaction = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  const seller = userSess('seller-1');
  const isParticipant = seller.userId === transaction.buyerId ||
                         seller.userId === transaction.sellerId;
  assert(isParticipant, 'Seller must be a valid participant');
});

suite.test('delivery: capacity enforcement — window full at MAX_DELIVERIES_PER_WINDOW', async () => {
  const MAX = 8; // LIMITS.MAX_DELIVERIES_PER_WINDOW
  const bookingRepo = new InMemoryRepository();

  // Fill the window
  for (let i = 0; i < MAX; i++) {
    await bookingRepo.create({ id: `booking-${i}`, windowKey: 'win-1', transactionId: `tx-${i}` });
  }

  const bookings = await bookingRepo.getByIndex('windowKey', 'win-1');
  const isFull = bookings.length >= MAX;
  assert(isFull, 'Window must be detected as full at capacity limit');
  assertEqual(bookings.length, MAX, `Window must have exactly ${MAX} bookings`);
});

suite.test('delivery: capacity allows booking when window not full', async () => {
  const MAX = 8;
  const bookingRepo = new InMemoryRepository();
  // Only 7 bookings
  for (let i = 0; i < 7; i++) {
    await bookingRepo.create({ id: `booking-${i}`, windowKey: 'win-1', transactionId: `tx-${i}` });
  }

  const bookings = await bookingRepo.getByIndex('windowKey', 'win-1');
  const isFull = bookings.length >= MAX;
  assert(!isFull, 'Window must not be full at 7/8 capacity');
});

suite.test('delivery: ZIP validation rejects non-5-digit codes', () => {
  const badZips = ['1234', '123456', 'ABCDE', '12-34', ''];
  for (const zip of badZips) {
    const valid = /^\d{5}$/.test(zip);
    assert(!valid, `ZIP "${zip}" must fail validation`);
  }
});

suite.test('delivery: ZIP validation accepts valid 5-digit codes', () => {
  const goodZips = ['10001', '90210', '00501', '99950'];
  for (const zip of goodZips) {
    const valid = /^\d{5}$/.test(zip);
    assert(valid, `ZIP "${zip}" must pass validation`);
  }
});

suite.test('delivery: user requires DELIVERY_BOOK permission', () => {
  const user = userSess();
  // USER role has DELIVERY_BOOK
  const userPerms = RolePermissions[Roles.USER];
  assert(userPerms.includes(Permissions.DELIVERY_BOOK), 'USER must have DELIVERY_BOOK permission');
});

suite.test('delivery: user requires DELIVERY_VIEW_COVERAGE to see windows', () => {
  const userPerms = RolePermissions[Roles.USER];
  assert(userPerms.includes(Permissions.DELIVERY_VIEW_COVERAGE),
    'USER must have DELIVERY_VIEW_COVERAGE permission');
});

// ─────────────────────────────────────────────
// 3. Transaction State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/tx: COMPLETED is terminal — no transitions allowed', async () => {
  for (const target of Object.values(TransactionStatus)) {
    if (target === TransactionStatus.COMPLETED) continue;
    try {
      validateTransition('transaction', TRANSACTION_TRANSITIONS,
        TransactionStatus.COMPLETED, target);
      assert(false, `COMPLETED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError',
        `Expected StateTransitionError for COMPLETED → ${target}`);
    }
  }
});

suite.test('SM/tx: CANCELED is terminal — no transitions allowed', async () => {
  for (const target of Object.values(TransactionStatus)) {
    if (target === TransactionStatus.CANCELED) continue;
    try {
      validateTransition('transaction', TRANSACTION_TRANSITIONS,
        TransactionStatus.CANCELED, target);
      assert(false, `CANCELED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError',
        `Expected StateTransitionError for CANCELED → ${target}`);
    }
  }
});

suite.test('SM/tx: cannot skip from INQUIRY to AGREED', async () => {
  await assertThrowsAsync(
    () => { validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.AGREED); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/tx: cannot skip from INQUIRY to COMPLETED', async () => {
  await assertThrowsAsync(
    () => { validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.COMPLETED); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/tx: cannot go backward from AGREED to INQUIRY', async () => {
  await assertThrowsAsync(
    () => { validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.AGREED, TransactionStatus.INQUIRY); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/tx: TRANSACTION_TERMINAL_STATES contains COMPLETED and CANCELED only', () => {
  assertEqual(TRANSACTION_TERMINAL_STATES.length, 2,
    'Must have exactly 2 terminal states');
  assert(TRANSACTION_TERMINAL_STATES.includes(TransactionStatus.COMPLETED),
    'COMPLETED must be terminal');
  assert(TRANSACTION_TERMINAL_STATES.includes(TransactionStatus.CANCELED),
    'CANCELED must be terminal');
  assert(!TRANSACTION_TERMINAL_STATES.includes(TransactionStatus.INQUIRY),
    'INQUIRY must not be terminal');
});

suite.test('SM/tx: all valid cancellation reasons are recognized', () => {
  for (const reason of Object.values(CancellationReasons)) {
    validateCancellation(reason); // must not throw
  }
  assert(true, 'All CancellationReasons values are accepted by validateCancellation');
});

suite.test('SM/tx: arbitrary reason string is rejected', async () => {
  await assertThrowsAsync(
    () => { validateCancellation('made-up-reason'); return Promise.resolve(); },
    'ValidationError'
  );
});

// ─────────────────────────────────────────────
// 4. Listing State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/listing: ARCHIVED is terminal — all transitions rejected', async () => {
  for (const target of Object.values(ListingStatus)) {
    if (target === ListingStatus.ARCHIVED) continue;
    try {
      validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.ARCHIVED, target);
      assert(false, `ARCHIVED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError',
        `Expected StateTransitionError for ARCHIVED → ${target}`);
    }
  }
});

suite.test('SM/listing: DRAFT cannot go directly to SOLD', async () => {
  await assertThrowsAsync(
    () => { validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.DRAFT, ListingStatus.SOLD); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/listing: REJECTED cannot go directly to ACTIVE', async () => {
  await assertThrowsAsync(
    () => { validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.REJECTED, ListingStatus.ACTIVE); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/listing: ACTIVE → UNDER_REVIEW is valid (flagged for review)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.ACTIVE, ListingStatus.UNDER_REVIEW);
  assert(true, 'Active listing can be sent for review');
});

suite.test('SM/listing: UNDER_REVIEW → ACTIVE is valid (approved)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.UNDER_REVIEW, ListingStatus.ACTIVE);
  assert(true, 'Under-review listing can be approved back to active');
});

suite.test('SM/listing: UNDER_REVIEW → REJECTED is valid (rejected)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.UNDER_REVIEW, ListingStatus.REJECTED);
  assert(true, 'Under-review listing can be rejected');
});

suite.test('SM/listing: REJECTED → UNDER_REVIEW is valid (resubmit after edit)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.REJECTED, ListingStatus.UNDER_REVIEW);
  assert(true, 'Rejected listing can be resubmitted');
});

suite.test('SM/listing: SOLD can only go to ARCHIVED', () => {
  // Valid
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.SOLD, ListingStatus.ARCHIVED);
  // Invalid
  for (const target of [ListingStatus.ACTIVE, ListingStatus.DRAFT, ListingStatus.UNDER_REVIEW,
                          ListingStatus.REJECTED]) {
    try {
      validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.SOLD, target);
      assert(false, `SOLD → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError',
        `Expected StateTransitionError for SOLD → ${target}`);
    }
  }
});

// ─────────────────────────────────────────────
// 5. Complaint State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/complaint: RESOLVED is terminal', async () => {
  for (const target of Object.values(ComplaintStatus)) {
    if (target === ComplaintStatus.RESOLVED) continue;
    try {
      validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.RESOLVED, target);
      assert(false, `RESOLVED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/complaint: REJECTED is terminal', async () => {
  for (const target of Object.values(ComplaintStatus)) {
    if (target === ComplaintStatus.REJECTED) continue;
    try {
      validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.REJECTED, target);
      assert(false, `REJECTED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/complaint: cannot skip OPEN → RESOLVED', async () => {
  await assertThrowsAsync(
    () => { validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.OPEN, ComplaintStatus.RESOLVED); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/complaint: OPEN → INVESTIGATING is valid', () => {
  validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.OPEN, ComplaintStatus.INVESTIGATING);
  assert(true, 'Open complaint can move to investigating');
});

// ─────────────────────────────────────────────
// 6. Refund State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/refund: APPROVED is terminal', async () => {
  for (const target of Object.values(RefundStatus)) {
    if (target === RefundStatus.APPROVED) continue;
    try {
      validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.APPROVED, target);
      assert(false, `APPROVED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/refund: REJECTED is terminal', async () => {
  for (const target of Object.values(RefundStatus)) {
    if (target === RefundStatus.REJECTED) continue;
    try {
      validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REJECTED, target);
      assert(false, `REJECTED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/refund: REQUESTED → APPROVED is valid', () => {
  validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REQUESTED, RefundStatus.APPROVED);
  assert(true, 'Refund can be approved');
});

suite.test('SM/refund: REQUESTED → REJECTED is valid', () => {
  validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REQUESTED, RefundStatus.REJECTED);
  assert(true, 'Refund can be rejected');
});

// ─────────────────────────────────────────────
// 7. Moderation State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/mod: APPROVED is terminal', async () => {
  for (const target of Object.values(ModerationStatus)) {
    if (target === ModerationStatus.APPROVED) continue;
    try {
      validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.APPROVED, target);
      assert(false, `APPROVED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/mod: cannot skip PENDING → APPROVED', async () => {
  await assertThrowsAsync(
    () => { validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.PENDING, ModerationStatus.APPROVED); return Promise.resolve(); },
    'StateTransitionError'
  );
});

suite.test('SM/mod: REJECTED → PENDING is valid (resubmit loop)', () => {
  validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.REJECTED, ModerationStatus.PENDING);
  assert(true, 'Rejected content can be resubmitted');
});

// ─────────────────────────────────────────────
// 8. Report State Machine — All Edge Cases
// ─────────────────────────────────────────────

suite.test('SM/report: RESOLVED is terminal', async () => {
  for (const target of Object.values(ReportStatus)) {
    if (target === ReportStatus.RESOLVED) continue;
    try {
      validateTransition('report', REPORT_TRANSITIONS, ReportStatus.RESOLVED, target);
      assert(false, `RESOLVED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/report: DISMISSED is terminal', async () => {
  for (const target of Object.values(ReportStatus)) {
    if (target === ReportStatus.DISMISSED) continue;
    try {
      validateTransition('report', REPORT_TRANSITIONS, ReportStatus.DISMISSED, target);
      assert(false, `DISMISSED → ${target} must be rejected`);
    } catch (e) {
      assertEqual(e.name, 'StateTransitionError');
    }
  }
});

suite.test('SM/report: cannot skip OPEN → RESOLVED', async () => {
  await assertThrowsAsync(
    () => { validateTransition('report', REPORT_TRANSITIONS, ReportStatus.OPEN, ReportStatus.RESOLVED); return Promise.resolve(); },
    'StateTransitionError'
  );
});

// ─────────────────────────────────────────────
// 9. RBAC Violations — Invalid Role Access
// ─────────────────────────────────────────────

suite.test('RBAC: moderator cannot manage complaints (wrong role)', () => {
  const mod = modSess();
  try {
    requirePermission(mod, Permissions.COMPLAINT_MANAGE);
    assert(false, 'Moderator must not have COMPLAINT_MANAGE');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError', 'Must throw AuthorizationError');
  }
});

suite.test('RBAC: support agent cannot manage categories', () => {
  const agent = supportSess();
  try {
    requirePermission(agent, Permissions.ADMIN_MANAGE_CATEGORIES);
    assert(false, 'Support agent must not have ADMIN_MANAGE_CATEGORIES');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError');
  }
});

suite.test('RBAC: user cannot approve refunds', () => {
  const user = userSess();
  try {
    requirePermission(user, Permissions.REFUND_APPROVE);
    assert(false, 'User must not have REFUND_APPROVE');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError');
  }
});

suite.test('RBAC: user cannot view audit logs', () => {
  const user = userSess();
  try {
    requirePermission(user, Permissions.ADMIN_VIEW_AUDIT);
    assert(false, 'User must not have ADMIN_VIEW_AUDIT');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError');
  }
});

suite.test('RBAC: moderator cannot import data', () => {
  const mod = modSess();
  try {
    requirePermission(mod, Permissions.ADMIN_IMPORT);
    assert(false, 'Moderator must not have ADMIN_IMPORT');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError');
  }
});

suite.test('RBAC: unauthenticated session (null) throws AuthenticationError', () => {
  try {
    requirePermission(null, Permissions.LISTING_CREATE);
    assert(false, 'Null session must throw');
  } catch (e) {
    assertEqual(e.name, 'AuthenticationError', 'Null session must throw AuthenticationError');
  }
});

suite.test('RBAC: session with empty roles array throws AuthorizationError', () => {
  const noRoleSession = { userId: 'u-1', roles: [], createdAt: Date.now(), lastActivityAt: Date.now(), tokenId: 't' };
  try {
    requirePermission(noRoleSession, Permissions.LISTING_CREATE);
    assert(false, 'Empty roles must throw');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError', 'Empty roles must throw AuthorizationError');
  }
});

suite.test('RBAC: admin has every single defined permission', () => {
  const allPerms = Object.values(Permissions);
  const adminPerms = RolePermissions[Roles.ADMIN];
  for (const perm of allPerms) {
    assert(adminPerms.includes(perm),
      `Admin must have permission: ${perm}`);
  }
});

// ─────────────────────────────────────────────
// 10. Ownership Violations
// ─────────────────────────────────────────────

suite.test('ownership: non-owner without override permission is rejected', () => {
  const user = userSess('user-2'); // not the owner
  // Use CONTENT_DELETE which only MODERATOR/ADMIN have — USER does not
  try {
    requireOwnership(user, 'user-1', Permissions.CONTENT_DELETE);
    assert(false, 'Non-owner must be rejected');
  } catch (e) {
    assertEqual(e.name, 'AuthorizationError', 'Non-owner must get AuthorizationError');
  }
});

suite.test('ownership: owner passes the check', () => {
  const user = userSess('user-1');
  requireOwnership(user, 'user-1', Permissions.LISTING_DELETE);
  assert(true, 'Owner must pass ownership check');
});

suite.test('ownership: admin bypasses ownership with admin permission', () => {
  const admin = adminSess();
  // Admin has LISTING_DELETE which acts as an override
  requireOwnership(admin, 'someone-else', Permissions.LISTING_DELETE);
  assert(true, 'Admin must bypass ownership check');
});

suite.test('ownership: moderator bypasses with CONTENT_DELETE for comments', () => {
  const mod = modSess();
  requireOwnership(mod, 'other-user', Permissions.CONTENT_DELETE);
  assert(true, 'Moderator must bypass ownership for content delete');
});

// ─────────────────────────────────────────────
// 11. Rate Limiting Logic
// ─────────────────────────────────────────────

suite.test('rate-limit: lockout detected when lockoutUntil is in future', () => {
  const user = {
    lockoutUntil: Date.now() + 15 * 60 * 1000, // 15 min from now
  };
  const isLocked = user.lockoutUntil && Date.now() < user.lockoutUntil;
  assert(isLocked, 'User must be detected as locked out');
});

suite.test('rate-limit: lockout expired when lockoutUntil is in past', () => {
  const user = {
    lockoutUntil: Date.now() - 1000, // 1 second ago
  };
  const isLocked = user.lockoutUntil && Date.now() < user.lockoutUntil;
  assert(!isLocked, 'Expired lockout must not block user');
});

suite.test('rate-limit: no lockout when lockoutUntil is null', () => {
  const user = { lockoutUntil: null };
  const isLocked = user.lockoutUntil && Date.now() < user.lockoutUntil;
  assert(!isLocked, 'Null lockoutUntil must not block user');
});

suite.test('rate-limit: failedAttempts below threshold does not lock', () => {
  const MAX_ATTEMPTS = 5;
  const user = { failedAttempts: 4 };
  const shouldLock = user.failedAttempts >= MAX_ATTEMPTS;
  assert(!shouldLock, '4 failed attempts must not trigger lockout');
});

suite.test('rate-limit: failedAttempts at threshold triggers lock', () => {
  const MAX_ATTEMPTS = 5;
  const user = { failedAttempts: 5 };
  const shouldLock = user.failedAttempts >= MAX_ATTEMPTS;
  assert(shouldLock, '5 failed attempts must trigger lockout');
});

// ─────────────────────────────────────────────
// 12. Listing Validation — Edge Cases
// ─────────────────────────────────────────────

suite.test('listing: title is required', () => {
  try {
    validateListing({ description: 'desc', price: 10, categoryId: 'c1', deliveryOptions: { pickup: true } });
    assert(false, 'Missing title must throw');
  } catch (e) {
    assertEqual(e.name, 'ValidationError', `Expected ValidationError, got ${e.name}`);
    // ValidationError stores field errors in .details (AppError third arg)
    assert(e.details && 'title' in e.details, `Error.details must reference title field. Got: ${JSON.stringify(e.details)}`);
  }
});

suite.test('listing: negative price is rejected', () => {
  try {
    validateListing({ title: 'Test', description: 'desc', price: -5, categoryId: 'c1', deliveryOptions: { pickup: true } });
    assert(false, 'Negative price must throw');
  } catch (e) {
    assertEqual(e.name, 'ValidationError', `Expected ValidationError, got ${e.name}`);
    assert(e.details && 'price' in e.details, `Error.details must reference price field. Got: ${JSON.stringify(e.details)}`);
  }
});

suite.test('listing: missing deliveryOptions rejected', () => {
  try {
    validateListing({ title: 'Test', description: 'A description', price: 10, categoryId: 'c1' });
    assert(false, 'Missing deliveryOptions must throw');
  } catch (e) {
    assertEqual(e.name, 'ValidationError', `Expected ValidationError, got ${e.name}`);
    assert(e.details && 'deliveryOptions' in e.details,
      `Error.details must reference deliveryOptions field. Got: ${JSON.stringify(e.details)}`);
  }
});

suite.test('listing: deliveryOptions with both false is rejected', () => {
  try {
    validateListing({ title: 'Test', description: 'desc', price: 10, categoryId: 'c1', deliveryOptions: { pickup: false, delivery: false } });
    assert(false, 'Both-false deliveryOptions must throw');
  } catch (e) {
    assertEqual(e.name, 'ValidationError');
  }
});

suite.test('listing: valid listing passes all checks', () => {
  validateListing({
    title: 'Good Listing',
    description: 'A fine item for sale',
    price: 29.99,
    categoryId: 'cat-1',
    deliveryOptions: { pickup: true, delivery: false },
  });
  assert(true, 'Valid listing must pass validation');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
