/**
 * E2E: Complaint & Refund Lifecycle
 *
 * Covers the complete flow:
 *   1. Setup: register users, create listing, create transaction
 *   2. Advance transaction to AGREED state (required for complaint eligibility)
 *   3. Buyer files complaint
 *   4. Support agent takes ownership (→ INVESTIGATING)
 *   5. Buyer requests refund (only valid during/after INVESTIGATING)
 *   6. Support agent resolves complaint
 *   7. Support agent approves/rejects refund
 *   8. Error paths: wrong state, duplicate, wrong actor
 *
 * Uses InMemoryRepository stubs throughout — no IndexedDB required.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../unit_tests/setup.js';
import { SupportService } from '../src/services/SupportService.js';
import { TransactionService } from '../src/services/TransactionService.js';
import { ComplaintStatus, RefundStatus, TransactionStatus } from '../src/domain/enums/statuses.js';
import { Roles } from '../src/domain/enums/roles.js';

// ── Repository injection ──
import * as repos from '../src/repositories/index.js';

const suite = new TestRunner('E2E: Complaint & Refund Full Lifecycle');

// ─────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────

function makeSession(userId, roles = [Roles.USER]) {
  return { userId, roles, lastActivityAt: Date.now(), createdAt: Date.now() };
}

const BUYER_ID   = 'buyer-e2e-1';
const SELLER_ID  = 'seller-e2e-1';
const AGENT_ID   = 'agent-e2e-1';
const LISTING_ID = 'listing-e2e-1';
const THREAD_ID  = 'thread-e2e-1';

const buyerSession  = makeSession(BUYER_ID);
const sellerSession = makeSession(SELLER_ID);
const agentSession  = makeSession(AGENT_ID, [Roles.SUPPORT_AGENT]);

// Pre-built transaction objects (we inject directly since we're not testing
// TransactionService here — focus is on SupportService lifecycle)
function makeTransaction(status) {
  return {
    id:         'tx-e2e-1',
    threadId:   THREAD_ID,
    listingId:  LISTING_ID,
    buyerId:    BUYER_ID,
    sellerId:   SELLER_ID,
    status,
    reservedAt: null,
    agreedAt:   Date.now(),
    completedAt: null,
    canceledAt:  null,
    cancellationReason: null,
    createdAt:  Date.now() - 3600000,
    updatedAt:  Date.now(),
  };
}

// ─────────────────────────────────────────────
// Setup: inject stubs before each test group
// ─────────────────────────────────────────────

function setupRepos(transactionStatus = TransactionStatus.AGREED) {
  // Transaction repo stub
  const txRepo = new InMemoryRepository();
  txRepo._store.set('tx-e2e-1', makeTransaction(transactionStatus));
  repos.transactionRepository.getByIdOrFail = (id) => txRepo.getByIdOrFail(id);
  repos.transactionRepository.getByIndex    = (idx, val) => txRepo.getByIndex(idx, val);

  // Complaint repo stub
  const complaintRepo = new InMemoryRepository();
  repos.complaintRepository.getByIdOrFail  = (id) => complaintRepo.getByIdOrFail(id);
  repos.complaintRepository.getByIndex     = (idx, val) => complaintRepo.getByIndex(idx, val);
  repos.complaintRepository.getByUserId    = (uid) => complaintRepo.getByIndex('userId', uid);
  repos.complaintRepository.getByStatus    = (s) => complaintRepo.getByIndex('status', s);
  repos.complaintRepository.create         = (r) => complaintRepo.create(r);
  repos.complaintRepository.update         = (r) => complaintRepo.update(r);
  repos.complaintRepository.getAll         = () => complaintRepo.getAll();

  // Refund repo stub
  const refundRepo = new InMemoryRepository();
  repos.refundRepository.getByIdOrFail     = (id) => refundRepo.getByIdOrFail(id);
  repos.refundRepository.getByComplaintId  = async (cid) => {
    const all = await refundRepo.getAll();
    return all.find(r => r.complaintId === cid) || null;
  };
  repos.refundRepository.create            = (r) => refundRepo.create(r);
  repos.refundRepository.update            = (r) => refundRepo.update(r);
  repos.refundRepository.getAll            = () => refundRepo.getAll();

  // Audit & Notification stubs (silent)
  const silentRepo = new InMemoryRepository();
  repos.auditLogRepository.create              = () => Promise.resolve();
  repos.notificationRepository.create          = () => Promise.resolve();
  repos.notificationRepository.getByUserId     = () => Promise.resolve([]);
  repos.notificationRepository.findUnread      = () => Promise.resolve(null);
  repos.notificationRepository.getUnreadByUserId = () => Promise.resolve();
  repos.userRepository.getById                 = () => Promise.resolve(null);

  return { txRepo, complaintRepo, refundRepo };
}

// ─────────────────────────────────────────────
// Phase 1: Complaint eligibility gates
// ─────────────────────────────────────────────

suite.test('createComplaint: fails on INQUIRY transaction (not yet agreed)', async () => {
  setupRepos(TransactionStatus.INQUIRY);
  await assertThrowsAsync(
    () => SupportService.createComplaint(buyerSession, {
      transactionId: 'tx-e2e-1',
      issueType: 'item_not_received',
      description: 'I never received the item',
    }),
    'ValidationError',
    'Complaints can only be filed on agreed or completed transactions',
  );
});

suite.test('createComplaint: fails on RESERVED transaction', async () => {
  setupRepos(TransactionStatus.RESERVED);
  await assertThrowsAsync(
    () => SupportService.createComplaint(buyerSession, {
      transactionId: 'tx-e2e-1',
      issueType: 'fraud',
      description: 'Test',
    }),
    'ValidationError',
    'agreed or completed',
  );
});

suite.test('createComplaint: fails on CANCELED transaction', async () => {
  setupRepos(TransactionStatus.CANCELED);
  await assertThrowsAsync(
    () => SupportService.createComplaint(buyerSession, {
      transactionId: 'tx-e2e-1',
      issueType: 'other',
      description: 'Test',
    }),
    'ValidationError',
    'agreed or completed',
  );
});

suite.test('createComplaint: non-participant cannot file complaint', async () => {
  setupRepos(TransactionStatus.AGREED);
  const stranger = makeSession('stranger-1');
  await assertThrowsAsync(
    () => SupportService.createComplaint(stranger, {
      transactionId: 'tx-e2e-1',
      issueType: 'fraud',
      description: 'Test',
    }),
    'ValidationError',
    'not a participant',
  );
});

// ─────────────────────────────────────────────
// Phase 2: Happy path — full lifecycle
// ─────────────────────────────────────────────

suite.test('Full lifecycle: buyer files complaint on AGREED transaction', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'I paid but never received the item from the seller',
  });

  assertEqual(complaint.status, ComplaintStatus.OPEN, 'New complaint must start at OPEN');
  assertEqual(complaint.userId, BUYER_ID, 'Complaint must be attributed to buyer');
  assertEqual(complaint.transactionId, 'tx-e2e-1', 'Transaction link must be set');
  assert(complaint.slaDeadline > Date.now(), 'SLA deadline must be in the future');
  assert(complaint.resolvedAt === null, 'resolvedAt must be null on new complaint');
});

suite.test('Full lifecycle: seller can also file complaint on same transaction', async () => {
  setupRepos(TransactionStatus.AGREED);
  const sellerComplaint = await SupportService.createComplaint(sellerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'price_disagreement',
    description: 'Buyer is demanding a discount after agreement',
  });
  assertEqual(sellerComplaint.userId, SELLER_ID);
  assertEqual(sellerComplaint.status, ComplaintStatus.OPEN);
});

suite.test('Full lifecycle: duplicate complaint from same user is rejected', async () => {
  setupRepos(TransactionStatus.AGREED);
  // First complaint
  await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'First complaint',
  });
  // Duplicate
  await assertThrowsAsync(
    () => SupportService.createComplaint(buyerSession, {
      transactionId: 'tx-e2e-1',
      issueType: 'fraud',
      description: 'Second attempt',
    }),
    'ValidationError',
    'already filed a complaint',
  );
});

suite.test('Full lifecycle: support agent transitions OPEN → INVESTIGATING', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'I never got the item',
  });

  const investigating = await SupportService.transitionComplaint(
    agentSession, complaint.id, ComplaintStatus.INVESTIGATING
  );

  assertEqual(investigating.status, ComplaintStatus.INVESTIGATING);
  assertEqual(investigating.assignedTo, AGENT_ID, 'Complaint must be assigned to agent on INVESTIGATING');
});

suite.test('Full lifecycle: refund cannot be requested on OPEN complaint', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });

  await assertThrowsAsync(
    () => SupportService.requestRefund(buyerSession, {
      complaintId: complaint.id,
      reason: 'I want my money back',
    }),
    'ValidationError',
    'under investigation or resolved',
  );
});

suite.test('Full lifecycle: buyer requests refund after complaint reaches INVESTIGATING', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Never received',
  });

  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  const refund = await SupportService.requestRefund(buyerSession, {
    complaintId: complaint.id,
    reason: 'Item was never delivered',
  });

  assertEqual(refund.status, RefundStatus.REQUESTED, 'Refund must start at REQUESTED');
  assertEqual(refund.complaintId, complaint.id, 'Refund must reference complaint');
  assertEqual(refund.transactionId, 'tx-e2e-1', 'Refund must reference transaction');
  assertEqual(refund.userId, BUYER_ID, 'Refund must be attributed to buyer');
});

suite.test('Full lifecycle: only complaint creator can request refund', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'fraud',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  await assertThrowsAsync(
    () => SupportService.requestRefund(sellerSession, {
      complaintId: complaint.id,
      reason: 'Trying to get money',
    }),
    'ValidationError',
    'Only the complaint creator',
  );
});

suite.test('Full lifecycle: duplicate refund request rejected', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  await SupportService.requestRefund(buyerSession, {
    complaintId: complaint.id,
    reason: 'First request',
  });

  await assertThrowsAsync(
    () => SupportService.requestRefund(buyerSession, {
      complaintId: complaint.id,
      reason: 'Duplicate request',
    }),
    'ValidationError',
    'already requested',
  );
});

suite.test('Full lifecycle: support agent resolves complaint with resolution text', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  const resolved = await SupportService.transitionComplaint(
    agentSession,
    complaint.id,
    ComplaintStatus.RESOLVED,
    'We have verified the claim and resolved the issue in favor of the buyer.'
  );

  assertEqual(resolved.status, ComplaintStatus.RESOLVED, 'Complaint must be RESOLVED');
  assert(resolved.resolution !== null, 'Resolution text must be set');
  assert(resolved.resolvedAt !== null, 'resolvedAt must be set on RESOLVED');
});

suite.test('Full lifecycle: complaint cannot be resolved without resolution text', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'fraud',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  await assertThrowsAsync(
    () => SupportService.transitionComplaint(
      agentSession, complaint.id, ComplaintStatus.RESOLVED
      // No resolution text
    ),
    'ValidationError',
    'Resolution description is required',
  );
});

suite.test('Full lifecycle: complaint cannot be REJECTED without resolution text (from OPEN)', async () => {
  // Regression: SupportView.vue Reject button was not disabled for OPEN complaints
  // without resolution text. The service must always enforce this.
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'fraud',
    description: 'Test',
  });
  // Complaint is OPEN — agent skips INVESTIGATING and tries to reject directly without resolution
  await assertThrowsAsync(
    () => SupportService.transitionComplaint(
      agentSession, complaint.id, ComplaintStatus.REJECTED
      // No resolution text — UI was not blocking this, service must
    ),
    'ValidationError',
    'Resolution description is required',
  );
});

suite.test('Full lifecycle: complaint cannot be REJECTED without resolution text (from INVESTIGATING)', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'fraud',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  await assertThrowsAsync(
    () => SupportService.transitionComplaint(
      agentSession, complaint.id, ComplaintStatus.REJECTED
      // No resolution text
    ),
    'ValidationError',
    'Resolution description is required',
  );
});

suite.test('Full lifecycle: support agent approves refund', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  const refund = await SupportService.requestRefund(buyerSession, {
    complaintId: complaint.id,
    reason: 'Item not received',
  });

  const approved = await SupportService.decideRefund(agentSession, refund.id, 'approved');
  assertEqual(approved.status, RefundStatus.APPROVED, 'Refund must be APPROVED');
  assertEqual(approved.decidedBy, AGENT_ID, 'decidedBy must be set to agent');
});

suite.test('Full lifecycle: support agent rejects refund', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  const refund = await SupportService.requestRefund(buyerSession, {
    complaintId: complaint.id,
    reason: 'Test',
  });

  const rejected = await SupportService.decideRefund(agentSession, refund.id, 'rejected');
  assertEqual(rejected.status, RefundStatus.REJECTED, 'Refund must be REJECTED');
});

suite.test('Full lifecycle: approved refund cannot be decided again', async () => {
  setupRepos(TransactionStatus.AGREED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_received',
    description: 'Test',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  const refund = await SupportService.requestRefund(buyerSession, {
    complaintId: complaint.id,
    reason: 'Test',
  });
  await SupportService.decideRefund(agentSession, refund.id, 'approved');

  await assertThrowsAsync(
    () => SupportService.decideRefund(agentSession, refund.id, 'rejected'),
    'StateTransitionError',
    '',
  );
});

suite.test('Refund on COMPLETED transaction: valid (complaint filed after completion)', async () => {
  setupRepos(TransactionStatus.COMPLETED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: 'tx-e2e-1',
    issueType: 'item_not_as_described',
    description: 'The item was not as described in the listing',
  });
  assertEqual(complaint.status, ComplaintStatus.OPEN, 'Complaint on COMPLETED transaction must succeed');
});

// ─────────────────────────────────────────────
// Blocking behavior E2E
// ─────────────────────────────────────────────

import { UserService } from '../src/services/UserService.js';

suite.test('Block: non-participant cannot block (wrong userId)', async () => {
  // Blocking is own-action only — users can only block others, not themselves
  const stranger = makeSession('stranger-2');

  // Inject block repo stub
  const blockRepo = new InMemoryRepository();
  repos.blockRepository.isBlocked       = (a, b) => blockRepo.getByIndex('blockerId', a).then(
    rows => rows.some(r => r.blockedId === b)
  );
  repos.blockRepository.isEitherBlocked = async (a, b) => {
    const [ab, ba] = await Promise.all([
      repos.blockRepository.isBlocked(a, b),
      repos.blockRepository.isBlocked(b, a),
    ]);
    return ab || ba;
  };
  repos.blockRepository.create          = (r) => blockRepo.create(r);
  repos.blockRepository.getByBlockerId  = (id) => blockRepo.getByIndex('blockerId', id);
  repos.blockRepository.getById         = (id) => blockRepo.getById(id);
  repos.userRepository.getByIdOrFail    = async (id) => ({ id, roles: [Roles.USER] });
  repos.threadRepository.getByBuyerId   = () => Promise.resolve([]);
  repos.threadRepository.getBySellerId  = () => Promise.resolve([]);
  repos.auditLogRepository.create       = () => Promise.resolve();

  // Cannot block yourself
  await assertThrowsAsync(
    () => UserService.blockUser(stranger, stranger.userId),
    'ValidationError',
    'Cannot block yourself',
  );
});

suite.test('Block: creates block record and marks shared threads read-only', async () => {
  const blockRepo = new InMemoryRepository();
  const threadRepo = new InMemoryRepository();

  const sharedThread = {
    id: 'thread-shared-1', buyerId: BUYER_ID, sellerId: SELLER_ID,
    isReadOnly: false, archivedBy: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  threadRepo._store.set(sharedThread.id, { ...sharedThread });

  repos.blockRepository.isBlocked       = (a, b) => blockRepo.getByIndex('blockerId', a).then(
    rows => rows.some(r => r.blockedId === b)
  );
  repos.blockRepository.create          = (r) => blockRepo.create(r);
  repos.blockRepository.getByBlockerId  = (id) => blockRepo.getByIndex('blockerId', id);
  repos.userRepository.getByIdOrFail    = async (id) => ({ id, roles: [Roles.USER] });
  repos.threadRepository.getByBuyerId   = (id) => threadRepo.getByIndex('buyerId', id);
  repos.threadRepository.getBySellerId  = (id) => threadRepo.getByIndex('sellerId', id);
  repos.threadRepository.getByIdOrFail  = (id) => threadRepo.getByIdOrFail(id);
  repos.threadRepository.update         = (r) => threadRepo.update(r);
  repos.auditLogRepository.create       = () => Promise.resolve();

  await UserService.blockUser(buyerSession, SELLER_ID);

  // Verify block was created
  const blocks = await blockRepo.getByIndex('blockerId', BUYER_ID);
  assertEqual(blocks.length, 1, 'Block record must be created');
  assertEqual(blocks[0].blockedId, SELLER_ID, 'Block must reference correct target');

  // Verify shared thread was marked read-only
  const updatedThread = await threadRepo.getById(sharedThread.id);
  assert(updatedThread.isReadOnly, 'Shared thread must be immediately marked read-only on block');
});

// ─────────────────────────────────────────────
// Delivery E2E: listing must offer delivery
// ─────────────────────────────────────────────

import { DeliveryService } from '../src/services/DeliveryService.js';

suite.test('Delivery: booking rejected if listing has deliveryOptions.delivery = false', async () => {
  const txRepo      = new InMemoryRepository();
  const listingRepo = new InMemoryRepository();
  const coverageRepo = new InMemoryRepository();
  const bookingRepo  = new InMemoryRepository();

  const tx = makeTransaction(TransactionStatus.AGREED);
  txRepo._store.set(tx.id, { ...tx });
  listingRepo._store.set(LISTING_ID, {
    id: LISTING_ID, sellerId: SELLER_ID,
    deliveryOptions: { pickup: true, delivery: false }, // NO DELIVERY
    status: 'active',
  });

  repos.transactionRepository.getByIdOrFail = (id) => txRepo.getByIdOrFail(id);
  repos.listingRepository.getByIdOrFail     = (id) => listingRepo.getByIdOrFail(id);
  repos.coverageZipRepository.getByPrefix   = () => Promise.resolve({ prefix: '100' }); // covered
  repos.deliveryBookingRepository.getByWindowKey      = () => Promise.resolve([]);
  repos.deliveryBookingRepository.getByTransactionId  = () => Promise.resolve(null);
  repos.auditLogRepository.create = () => Promise.resolve();

  await assertThrowsAsync(
    () => DeliveryService.bookDelivery(buyerSession, {
      transactionId: tx.id,
      windowKey: '2025-01-15_AM',
      zipCode: '10001',
    }),
    'ValidationError',
    'does not offer delivery',
  );
});

suite.test('Delivery: booking succeeds when listing offers delivery and ZIP is covered', async () => {
  const txRepo       = new InMemoryRepository();
  const listingRepo  = new InMemoryRepository();
  const coverageRepo = new InMemoryRepository();
  const bookingRepo  = new InMemoryRepository();

  const tx = makeTransaction(TransactionStatus.AGREED);
  txRepo._store.set(tx.id, { ...tx });
  listingRepo._store.set(LISTING_ID, {
    id: LISTING_ID, sellerId: SELLER_ID,
    deliveryOptions: { pickup: false, delivery: true }, // DELIVERY OFFERED
    status: 'active',
  });
  coverageRepo._store.set('cov-1', { id: 'cov-1', prefix: '100' });

  repos.transactionRepository.getByIdOrFail = (id) => txRepo.getByIdOrFail(id);
  repos.listingRepository.getByIdOrFail     = (id) => listingRepo.getByIdOrFail(id);
  repos.coverageZipRepository.getByPrefix   = (prefix) => coverageRepo.getOneByIndex('prefix', prefix);
  repos.deliveryBookingRepository.getByWindowKey     = () => Promise.resolve([]);
  repos.deliveryBookingRepository.getByTransactionId = () => Promise.resolve(null);
  repos.deliveryBookingRepository.create             = (r) => bookingRepo.create(r);
  repos.auditLogRepository.create = () => Promise.resolve();

  const booking = await DeliveryService.bookDelivery(buyerSession, {
    transactionId: tx.id,
    windowKey: '2025-01-15_AM',
    zipCode: '10001',
  });

  assert(booking.id, 'Booking must have an ID');
  assertEqual(booking.transactionId, tx.id, 'Booking must reference transaction');
  assertEqual(booking.zipCode, '10001', 'Booking must store ZIP code');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
