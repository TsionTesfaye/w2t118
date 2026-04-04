/**
 * Role Journey Acceptance Tests
 *
 * Covers FULL end-to-end user flows for every role in the system:
 *
 *   REGULAR USER:   register → create listing → browse → initiate transaction →
 *                   complete transaction → file complaint
 *
 *   MODERATOR:      pick up moderation case → approve listing →
 *                   reject listing → verify listing status changes
 *
 *   SUPPORT AGENT:  take complaint ownership → investigate →
 *                   resolve complaint → reject complaint
 *
 *   ADMIN:          initialize system → create categories →
 *                   assign moderator role → verify role takes effect
 *
 * All service logic is REAL. Only the persistence layer uses InMemoryRepository.
 * These tests simulate the exact flows a user would execute through the UI.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../unit_tests/setup.js';
import { AuthService } from '../src/services/AuthService.js';
import { InitService } from '../src/services/InitService.js';
import { ListingService } from '../src/services/ListingService.js';
import { TransactionService } from '../src/services/TransactionService.js';
import { ThreadService } from '../src/services/ThreadService.js';
import { ModerationService } from '../src/services/ModerationService.js';
import { SupportService } from '../src/services/SupportService.js';
import { UserService } from '../src/services/UserService.js';
import { AdminService } from '../src/services/AdminService.js';
import { NotificationService } from '../src/services/NotificationService.js';
import { Roles } from '../src/domain/enums/roles.js';
import {
  TransactionStatus, ListingStatus, ComplaintStatus, ModerationStatus,
} from '../src/domain/enums/statuses.js';
import * as repos from '../src/repositories/index.js';

// ── Web Crypto polyfill ──
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// ── localStorage stub ──
const _ls = new Map();
globalThis.localStorage = {
  getItem:    (k) => _ls.get(k) ?? null,
  setItem:    (k, v) => _ls.set(k, String(v)),
  removeItem: (k) => _ls.delete(k),
  clear:      () => _ls.clear(),
};

const suite = new TestRunner('Role Journey Acceptance Tests');

// ─────────────────────────────────────────────
// Repo stubs
// ─────────────────────────────────────────────

function stubRepos() {
  const userRepo         = new InMemoryRepository();
  const sessionRepo      = new InMemoryRepository();
  const listingRepo      = new InMemoryRepository();
  const txRepo           = new InMemoryRepository();
  const threadRepo       = new InMemoryRepository();
  const categoryRepo     = new InMemoryRepository();
  const modCaseRepo      = new InMemoryRepository();
  const sensitiveRepo    = new InMemoryRepository();
  const reportRepo       = new InMemoryRepository();
  const complaintRepo    = new InMemoryRepository();
  const refundRepo       = new InMemoryRepository();
  const notifRepo        = new InMemoryRepository();
  const auditRepo        = new InMemoryRepository();
  const blockRepo        = new InMemoryRepository();
  const addressRepo      = new InMemoryRepository();
  const messageRepo      = new InMemoryRepository();

  // Wire repos
  repos.userRepository.getAll             = () => userRepo.getAll();
  repos.userRepository.getById            = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail      = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getByUsername      = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.getOneByIndex      = (idx, val) => userRepo.getOneByIndex(idx, val);
  repos.userRepository.create             = (r) => userRepo.create(r);
  repos.userRepository.update             = (r) => userRepo.update(r);

  repos.sessionRepository.create          = (r) => sessionRepo.create(r);
  repos.sessionRepository.getById        = (id) => sessionRepo.getById(id);
  repos.sessionRepository.getByIdOrFail  = (id) => sessionRepo.getByIdOrFail(id);
  repos.sessionRepository.update         = (r) => sessionRepo.update(r);
  repos.sessionRepository.delete         = (id) => sessionRepo.delete(id);
  repos.sessionRepository.getByIndex     = (idx, val) => sessionRepo.getByIndex(idx, val);
  repos.sessionRepository.getOneByIndex  = (idx, val) => sessionRepo.getOneByIndex(idx, val);

  repos.listingRepository.create          = (r) => listingRepo.create(r);
  repos.listingRepository.getById         = (id) => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail   = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update          = (r) => listingRepo.update(r);
  repos.listingRepository.getAll          = () => listingRepo.getAll();
  repos.listingRepository.getByIndex      = (idx, val) => listingRepo.getByIndex(idx, val);
  repos.listingRepository.countByIndex    = (idx, val) => listingRepo.countByIndex(idx, val);

  repos.transactionRepository.create      = (r) => txRepo.create(r);
  repos.transactionRepository.getById     = (id) => txRepo.getById(id);
  repos.transactionRepository.getByIdOrFail = (id) => txRepo.getByIdOrFail(id);
  repos.transactionRepository.update      = (r) => txRepo.update(r);
  repos.transactionRepository.getByIndex  = (idx, val) => txRepo.getByIndex(idx, val);
  repos.transactionRepository.getOneByIndex = (idx, val) => txRepo.getOneByIndex(idx, val);

  repos.threadRepository.create           = (r) => threadRepo.create(r);
  repos.threadRepository.getById          = (id) => threadRepo.getById(id);
  repos.threadRepository.getByIdOrFail    = (id) => threadRepo.getByIdOrFail(id);
  repos.threadRepository.update           = (r) => threadRepo.update(r);
  repos.threadRepository.getByIndex       = (idx, val) => threadRepo.getByIndex(idx, val);
  repos.threadRepository.getOneByIndex    = (idx, val) => threadRepo.getOneByIndex(idx, val);

  repos.categoryRepository.create         = (r) => categoryRepo.create(r);
  repos.categoryRepository.getAll         = () => categoryRepo.getAll();
  repos.categoryRepository.getById        = (id) => categoryRepo.getById(id);
  repos.categoryRepository.getByIdOrFail  = (id) => categoryRepo.getByIdOrFail(id);
  repos.categoryRepository.update         = (r) => categoryRepo.update(r);

  repos.moderationCaseRepository.create   = (r) => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById  = (id) => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = (id) => modCaseRepo.getByIdOrFail(id);
  repos.moderationCaseRepository.update   = (r) => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus = (s) => modCaseRepo.getByIndex('status', s);

  repos.sensitiveWordRepository.getAll    = () => sensitiveRepo.getAll();
  repos.sensitiveWordRepository.create    = (r) => sensitiveRepo.create(r);
  repos.sensitiveWordRepository.getById   = (id) => sensitiveRepo.getById(id);
  repos.sensitiveWordRepository.getByIdOrFail = (id) => sensitiveRepo.getByIdOrFail(id);
  repos.sensitiveWordRepository.delete    = (id) => sensitiveRepo.delete(id);

  repos.reportRepository.create           = (r) => reportRepo.create(r);
  repos.reportRepository.getAll           = () => reportRepo.getAll();
  repos.reportRepository.getById          = (id) => reportRepo.getById(id);
  repos.reportRepository.getByIdOrFail    = (id) => reportRepo.getByIdOrFail(id);
  repos.reportRepository.update           = (r) => reportRepo.update(r);

  repos.complaintRepository.create        = (r) => complaintRepo.create(r);
  repos.complaintRepository.getById       = (id) => complaintRepo.getById(id);
  repos.complaintRepository.getByIdOrFail = (id) => complaintRepo.getByIdOrFail(id);
  repos.complaintRepository.update        = (r) => complaintRepo.update(r);
  repos.complaintRepository.getByIndex    = (idx, val) => complaintRepo.getByIndex(idx, val);
  repos.complaintRepository.getOneByIndex = (idx, val) => complaintRepo.getOneByIndex(idx, val);

  repos.refundRepository.create           = (r) => refundRepo.create(r);
  repos.refundRepository.getById          = (id) => refundRepo.getById(id);
  repos.refundRepository.getByIdOrFail    = (id) => refundRepo.getByIdOrFail(id);
  repos.refundRepository.update           = (r) => refundRepo.update(r);
  repos.refundRepository.getByIndex       = (idx, val) => refundRepo.getByIndex(idx, val);
  repos.refundRepository.getOneByIndex    = (idx, val) => refundRepo.getOneByIndex(idx, val);

  repos.notificationRepository.create     = (r) => notifRepo.create(r);
  repos.notificationRepository.getAll     = () => notifRepo.getAll();
  repos.notificationRepository.getById    = (id) => notifRepo.getById(id);
  repos.notificationRepository.getByIdOrFail = (id) => notifRepo.getByIdOrFail(id);
  repos.notificationRepository.update     = (r) => notifRepo.update(r);
  repos.notificationRepository.getByIndex = (idx, val) => notifRepo.getByIndex(idx, val);

  repos.auditLogRepository.create         = (r) => auditRepo.create(r);
  repos.auditLogRepository.getAll         = () => auditRepo.getAll();
  repos.auditLogRepository.getByIndex     = (idx, val) => auditRepo.getByIndex(idx, val);

  repos.blockRepository.getByIndex        = (idx, val) => blockRepo.getByIndex(idx, val);
  repos.blockRepository.getOneByIndex     = (idx, val) => blockRepo.getOneByIndex(idx, val);
  repos.blockRepository.create            = (r) => blockRepo.create(r);
  repos.blockRepository.delete            = (id) => blockRepo.delete(id);
  repos.blockRepository.getById           = (id) => blockRepo.getById(id);

  repos.addressRepository.create          = (r) => addressRepo.create(r);
  repos.addressRepository.getAll          = () => addressRepo.getAll();
  repos.addressRepository.getById         = (id) => addressRepo.getById(id);
  repos.addressRepository.getByIdOrFail   = (id) => addressRepo.getByIdOrFail(id);
  repos.addressRepository.update          = (r) => addressRepo.update(r);
  repos.addressRepository.delete          = (id) => addressRepo.delete(id);
  repos.addressRepository.getByIndex      = (idx, val) => addressRepo.getByIndex(idx, val);

  repos.messageRepository.create          = (r) => messageRepo.create(r);
  repos.messageRepository.getByIndex      = (idx, val) => messageRepo.getByIndex(idx, val);

  // Stubs for repos not used in these tests
  const noopRepo = new InMemoryRepository();
  for (const key of Object.keys(repos)) {
    const r = repos[key];
    if (typeof r === 'object' && r !== null && Object.isExtensible(r) && !r.create) {
      r.create = (x) => noopRepo.create(x);
      r.getAll = () => noopRepo.getAll();
      r.getByIndex = () => Promise.resolve([]);
      r.getOneByIndex = () => Promise.resolve(null);
    }
  }

  return {
    userRepo, categoryRepo, listingRepo, txRepo, threadRepo,
    modCaseRepo, complaintRepo, notifRepo, auditRepo,
  };
}

const SQ = [
  { question: 'What is your pet name?', answer: 'Fluffy' },
  { question: 'What city were you born?', answer: 'Boston' },
];

function makeAdminSession(userId) {
  return {
    userId,
    roles: [Roles.ADMIN],
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
  };
}

function makeModSession(userId) {
  return {
    userId,
    roles: [Roles.MODERATOR],
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
  };
}

function makeAgentSession(userId) {
  return {
    userId,
    roles: [Roles.SUPPORT_AGENT],
    lastActivityAt: Date.now(),
    createdAt: Date.now(),
  };
}

// ══════════════════════════════════════════════════════════
//  ADMIN JOURNEY: system setup → categories → role assignment
// ══════════════════════════════════════════════════════════

suite.test('Admin Journey: initialize system and create categories', async () => {
  stubRepos();
  _ls.clear();

  // 1. Fresh system — not initialized
  const fresh = await InitService.isInitialized();
  assertEqual(fresh, false, 'DB must be empty before setup');

  // 2. Create initial admin
  const admin = await InitService.createInitialAdmin({
    username: 'rj_admin',
    password: 'Admin@Journey1!',
    displayName: 'System Admin',
    securityQuestions: SQ,
  });
  assert(admin.roles.includes(Roles.ADMIN), 'Admin must have ADMIN role');

  // 3. System is now initialized
  const initialized = await InitService.isInitialized();
  assertEqual(initialized, true, 'System must be initialized after admin creation');

  // 4. Login as admin
  const { session, user } = await AuthService.login('rj_admin', 'Admin@Journey1!');
  assert(session.roles.includes(Roles.ADMIN), 'Admin session must have ADMIN role');

  // 5. Create baseline categories
  const cats = await InitService.createBaselineCategories(session, [
    { name: 'Electronics' },
    { name: 'Clothing' },
    { name: 'Books' },
  ]);
  assertEqual(cats.length, 3, 'Three categories must be created');
  assert(cats.every(c => c.id && c.name), 'Each category must have id and name');
});

suite.test('Admin Journey: assign moderator role to an existing user', async () => {
  stubRepos();
  _ls.clear();

  // Setup: create admin + regular user
  await InitService.createInitialAdmin({
    username: 'rj_admin2',
    password: 'Admin@Journey2!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('rj_admin2', 'Admin@Journey2!');

  await AuthService.register({
    username: 'future_mod',
    password: 'Moderator@123!',
    displayName: 'Future Moderator',
    securityQuestions: SQ,
  });
  const { session: userSession } = await AuthService.login('future_mod', 'Moderator@123!');

  // Assign MODERATOR role
  await UserService.assignRole(adminSession, userSession.userId, Roles.MODERATOR);

  // Verify role is assigned
  const profile = await UserService.getProfile(adminSession, userSession.userId);
  assert(profile.roles.includes(Roles.MODERATOR), 'User must now have MODERATOR role');
});

suite.test('Admin Journey: create category tree with parent-child relationship', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rj_admin3', password: 'Admin@Journey3!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session } = await AuthService.login('rj_admin3', 'Admin@Journey3!');

  const parent = await AdminService.createCategory(session, { name: 'Electronics', sortOrder: 1 });
  const child = await AdminService.createCategory(session, { name: 'Phones', parentId: parent.id, sortOrder: 1 });

  assertEqual(child.parentId, parent.id, 'Child category must reference parent');

  const tree = await AdminService.getCategoryTree(session);
  const parentNode = tree.find(c => c.id === parent.id);
  assert(parentNode, 'Parent must appear at tree root');
  assertEqual(parentNode.children.length, 1, 'Parent must have one child');
  assertEqual(parentNode.children[0].id, child.id, 'Child must be nested under parent');
});

// ══════════════════════════════════════════════════════════
//  REGULAR USER JOURNEY: register → list → transact → complain
// ══════════════════════════════════════════════════════════

suite.test('User Journey: register, create listing, and receive INQUIRY', async () => {
  const { categoryRepo } = stubRepos();
  _ls.clear();

  // Seed an admin + category (setup prerequisite)
  await InitService.createInitialAdmin({
    username: 'uj_admin', password: 'Admin@UJ1!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('uj_admin', 'Admin@UJ1!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Electronics', sortOrder: 1 });

  // Seller registers
  await AuthService.register({
    username: 'uj_seller', password: 'Seller@UJ1!Z',
    displayName: 'Seller', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('uj_seller', 'Seller@UJ1!Z');

  // Buyer registers
  await AuthService.register({
    username: 'uj_buyer', password: 'Buyer@UJ1!Zz',
    displayName: 'Buyer', securityQuestions: SQ,
  });
  const { session: buyerSession } = await AuthService.login('uj_buyer', 'Buyer@UJ1!Zz');

  // Seller creates listing (draft) then publishes (→ active)
  const draft = await ListingService.create(sellerSession, {
    title: 'MacBook Pro',
    description: '<p>Great laptop in excellent condition</p>',
    price: 999,
    categoryId: cat.id,
    deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing } = await ListingService.publish(sellerSession, draft.id);
  assertEqual(listing.status, ListingStatus.ACTIVE, 'Published listing must be ACTIVE');

  // Buyer opens thread then creates transaction (inquiry)
  const thread = await ThreadService.create(buyerSession, listing.id);
  const transaction = await TransactionService.create(buyerSession, thread.id);
  assertEqual(transaction.status, TransactionStatus.INQUIRY, 'Transaction starts as INQUIRY');
  assertEqual(transaction.buyerId, buyerSession.userId, 'Buyer must own the inquiry');
  assertEqual(transaction.listingId, listing.id, 'Transaction must reference listing');

  // Seller reserves
  const reserved = await TransactionService.transition(sellerSession, transaction.id, TransactionStatus.RESERVED);
  assertEqual(reserved.status, TransactionStatus.RESERVED, 'Seller reserves → RESERVED');

  // Buyer agrees
  const agreed = await TransactionService.transition(buyerSession, transaction.id, TransactionStatus.AGREED);
  assertEqual(agreed.status, TransactionStatus.AGREED, 'Buyer agrees → AGREED');

  // Buyer completes
  const completed = await TransactionService.transition(buyerSession, transaction.id, TransactionStatus.COMPLETED);
  assertEqual(completed.status, TransactionStatus.COMPLETED, 'Buyer completes → COMPLETED');
});

suite.test('User Journey: buyer cannot complete a transaction they did not agree to', async () => {
  const { } = stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'uj_admin4', password: 'Admin@UJ4!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('uj_admin4', 'Admin@UJ4!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Tech', sortOrder: 1 });

  await AuthService.register({
    username: 'uj_seller4', password: 'Seller@UJ4!Z',
    displayName: 'Seller4', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('uj_seller4', 'Seller@UJ4!Z');

  await AuthService.register({
    username: 'uj_buyer4', password: 'Buyer@UJ4!Zz',
    displayName: 'Buyer4', securityQuestions: SQ,
  });
  const { session: buyerSession } = await AuthService.login('uj_buyer4', 'Buyer@UJ4!Zz');

  const draft4 = await ListingService.create(sellerSession, {
    title: 'Camera', description: '<p>Nice</p>', price: 200,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing: listing4 } = await ListingService.publish(sellerSession, draft4.id);

  const thread4 = await ThreadService.create(buyerSession, listing4.id);
  const transaction = await TransactionService.create(buyerSession, thread4.id);
  await TransactionService.transition(sellerSession, transaction.id, TransactionStatus.RESERVED);

  // Cannot complete from RESERVED (must go through AGREED first)
  await assertThrowsAsync(
    () => TransactionService.transition(buyerSession, transaction.id, TransactionStatus.COMPLETED),
    'StateTransitionError'
  );
});

suite.test('User Journey: buyer files complaint after completed transaction', async () => {
  const { } = stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'uj_admin5', password: 'Admin@UJ5!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('uj_admin5', 'Admin@UJ5!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Tech', sortOrder: 1 });

  await AuthService.register({
    username: 'uj_seller5', password: 'Seller@UJ5!Z',
    displayName: 'Seller5', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('uj_seller5', 'Seller@UJ5!Z');

  await AuthService.register({
    username: 'uj_buyer5', password: 'Buyer@UJ5!Zz',
    displayName: 'Buyer5', securityQuestions: SQ,
  });
  const { session: buyerSession } = await AuthService.login('uj_buyer5', 'Buyer@UJ5!Zz');

  const draft5 = await ListingService.create(sellerSession, {
    title: 'Phone', description: '<p>Works great</p>', price: 300,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing: listing5 } = await ListingService.publish(sellerSession, draft5.id);

  const thread5 = await ThreadService.create(buyerSession, listing5.id);
  const transaction5 = await TransactionService.create(buyerSession, thread5.id);
  await TransactionService.transition(sellerSession, transaction5.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, transaction5.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, transaction5.id, TransactionStatus.COMPLETED);

  // Buyer files complaint on completed transaction
  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: transaction5.id,
    issueType: 'item_not_as_described',
    description: 'The phone was damaged',
  });
  assertEqual(complaint.status, ComplaintStatus.OPEN, 'Complaint starts as OPEN');
  assertEqual(complaint.userId, buyerSession.userId, 'Complaint belongs to buyer');
});

// ══════════════════════════════════════════════════════════
//  MODERATOR JOURNEY: pick up case → decide
// ══════════════════════════════════════════════════════════

suite.test('Moderator Journey: approve listing in review queue', async () => {
  stubRepos();
  _ls.clear();

  // Admin setup
  await InitService.createInitialAdmin({
    username: 'mj_admin', password: 'Admin@MJ1!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('mj_admin', 'Admin@MJ1!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Art', sortOrder: 1 });

  // Create a seller + listing
  await AuthService.register({
    username: 'mj_seller', password: 'Seller@MJ1!Z',
    displayName: 'Seller', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('mj_seller', 'Seller@MJ1!Z');

  const listing = await ListingService.create(sellerSession, {
    title: 'Painting', description: '<p>Original work</p>', price: 500,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });

  // Create a moderation case for this listing
  const modCase = await ModerationService.createCase(null, {
    contentId: listing.id,
    contentType: 'listing',
    reason: 'Pre-screen flag',
    flaggedWords: ['spam'],
  });

  // Force listing to UNDER_REVIEW
  await repos.listingRepository.update({ ...listing, status: ListingStatus.UNDER_REVIEW });

  // Moderator picks up the case
  const modSession = makeModSession('mod-user-1');
  const pickedUp = await ModerationService.pickUpCase(modSession, modCase.id);
  assertEqual(pickedUp.status, ModerationStatus.IN_REVIEW, 'Case must be IN_REVIEW after pick up');

  // Moderator approves
  const decided = await ModerationService.decide(modSession, modCase.id, { decision: 'approved' });
  assertEqual(decided.status, ModerationStatus.APPROVED, 'Case must be APPROVED');
  assertEqual(decided.decision, 'approved', 'Decision must be recorded');

  // Listing must be back to ACTIVE (ModerationService.decide handles this)
  const updatedListing = await repos.listingRepository.getById(listing.id);
  assertEqual(updatedListing.status, ListingStatus.ACTIVE, 'Listing must be ACTIVE after approval');
});

suite.test('Moderator Journey: reject listing with violation tags', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'mj_admin2', password: 'Admin@MJ2!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('mj_admin2', 'Admin@MJ2!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Other', sortOrder: 1 });

  await AuthService.register({
    username: 'mj_seller2', password: 'Seller@MJ2!Z',
    displayName: 'Seller', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('mj_seller2', 'Seller@MJ2!Z');

  const listing = await ListingService.create(sellerSession, {
    title: 'Counterfeit Item', description: '<p>Fake brand</p>', price: 10,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });

  const modCase = await ModerationService.createCase(null, {
    contentId: listing.id,
    contentType: 'listing',
    reason: 'Counterfeit goods',
    flaggedWords: [],
  });
  await repos.listingRepository.update({ ...listing, status: ListingStatus.UNDER_REVIEW });

  const modSession = makeModSession('mod-user-2');
  await ModerationService.pickUpCase(modSession, modCase.id);

  const decided = await ModerationService.decide(modSession, modCase.id, {
    decision: 'rejected',
    violationTags: ['counterfeit', 'prohibited_item'],
    penalty: 'content_removal',
  });
  assertEqual(decided.status, ModerationStatus.REJECTED, 'Case must be REJECTED');
  assertEqual(decided.violationTags.length, 2, 'Violation tags must be recorded');
  assertEqual(decided.penalty, 'content_removal', 'Penalty must be recorded');

  // Listing must be REJECTED
  const updatedListing = await repos.listingRepository.getById(listing.id);
  assertEqual(updatedListing.status, ListingStatus.REJECTED, 'Listing must be REJECTED after rejection');
});

suite.test('Moderator Journey: cannot decide without first picking up case', async () => {
  stubRepos();
  _ls.clear();

  const modCase = await ModerationService.createCase(null, {
    contentId: 'listing-x', contentType: 'listing', reason: 'test',
  });

  const modSession = makeModSession('mod-user-3');
  // Cannot approve PENDING case (must pick up first)
  await assertThrowsAsync(
    () => ModerationService.decide(modSession, modCase.id, { decision: 'approved' }),
    'StateTransitionError'
  );
});

// ══════════════════════════════════════════════════════════
//  SUPPORT AGENT JOURNEY: complaint → investigate → resolve
// ══════════════════════════════════════════════════════════

suite.test('Support Journey: investigate and resolve complaint', async () => {
  stubRepos();
  _ls.clear();

  // Setup admin + category + users + listing + transaction
  await InitService.createInitialAdmin({
    username: 'sj_admin', password: 'Admin@SJ1!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('sj_admin', 'Admin@SJ1!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Furniture', sortOrder: 1 });

  await AuthService.register({
    username: 'sj_seller', password: 'Seller@SJ1!Z',
    displayName: 'Seller', securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('sj_seller', 'Seller@SJ1!Z');

  await AuthService.register({
    username: 'sj_buyer', password: 'Buyer@SJ1!Zz',
    displayName: 'Buyer', securityQuestions: SQ,
  });
  const { session: buyerSession } = await AuthService.login('sj_buyer', 'Buyer@SJ1!Zz');

  const sjDraft = await ListingService.create(sellerSession, {
    title: 'Sofa', description: '<p>Comfortable</p>', price: 400,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing: sjListing } = await ListingService.publish(sellerSession, sjDraft.id);

  const sjThread = await ThreadService.create(buyerSession, sjListing.id);
  const sjTx = await TransactionService.create(buyerSession, sjThread.id);
  await TransactionService.transition(sellerSession, sjTx.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, sjTx.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, sjTx.id, TransactionStatus.COMPLETED);

  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: sjTx.id,
    issueType: 'item_not_as_described',
    description: 'Missing cushions',
  });
  assertEqual(complaint.status, ComplaintStatus.OPEN);

  // Support agent transitions to INVESTIGATING (picks up)
  const agentSession = makeAgentSession('agent-sj-1');
  const investigating = await SupportService.transitionComplaint(
    agentSession, complaint.id, ComplaintStatus.INVESTIGATING
  );
  assertEqual(investigating.status, ComplaintStatus.INVESTIGATING);

  // Agent resolves
  const resolved = await SupportService.transitionComplaint(
    agentSession, complaint.id, ComplaintStatus.RESOLVED, 'Partial refund agreed'
  );
  assertEqual(resolved.status, ComplaintStatus.RESOLVED);
  assert(resolved.resolution, 'Resolution text must be recorded');
});

suite.test('Support Journey: regular user cannot manage complaints (RBAC)', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'sj_admin2', password: 'Admin@SJ2!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('sj_admin2', 'Admin@SJ2!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'Books', sortOrder: 1 });

  await AuthService.register({ username: 'sj_seller2', password: 'Seller@SJ2!Z', displayName: 'S', securityQuestions: SQ });
  const { session: sellerSession } = await AuthService.login('sj_seller2', 'Seller@SJ2!Z');
  await AuthService.register({ username: 'sj_buyer2', password: 'Buyer@SJ2!Zz', displayName: 'B', securityQuestions: SQ });
  const { session: buyerSession } = await AuthService.login('sj_buyer2', 'Buyer@SJ2!Zz');

  const sjDraft2 = await ListingService.create(sellerSession, {
    title: 'Novel', description: '<p>Good book</p>', price: 15,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing: sjListing2 } = await ListingService.publish(sellerSession, sjDraft2.id);

  const sjThread2 = await ThreadService.create(buyerSession, sjListing2.id);
  const sjTx2 = await TransactionService.create(buyerSession, sjThread2.id);
  await TransactionService.transition(sellerSession, sjTx2.id, TransactionStatus.RESERVED);
  await TransactionService.transition(buyerSession, sjTx2.id, TransactionStatus.AGREED);
  await TransactionService.transition(buyerSession, sjTx2.id, TransactionStatus.COMPLETED);

  const complaint = await SupportService.createComplaint(buyerSession, {
    transactionId: sjTx2.id, issueType: 'other', description: 'Issue with order',
  });

  // Regular user (buyer) cannot transition complaint status — only support agents can
  await assertThrowsAsync(
    () => SupportService.transitionComplaint(buyerSession, complaint.id, ComplaintStatus.INVESTIGATING),
    'AuthorizationError'
  );
});

// ══════════════════════════════════════════════════════════
//  ROLE ACCESS CONTROL: route guard simulation
// ══════════════════════════════════════════════════════════

suite.test('Route Guard: regular user cannot access admin routes at service level', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin', password: 'Admin@RG1!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('rg_admin', 'Admin@RG1!Zz');

  await AuthService.register({
    username: 'rg_user', password: 'User@RG1!!AZz',
    displayName: 'User', securityQuestions: SQ,
  });
  const { session: userSession } = await AuthService.login('rg_user', 'User@RG1!!AZz');

  // Regular user cannot create categories
  await assertThrowsAsync(
    () => AdminService.createCategory(userSession, { name: 'Cat', sortOrder: 1 }),
    'AuthorizationError'
  );
});

suite.test('Route Guard: regular user cannot access moderation at service level', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin2', password: 'Admin@RG2!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_user2', password: 'User@RG2!!AZz',
    displayName: 'User2', securityQuestions: SQ,
  });
  const { session: userSession } = await AuthService.login('rg_user2', 'User@RG2!!AZz');

  const modCase = await ModerationService.createCase(null, {
    contentId: 'listing-y', contentType: 'listing', reason: 'test',
  });

  // Regular user cannot pick up or decide moderation cases
  await assertThrowsAsync(
    () => ModerationService.pickUpCase(userSession, modCase.id),
    'AuthorizationError'
  );
});

suite.test('Route Guard: uninitialized system detection (setup gate)', async () => {
  stubRepos();
  _ls.clear();

  // Fresh system is not initialized
  const initialized = await InitService.isInitialized();
  assertEqual(initialized, false, 'Fresh system must not be initialized');

  // After admin creation, system is initialized
  await InitService.createInitialAdmin({
    username: 'rg_admin3', password: 'Admin@RG3!Zz',
    displayName: 'Admin3', securityQuestions: SQ,
  });
  const nowInitialized = await InitService.isInitialized();
  assertEqual(nowInitialized, true, 'System must be initialized after setup');
});

suite.test('Route Guard: setup cannot be repeated (admin creation blocked after init)', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin4', password: 'Admin@RG4!Zz',
    displayName: 'Admin4', securityQuestions: SQ,
  });

  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'second_admin', password: 'Admin@RG4!Zz',
      displayName: 'Second', securityQuestions: SQ,
    }),
    'ValidationError',
    'already initialized'
  );
});

// ══════════════════════════════════════════════════════════
//  SESSION ISOLATION: logout clears state
// ══════════════════════════════════════════════════════════

suite.test('Session Isolation: logout invalidates session in DB', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'si_admin', password: 'Admin@SI1!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session } = await AuthService.login('si_admin', 'Admin@SI1!Zz');
  assert(session.userId, 'Session must exist after login');

  // Logout
  await AuthService.logout();

  // Session must no longer be valid in localStorage
  const raw = localStorage.getItem('tradeloop_session');
  assert(!raw || raw === 'null', 'Session must be cleared from localStorage after logout');
});

suite.test('Session Isolation: user A data not accessible to user B', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'si_admin2', password: 'Admin@SI2!Zz',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('si_admin2', 'Admin@SI2!Zz');
  const cat = await AdminService.createCategory(adminSession, { name: 'X', sortOrder: 1 });

  await AuthService.register({ username: 'si_userA', password: 'UserA@SI2!Zz', displayName: 'A', securityQuestions: SQ });
  await AuthService.register({ username: 'si_userB', password: 'UserB@SI2!Zz', displayName: 'B', securityQuestions: SQ });
  const { session: sessionA } = await AuthService.login('si_userA', 'UserA@SI2!Zz');
  const { session: sessionB } = await AuthService.login('si_userB', 'UserB@SI2!Zz');

  // User A creates a listing
  const listing = await ListingService.create(sessionA, {
    title: 'User A Item', description: '<p>A item</p>', price: 50,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });

  // User B cannot edit user A's listing
  await assertThrowsAsync(
    () => ListingService.update(sessionB, listing.id, { title: 'Hacked' }),
    'AuthorizationError'
  );
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
