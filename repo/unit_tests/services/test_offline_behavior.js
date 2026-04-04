/**
 * Offline Behavior Tests
 *
 * TradeLoop is a fully offline browser app — it must work without any network.
 * These tests verify:
 *   - No service makes fetch() or XMLHttpRequest calls
 *   - All business operations complete with only in-memory/IndexedDB data
 *   - External dependency failures are never introduced
 *   - The app is truly self-contained
 *
 * Strategy: stub fetch and XMLHttpRequest to throw, then run every service
 * operation. If any operation triggers a network call, the test will fail.
 */

import {
  TestRunner, assert, assertEqual, InMemoryRepository,
} from '../setup.js';
import { TransactionService } from '../../src/services/TransactionService.js';
import { ListingService }     from '../../src/services/ListingService.js';
import { ThreadService }      from '../../src/services/ThreadService.js';
import { UserService }        from '../../src/services/UserService.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { ModerationService }  from '../../src/services/ModerationService.js';
import { SupportService }     from '../../src/services/SupportService.js';
import { TransactionStatus, ListingStatus, ComplaintStatus, ModerationStatus } from '../../src/domain/enums/statuses.js';
import { Roles }              from '../../src/domain/enums/roles.js';
import * as repos             from '../../src/repositories/index.js';

const suite = new TestRunner('Offline Behavior: No Network Calls');

// ── Network stub — any fetch/XHR call is a test failure ──────────────────────
let networkCallDetected = false;
let networkCallDetails  = '';

globalThis.fetch = (...args) => {
  networkCallDetected = true;
  networkCallDetails = `fetch(${JSON.stringify(args[0])})`;
  return Promise.reject(new Error(`OFFLINE_VIOLATION: fetch called — ${networkCallDetails}`));
};

class ForbiddenXHR {
  open(method, url) {
    networkCallDetected = true;
    networkCallDetails = `XMLHttpRequest.open(${method}, ${url})`;
    throw new Error(`OFFLINE_VIOLATION: XHR called — ${networkCallDetails}`);
  }
  send() { throw new Error('OFFLINE_VIOLATION: XHR.send called'); }
  setRequestHeader() {}
}
globalThis.XMLHttpRequest = ForbiddenXHR;

// ── localStorage stub ─────────────────────────────────────────────────────────
const _ls = new Map();
globalThis.localStorage = {
  getItem:    (k) => _ls.get(k) ?? null,
  setItem:    (k, v) => _ls.set(k, v),
  removeItem: (k) => _ls.delete(k),
  clear:      () => _ls.clear(),
  get length()  { return _ls.size; },
  key:        (i) => [..._ls.keys()][i] ?? null,
};

// ── Repo wiring ───────────────────────────────────────────────────────────────
const USER_ID    = 'offline-user-1';
const SELLER_ID  = 'offline-seller-1';
const LISTING_ID = 'offline-listing-1';
const THREAD_ID  = 'offline-thread-1';
const AGENT_ID   = 'offline-agent-1';

