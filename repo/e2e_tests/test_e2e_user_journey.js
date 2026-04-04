/**
 * E2E: Full User Journey
 *
 * Covers the complete marketplace flow from first transaction to complaint
 * resolution, plus profile management.
 *
 *   1. Pre-seed users, listing, thread directly into repos
 *   2. Buyer creates transaction (INQUIRY)
 *   3. Seller transitions → RESERVED
 *   4. Buyer transitions → AGREED
 *   5. Buyer transitions → COMPLETED
 *   6. Buyer files complaint on completed transaction
 *   7. Support agent takes ownership (→ INVESTIGATING)
 *   8. Support agent resolves complaint with resolution text
 *   9. Profile update: buyer updates displayName + avatar
 *  10. Profile read-back confirms avatar persisted
 *
 * All service logic is REAL. Only the persistence layer uses InMemoryRepository.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../unit_tests/setup.js';
import { TransactionService } from '../src/services/TransactionService.js';
import { SupportService } from '../src/services/SupportService.js';
import { UserService } from '../src/services/UserService.js';
import {
  TransactionStatus, ComplaintStatus, ListingStatus,
} from '../src/domain/enums/statuses.js';
import { Roles } from '../src/domain/enums/roles.js';
import * as repos from '../src/repositories/index.js';

const suite = new TestRunner('E2E: Full User Journey (transaction → complaint → profile)');

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const BUYER_ID   = 'uj-buyer-1';
const SELLER_ID  = 'uj-seller-1';
const AGENT_ID   = 'uj-agent-1';
const LISTING_ID = 'uj-listing-1';
const THREAD_ID  = 'uj-thread-1';

function makeSession(userId, roles = [Roles.USER]) {
  return { userId, roles, lastActivityAt: Date.now(), createdAt: Date.now() };
}

const buyerSession  = makeSession(BUYER_ID);
const sellerSession = makeSession(SELLER_ID);
const agentSession  = makeSession(AGENT_ID, [Roles.SUPPORT_AGENT]);

function seedThread() {
  return {
    id: THREAD_ID,
    listingId: LISTING_ID,
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    isReadOnly: false,
    archivedBy: [],
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 3600000,
  };
}

function seedListing() {
  return {
    id: LISTING_ID,
    sellerId: SELLER_ID,
    title: 'Test Listing',
    description: '<p>A well-described item</p>',
    price: 50,
    status: ListingStatus.ACTIVE,
    categoryId: 'cat-1',
    tagIds: [],
    media: [],
    deliveryOptions: { pickup: true, delivery: false },
    isPinned: false,
    isFeatured: false,
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  };
}

function seedUser(id, displayName = 'Test User') {
  return {
    id,
    username: `user-${id}`,
    displayName,
    avatar: null,
    bio: '',
    roles: [Roles.USER],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  };
}

// ─────────────────────────────────────────────
// Repository wiring
// ─────────────────────────────────────────────

function setupRepos() {
  // Transaction repo
  const txRepo = new InMemoryRepository();
  repos.transactionRepository.getByIdOrFail  = (id) => txRepo.getByIdOrFail(id);
  repos.transactionRepository.getByThreadId  = async (tid) => {
    const all = await txRepo.getAll();
    return all.find(t => t.threadId === tid) || null;
  };
  repos.transactionRepository.getByListingId = (lid) => txRepo.getByIndex('listingId', lid);
  repos.transactionRepository.getByBuyerId   = (uid) => txRepo.getByIndex('buyerId', uid);
  repos.transactionRepository.getBySellerId  = (uid) => txRepo.getByIndex('sellerId', uid);
  repos.transactionRepository.getByStatus    = (s) => txRepo.getByIndex('status', s);
  repos.transactionRepository.create         = (r) => txRepo.create(r);
  repos.transactionRepository.update         = (r) => txRepo.update(r);

  // Thread repo
  const threadRepo = new InMemoryRepository();
  threadRepo._store.set(THREAD_ID, seedThread());
  repos.threadRepository.getByIdOrFail = (id) => threadRepo.getByIdOrFail(id);
  repos.threadRepository.getByIndex    = (i, v) => threadRepo.getByIndex(i, v);
  repos.threadRepository.update        = (r) => threadRepo.update(r);

  // Listing repo
  const listingRepo = new InMemoryRepository();
  listingRepo._store.set(LISTING_ID, seedListing());
  repos.listingRepository.getByIdOrFail = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update        = (r) => listingRepo.update(r);

  // Complaint repo
  const complaintRepo = new InMemoryRepository();
  repos.complaintRepository.getByIdOrFail = (id) => complaintRepo.getByIdOrFail(id);
  repos.complaintRepository.getByIndex    = (i, v) => complaintRepo.getByIndex(i, v);
  repos.complaintRepository.getByUserId   = (uid) => complaintRepo.getByIndex('userId', uid);
  repos.complaintRepository.getByStatus   = (s) => complaintRepo.getByIndex('status', s);
  repos.complaintRepository.create        = (r) => complaintRepo.create(r);
  repos.complaintRepository.update        = (r) => complaintRepo.update(r);
  repos.complaintRepository.getAll        = () => complaintRepo.getAll();

  // Refund repo (unused in this journey but SupportService imports it)
  const refundRepo = new InMemoryRepository();
  repos.refundRepository.getByIdOrFail    = (id) => refundRepo.getByIdOrFail(id);
  repos.refundRepository.getByComplaintId = async (cid) => {
    const all = await refundRepo.getAll();
    return all.find(r => r.complaintId === cid) || null;
  };
  repos.refundRepository.create           = (r) => refundRepo.create(r);
  repos.refundRepository.update           = (r) => refundRepo.update(r);
  repos.refundRepository.getAll           = () => refundRepo.getAll();

  // User repo
  const userRepo = new InMemoryRepository();
  userRepo._store.set(BUYER_ID,  seedUser(BUYER_ID,  'Alice Buyer'));
  userRepo._store.set(SELLER_ID, seedUser(SELLER_ID, 'Bob Seller'));
  userRepo._store.set(AGENT_ID,  seedUser(AGENT_ID,  'Support Agent'));
  repos.userRepository.getByIdOrFail  = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getById        = (id) => userRepo.getById(id);
  repos.userRepository.getByUsername  = (un) => userRepo.getOneByIndex('username', un);
  repos.userRepository.update         = (r) => userRepo.update(r);
  repos.userRepository.getAll         = () => userRepo.getAll();

  // Silent audit + notification stubs
  repos.auditLogRepository.create          = () => Promise.resolve();
  repos.notificationRepository.create      = () => Promise.resolve();
  repos.notificationRepository.getByUserId = () => Promise.resolve([]);
  repos.notificationRepository.findUnread  = () => Promise.resolve(null);
  repos.notificationRepository.getUnreadByUserId = () => Promise.resolve([]);

  return { txRepo, threadRepo, listingRepo, complaintRepo, userRepo };
}

// ─────────────────────────────────────────────
// The journey
// ─────────────────────────────────────────────

suite.test('step 1: buyer creates transaction (INQUIRY)', async () => {
  const { txRepo } = setupRepos();

  const tx = await TransactionService.create(buyerSession, THREAD_ID);

  assertEqual(tx.status, TransactionStatus.INQUIRY, 'Transaction must start at INQUIRY');
  assertEqual(tx.buyerId,  BUYER_ID,  'buyerId must match session');
  assertEqual(tx.sellerId, SELLER_ID, 'sellerId pulled from thread');
  assertEqual(tx.threadId, THREAD_ID, 'threadId preserved');

  // Persisted
  const persisted = await txRepo.getByIdOrFail(tx.id);
  assertEqual(persisted.status, TransactionStatus.INQUIRY, 'Transaction must be persisted');
});

suite.test('step 2: seller transitions INQUIRY → RESERVED', async () => {
  const { txRepo } = setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);

  const updated = await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);

  assertEqual(updated.status, TransactionStatus.RESERVED, 'Status must be RESERVED');
  assert(updated.reservedAt, 'reservedAt timestamp must be set');
});

suite.test('step 3: buyer transitions RESERVED → AGREED', async () => {
  const { txRepo } = setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);

  const updated = await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);

  assertEqual(updated.status, TransactionStatus.AGREED, 'Status must be AGREED');
});

suite.test('step 4: buyer transitions AGREED → COMPLETED', async () => {
  const { txRepo } = setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);

  const updated = await TransactionService.transition(buyerSession, tx.id, TransactionStatus.COMPLETED);

  assertEqual(updated.status, TransactionStatus.COMPLETED, 'Status must be COMPLETED');
  assert(updated.completedAt, 'completedAt timestamp must be set');
});

suite.test('step 5: seller cannot complete (buyer-only action)', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);

  await assertThrowsAsync(
    () => TransactionService.transition(sellerSession, tx.id, TransactionStatus.COMPLETED),
    'ValidationError',
    'Only the buyer',
  );
});

suite.test('step 6: buyer files complaint on COMPLETED transaction', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.COMPLETED);

  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'item_not_as_described',
    description: 'Item was not as described in the listing',
  });

  assertEqual(complaint.status, ComplaintStatus.OPEN, 'Complaint must start at OPEN');
  assertEqual(complaint.userId, BUYER_ID, 'Complaint must be owned by buyer');
  assertEqual(complaint.transactionId, tx.id, 'Complaint linked to transaction');
});

suite.test('step 7: support agent takes ownership (OPEN → INVESTIGATING)', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.COMPLETED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'item_not_as_described',
    description: 'Item was not as described',
  });

  const updated = await SupportService.transitionComplaint(
    agentSession,
    complaint.id,
    ComplaintStatus.INVESTIGATING,
  );

  assertEqual(updated.status, ComplaintStatus.INVESTIGATING, 'Must be INVESTIGATING');
  assertEqual(updated.assignedTo, AGENT_ID, 'assignedTo must be set to agent');
});

suite.test('step 8: support agent resolves complaint with resolution text', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, tx.id, TransactionStatus.COMPLETED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'item_not_as_described',
    description: 'Item was not as described',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);

  const resolved = await SupportService.transitionComplaint(
    agentSession,
    complaint.id,
    ComplaintStatus.RESOLVED,
    'Reviewed evidence — partial refund issued.',
  );

  assertEqual(resolved.status, ComplaintStatus.RESOLVED, 'Complaint must be RESOLVED');
  assert(resolved.resolution, 'Resolution text must be set');
});

suite.test('step 9: buyer updates displayName and avatar on profile', async () => {
  setupRepos();

  const AVATAR_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const updated = await UserService.updateProfile(buyerSession, {
    displayName: 'Alice B.',
    bio: 'Avid buyer.',
    avatar: AVATAR_DATA,
  });

  assertEqual(updated.displayName, 'Alice B.', 'displayName must be updated');
  assertEqual(updated.avatar, AVATAR_DATA, 'avatar must be persisted');
});

suite.test('step 10: getProfile returns updated avatar and displayName', async () => {
  setupRepos();

  const AVATAR_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await UserService.updateProfile(buyerSession, {
    displayName: 'Alice B.',
    avatar: AVATAR_DATA,
  });

  // Another user looks up buyer profile
  const profile = await UserService.getProfile(sellerSession, BUYER_ID);

  assertEqual(profile.displayName, 'Alice B.', 'displayName visible to others');
  assertEqual(profile.avatar, AVATAR_DATA, 'avatar visible to others');
  assert(!('passwordHash' in profile), 'passwordHash must never be exposed');
  assert(!('securityQuestions' in profile), 'securityQuestions must never be exposed');
});

suite.test('buyer cannot file complaint on a RESERVED transaction', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);

  await assertThrowsAsync(
    () => SupportService.createComplaint(buyerSession, {
      transactionId: tx.id,
      issueType: 'fraud',
      description: 'Something is wrong',
    }),
    'ValidationError',
    'agreed or completed',
  );
});

suite.test('buyer cannot skip transaction steps (INQUIRY → COMPLETED)', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);

  await assertThrowsAsync(
    () => TransactionService.transition(buyerSession, tx.id, TransactionStatus.COMPLETED),
    'StateTransitionError',
  );
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
