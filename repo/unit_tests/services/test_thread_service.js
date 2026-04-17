/**
 * ThreadService — Unit Tests
 *
 * Covers: create, sendMessage, getMessages, getMyThreads, archive/unarchive,
 * markReadOnly, block enforcement, read-only enforcement.
 *
 * Stubs: threadRepository, messageRepository, listingRepository,
 *        blockRepository, NotificationService, AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { ThreadService } from '../../src/services/ThreadService.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { ListingStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';
import * as blockRepoModule from '../../src/repositories/BlockRepository.js';

const suite = new TestRunner('ThreadService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const threadRepo  = new InMemoryRepository();
const msgRepo     = new InMemoryRepository();
const listingRepo = new InMemoryRepository();
const blockRepo   = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1') { return createSession(id, [Roles.USER]); }

// ── Stubs ─────────────────────────────────────────────────────────────────────
function stubRepos() {
  repos.threadRepository.create        = r  => threadRepo.create(r);
  repos.threadRepository.getById       = id => threadRepo.getById(id);
  repos.threadRepository.getByIdOrFail = async id => {
    const r = await threadRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.threadRepository.getAll        = () => threadRepo.getAll();
  repos.threadRepository.update        = r  => threadRepo.update(r);
  repos.threadRepository.getByIndex    = (k, v) => threadRepo.getByIndex(k, v);

  repos.messageRepository.create       = r  => msgRepo.create(r);
  repos.messageRepository.getAll       = () => msgRepo.getAll();
  repos.messageRepository.getByIndex   = (k, v) => msgRepo.getByIndex(k, v);

  repos.listingRepository.getById      = id => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = async id => {
    const r = await listingRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };

  // Block repository — override the module-level singleton
  blockRepoModule.blockRepository.getByBlockerId   = (id) => blockRepo.getByIndex('blockerId', id);
  blockRepoModule.blockRepository.getByBlockedId   = (id) => blockRepo.getByIndex('blockedId', id);
  blockRepoModule.blockRepository.isBlocked        = async (a, b) => {
    const blocks = await blockRepo.getByIndex('blockerId', a);
    return blocks.some(bl => bl.blockedId === b);
  };
  blockRepoModule.blockRepository.isEitherBlocked  = async (a, b) => {
    const [ab, ba] = await Promise.all([
      blockRepoModule.blockRepository.isBlocked(a, b),
      blockRepoModule.blockRepository.isBlocked(b, a),
    ]);
    return ab || ba;
  };

  AuditService.log           = async () => {};
  NotificationService.create = async () => {};
}

function makeListing(overrides = {}) {
  return {
    id:       uid(),
    sellerId: 'seller-1',
    title:    'Item',
    status:   ListingStatus.ACTIVE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('create: buyer creates thread on active listing', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  const result = await ThreadService.create(userSession('buyer-1'), listing.id);
  assertEqual(result.buyerId,   'buyer-1');
  assertEqual(result.sellerId,  'seller-1');
  assertEqual(result.listingId, listing.id);
  assertEqual(result.isReadOnly, false);
});

suite.test('create: seller cannot create thread on own listing', async () => {
  stubRepos();
  await threadRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ThreadService.create(userSession('seller-1'), listing.id),
    'ValidationError',
  );
});

suite.test('create: cannot create duplicate thread for same listing', async () => {
  stubRepos();
  await threadRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  await ThreadService.create(userSession('buyer-1'), listing.id);

  await assertThrowsAsync(
    () => ThreadService.create(userSession('buyer-1'), listing.id),
    'ConflictError',
  );
});

suite.test('create: blocked user cannot create thread', async () => {
  stubRepos();
  await threadRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  // seller has blocked buyer
  await blockRepo.create({ id: uid(), blockerId: 'seller-1', blockedId: 'buyer-1', createdAt: Date.now() });

  await assertThrowsAsync(
    () => ThreadService.create(userSession('buyer-1'), listing.id),
    'AuthorizationError',
  );
});

suite.test('create: cannot create thread on inactive listing', async () => {
  stubRepos();
  await threadRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1', status: ListingStatus.ARCHIVED });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ThreadService.create(userSession('buyer-1'), listing.id),
    'ValidationError',
  );
});

suite.test('sendMessage: participant sends a message', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await listingRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  const msg = await ThreadService.sendMessage(userSession('buyer-1'), thread.id, 'Hello!');
  assertEqual(msg.content,  'Hello!');
  assertEqual(msg.senderId, 'buyer-1');
  assertEqual(msg.threadId, thread.id);
});

suite.test('sendMessage: non-participant cannot send message', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  await assertThrowsAsync(
    () => ThreadService.sendMessage(userSession('stranger'), thread.id, 'Hello!'),
    'AuthorizationError',
  );
});

suite.test('sendMessage: cannot send in read-only thread', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: true, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  await assertThrowsAsync(
    () => ThreadService.sendMessage(userSession('buyer-1'), thread.id, 'Hello!'),
    'ValidationError',
  );
});

suite.test('sendMessage: empty content throws ValidationError', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  await assertThrowsAsync(
    () => ThreadService.sendMessage(userSession('buyer-1'), thread.id, ''),
    'ValidationError',
  );
});

suite.test('getMessages: returns messages for thread participant', async () => {
  stubRepos();
  await threadRepo.clear(); await msgRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);
  await msgRepo.create({ id: uid(), threadId: thread.id, senderId: 'buyer-1', content: 'Hi', createdAt: Date.now() });
  await msgRepo.create({ id: uid(), threadId: thread.id, senderId: 'seller-1', content: 'Hey', createdAt: Date.now() + 1 });

  const messages = await ThreadService.getMessages(userSession('buyer-1'), thread.id);
  assertEqual(messages.length, 2);
});

suite.test('getMyThreads: returns threads for user as buyer or seller', async () => {
  stubRepos();
  await threadRepo.clear(); await blockRepo.clear();

  const t1 = { id: uid(), listingId: uid(), buyerId: 'user-1', sellerId: 'other', isReadOnly: false, archivedBy: [], createdAt: Date.now(), updatedAt: Date.now() };
  const t2 = { id: uid(), listingId: uid(), buyerId: 'other', sellerId: 'user-1', isReadOnly: false, archivedBy: [], createdAt: Date.now(), updatedAt: Date.now() };
  const t3 = { id: uid(), listingId: uid(), buyerId: 'a', sellerId: 'b', isReadOnly: false, archivedBy: [], createdAt: Date.now(), updatedAt: Date.now() };
  await threadRepo.create(t1); await threadRepo.create(t2); await threadRepo.create(t3);

  const results = await ThreadService.getMyThreads(userSession('user-1'));
  assertEqual(results.length, 2);
});

suite.test('archive: buyer can archive thread (soft delete)', async () => {
  stubRepos();
  await threadRepo.clear(); await blockRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, archivedBy: [],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  await ThreadService.archive(userSession('buyer-1'), thread.id);
  const updated = await threadRepo.getById(thread.id);
  assert(updated.archivedBy.includes('buyer-1'), 'buyer-1 in archivedBy');
});

suite.test('markReadOnly: sets thread as read-only', async () => {
  stubRepos();
  await threadRepo.clear();

  const thread = {
    id: uid(), listingId: uid(), buyerId: 'buyer-1', sellerId: 'seller-1',
    isReadOnly: false, buyerArchived: false, sellerArchived: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await threadRepo.create(thread);

  await ThreadService.markReadOnly(thread.id);
  const updated = await threadRepo.getById(thread.id);
  assertEqual(updated.isReadOnly, true);
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