function makeSession(userId, roles = [Roles.USER]) {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

function setupRepos() {
  networkCallDetected = false;
  networkCallDetails  = '';

  const txRepo        = new InMemoryRepository();
  const listingRepo   = new InMemoryRepository();
  const threadRepo    = new InMemoryRepository();
  const userRepo      = new InMemoryRepository();
  const notifRepo     = new InMemoryRepository();
  const complaintRepo = new InMemoryRepository();
  const refundRepo    = new InMemoryRepository();
  const modCaseRepo   = new InMemoryRepository();
  const reportRepo    = new InMemoryRepository();

  // Seed baseline data
  listingRepo._store.set(LISTING_ID, {
    id: LISTING_ID, sellerId: SELLER_ID, title: 'Offline Listing',
    description: '<p>Test</p>', price: 10, status: ListingStatus.ACTIVE,
    categoryId: 'cat-1', tagIds: [], media: [], deliveryOptions: { pickup: true, delivery: false },
    isPinned: false, isFeatured: false, createdAt: Date.now(), updatedAt: Date.now(),
  });
  threadRepo._store.set(THREAD_ID, {
    id: THREAD_ID, listingId: LISTING_ID, buyerId: USER_ID, sellerId: SELLER_ID,
    isReadOnly: false, archivedBy: [], createdAt: Date.now(), updatedAt: Date.now(),
  });
  userRepo._store.set(USER_ID, {
    id: USER_ID, username: 'offline-user', displayName: 'Offline User',
    avatar: null, bio: '', roles: [Roles.USER],
    notificationPreferences: { messages: true, transactions: true, moderation: true, complaints: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  userRepo._store.set(SELLER_ID, {
    id: SELLER_ID, username: 'offline-seller', displayName: 'Offline Seller',
    avatar: null, bio: '', roles: [Roles.USER],
    notificationPreferences: { messages: true, transactions: true, moderation: true, complaints: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  userRepo._store.set(AGENT_ID, {
    id: AGENT_ID, username: 'offline-agent', displayName: 'Support Agent',
    avatar: null, bio: '', roles: [Roles.SUPPORT_AGENT],
    notificationPreferences: { messages: true, transactions: true, moderation: true, complaints: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  // Wire repos
  repos.transactionRepository.create         = (r) => txRepo.create(r);
  repos.transactionRepository.update         = (r) => txRepo.update(r);
  repos.transactionRepository.getByIdOrFail  = (id) => txRepo.getByIdOrFail(id);
  repos.transactionRepository.getByThreadId  = async (tid) => { const all = await txRepo.getAll(); return all.find(t => t.threadId === tid) || null; };
  repos.transactionRepository.getByListingId = (lid) => txRepo.getByIndex('listingId', lid);
  repos.transactionRepository.getByBuyerId   = (uid) => txRepo.getByIndex('buyerId', uid);
  repos.transactionRepository.getBySellerId  = (uid) => txRepo.getByIndex('sellerId', uid);
  repos.transactionRepository.getByStatus    = (s) => txRepo.getByIndex('status', s);

  repos.listingRepository.getById       = (id) => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update        = (r)  => listingRepo.update(r);
  repos.listingRepository.getAll        = ()   => listingRepo.getAll();
  repos.listingRepository.getByIndex    = (i, v) => listingRepo.getByIndex(i, v);
  repos.listingRepository.countByIndex  = (i, v) => listingRepo.countByIndex(i, v);

  repos.threadRepository.getByIdOrFail = (id) => threadRepo.getByIdOrFail(id);
  repos.threadRepository.update        = (r)  => threadRepo.update(r);

  repos.userRepository.getById        = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail  = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getAll         = ()   => userRepo.getAll();
  repos.userRepository.update         = (r)  => userRepo.update(r);

  repos.notificationRepository.create             = (r) => notifRepo.create(r);
  repos.notificationRepository.getByUserId        = (uid) => notifRepo.getByIndex('userId', uid);
  repos.notificationRepository.getUnreadByUserId  = async (uid) => { const all = await notifRepo.getByIndex('userId', uid); return all.filter(n => !n.isRead); };
  repos.notificationRepository.findUnread         = async (uid, type, refId) => { const all = await notifRepo.getByIndex('userId', uid); return all.find(n => !n.isRead && n.type === type && n.referenceId === refId) || null; };
  repos.notificationRepository.countUnreadByUserId = async (uid) => { const all = await notifRepo.getByIndex('userId', uid); return all.filter(n => !n.isRead).length; };

  repos.complaintRepository.getByIdOrFail = (id) => complaintRepo.getByIdOrFail(id);
  repos.complaintRepository.getByIndex    = (i, v) => complaintRepo.getByIndex(i, v);
  repos.complaintRepository.getByUserId   = (uid) => complaintRepo.getByIndex('userId', uid);
  repos.complaintRepository.getByStatus   = (s) => complaintRepo.getByIndex('status', s);
  repos.complaintRepository.create        = (r) => complaintRepo.create(r);
  repos.complaintRepository.update        = (r) => complaintRepo.update(r);
  repos.complaintRepository.getAll        = () => complaintRepo.getAll();

  repos.refundRepository.getByIdOrFail    = (id) => refundRepo.getByIdOrFail(id);
  repos.refundRepository.getByComplaintId = async (cid) => { const all = await refundRepo.getAll(); return all.find(r => r.complaintId === cid) || null; };
  repos.refundRepository.create           = (r) => refundRepo.create(r);
  repos.refundRepository.update           = (r) => refundRepo.update(r);
  repos.refundRepository.getAll           = () => refundRepo.getAll();

  repos.moderationCaseRepository.create        = (r) => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById       = (id) => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = (id) => modCaseRepo.getByIdOrFail(id);
  repos.moderationCaseRepository.update        = (r) => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus   = (s) => modCaseRepo.getByIndex('status', s);

  repos.reportRepository.create        = (r) => reportRepo.create(r);
  repos.reportRepository.getById       = (id) => reportRepo.getById(id);
  repos.reportRepository.getByIdOrFail = (id) => reportRepo.getByIdOrFail(id);
  repos.reportRepository.update        = (r) => reportRepo.update(r);
  repos.reportRepository.getAll        = () => reportRepo.getAll();

  repos.auditLogRepository.create   = () => Promise.resolve();
  repos.sensitiveWordRepository.getAll = () => Promise.resolve([]);

  return { txRepo, listingRepo, complaintRepo, modCaseRepo, reportRepo, notifRepo };
}

function assertNoNetworkCalls() {
  assert(!networkCallDetected,
    `Network call was made during service operation: ${networkCallDetails}`);
}

// ── Helper to build a complete transaction chain ──────────────────────────────
const buyerSession  = makeSession(USER_ID);
const sellerSession = makeSession(SELLER_ID);
const agentSession  = makeSession(AGENT_ID, [Roles.SUPPORT_AGENT]);
const modSession    = makeSession('mod-1', [Roles.MODERATOR]);

// ════════════════════════════════════════════════════════════
//  TRANSACTION OPERATIONS — no network
// ════════════════════════════════════════════════════════════

suite.test('TransactionService.create: no network call', async () => {
  setupRepos();
  await TransactionService.create(buyerSession, THREAD_ID);
  assertNoNetworkCalls();
});

suite.test('TransactionService.transition: no network call', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  assertNoNetworkCalls();
});

suite.test('full transaction lifecycle (inquiry→reserved→agreed→completed): no network', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.COMPLETED);
  assertNoNetworkCalls();
});

// ════════════════════════════════════════════════════════════
//  SUPPORT OPERATIONS — no network
// ════════════════════════════════════════════════════════════

suite.test('SupportService.createComplaint: no network call', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.COMPLETED);

  await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'item_not_as_described',
    description: 'Not as described',
  });
  assertNoNetworkCalls();
});

suite.test('SupportService.transitionComplaint: no network call', async () => {
  setupRepos();
  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.COMPLETED);
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'fraud',
    description: 'Fraud occurred',
  });
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  assertNoNetworkCalls();
});

// ════════════════════════════════════════════════════════════
//  NOTIFICATION OPERATIONS — no network
// ════════════════════════════════════════════════════════════

suite.test('NotificationService.create: no network call', async () => {
  setupRepos();
  await NotificationService.create(USER_ID, 'transaction', 'ref-1', 'Test notification');
  assertNoNetworkCalls();
});

// ════════════════════════════════════════════════════════════
//  USER PROFILE — no network
// ════════════════════════════════════════════════════════════

suite.test('UserService.getProfile: no network call', async () => {
  setupRepos();
  await UserService.getProfile(buyerSession, SELLER_ID);
  assertNoNetworkCalls();
});

suite.test('UserService.updateProfile: no network call', async () => {
  setupRepos();
  await UserService.updateProfile(buyerSession, { displayName: 'New Name', bio: 'New bio' });
  assertNoNetworkCalls();
});

// ════════════════════════════════════════════════════════════
//  MODERATION — no network
// ════════════════════════════════════════════════════════════

suite.test('ModerationService.createCase: no network call', async () => {
  setupRepos();
  await ModerationService.createCase(null, {
    contentId: LISTING_ID,
    contentType: 'listing',
    reason: 'spam',
    reportId: null,
  });
  assertNoNetworkCalls();
});

suite.test('ModerationService.decide: no network call', async () => {
  const { modCaseRepo } = setupRepos();
  await modCaseRepo.create({
    id: 'test-case', contentId: LISTING_ID, contentType: 'listing',
    reason: 'spam', flaggedWords: [], reportId: null,
    status: ModerationStatus.IN_REVIEW, reviewerId: 'mod-1',
    decision: null, violationTags: [], penalty: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  await ModerationService.decide(modSession, 'test-case', {
    decision: 'approved', violationTags: [],
  });
  assertNoNetworkCalls();
});

// ════════════════════════════════════════════════════════════
//  COMBINED FLOW — no network at any step
// ════════════════════════════════════════════════════════════

suite.test('complete marketplace flow from inquiry to resolved complaint: no network', async () => {
  setupRepos();

  const tx = await TransactionService.create(buyerSession, THREAD_ID);
  await TransactionService.transition(sellerSession, tx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession,  tx.id, TransactionStatus.COMPLETED);

  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: tx.id,
    issueType: 'item_not_as_described',
    description: 'Item arrived broken',
  });

  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.INVESTIGATING);
  await SupportService.transitionComplaint(agentSession, complaint.id, ComplaintStatus.RESOLVED, 'Refund issued');

  await UserService.updateProfile(buyerSession, { displayName: 'Updated Alice' });
  await NotificationService.create(USER_ID, 'complaint', complaint.id, 'Your complaint was resolved');

  assertNoNetworkCalls();
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
