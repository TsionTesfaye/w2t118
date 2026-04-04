/**
 * IndexedDB Real-Persistence Tests
 *
 * Uses fake-indexeddb to exercise the ACTUAL repository/database layer —
 * not InMemoryRepository stubs. Tests that data written to IndexedDB
 * survives a close-and-reopen cycle, simulating a browser tab reload.
 *
 * What is tested:
 *   - User records persist across DB close/reopen
 *   - Listing records persist
 *   - Thread + Message records persist
 *   - Transaction records persist
 *   - Index queries (getByIndex) still work after reload
 *   - Multiple store types coexist without interference
 *   - deleteDatabase() wipes all data cleanly
 *
 * NOTE: fake-indexeddb retains data within the same IDBFactory instance
 * across close/reopen cycles, faithfully mimicking browser IndexedDB
 * behaviour for a single page session.
 */

// ── Polyfills (must come before any src/ import) ──
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'crypto';
if (!globalThis.crypto)    globalThis.crypto    = webcrypto;
if (!globalThis.IDBKeyRange) globalThis.IDBKeyRange = IDBKeyRange;

// Install a fresh IDBFactory.  This must happen before database.js runs.
globalThis.indexedDB = new IDBFactory();

// ── localStorage stub (not needed by these tests but guards against accidental calls) ──
const _lsStore = new Map();
globalThis.localStorage = {
  getItem:    (k) => _lsStore.get(k) ?? null,
  setItem:    (k, v) => _lsStore.set(k, v),
  removeItem: (k) => _lsStore.delete(k),
  clear:      () => _lsStore.clear(),
  get length()  { return _lsStore.size; },
  key:        (i) => [..._lsStore.keys()][i] ?? null,
};

import {
  TestRunner, assert, assertEqual,
} from '../setup.js';
import {
  getDatabase, closeDatabase, deleteDatabase,
} from '../../src/repositories/database.js';
import { userRepository }        from '../../src/repositories/UserRepository.js';
import { listingRepository }     from '../../src/repositories/ListingRepository.js';
import { threadRepository }      from '../../src/repositories/ThreadRepository.js';
import { messageRepository }     from '../../src/repositories/MessageRepository.js';
import { transactionRepository } from '../../src/repositories/TransactionRepository.js';
import { notificationRepository } from '../../src/repositories/NotificationRepository.js';
import { generateId }            from '../../src/utils/id.js';
import { now }                   from '../../src/utils/time.js';

const suite = new TestRunner('IndexedDB Real Persistence');

// ─── helpers ───────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  const id = generateId();
  return {
    id,
    username: `user-${id.slice(0, 8)}`,
    displayName: 'Test User',
    passwordHash: 'hash',
    salt: 'salt',
    roles: ['user'],
    avatar: null,
    bio: '',
    securityQuestions: [],
    notificationPreferences: { messages: true, transactions: true, moderation: true, complaints: true },
    failedAttempts: 0,
    lockoutUntil: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeListing(sellerId, overrides = {}) {
  return {
    id: generateId(),
    sellerId,
    title: 'Test Listing',
    description: '<p>Description</p>',
    price: 25,
    status: 'active',
    categoryId: 'cat-1',
    tagIds: [],
    media: [],
    deliveryOptions: { pickup: true, delivery: false },
    isPinned: false,
    isFeatured: false,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeThread(buyerId, sellerId, listingId, overrides = {}) {
  return {
    id: generateId(),
    listingId,
    buyerId,
    sellerId,
    isReadOnly: false,
    archivedBy: [],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

function makeMessage(threadId, senderId, overrides = {}) {
  return {
    id: generateId(),
    threadId,
    senderId,
    body: 'Hello!',
    isRead: false,
    createdAt: now(),
    ...overrides,
  };
}

function makeTransaction(threadId, buyerId, sellerId, listingId, overrides = {}) {
  return {
    id: generateId(),
    threadId,
    buyerId,
    sellerId,
    listingId,
    status: 'inquiry',
    reservedAt: null,
    agreedAt: null,
    completedAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

/** Simulate a browser-tab reload: close DB connection, then reopen. */
async function simulateReload() {
  closeDatabase();
  await getDatabase(); // reopen — same IDBFactory, data survives
}

// ─── tests ─────────────────────────────────────────────────────────────────

suite.test('user: created record is immediately retrievable', async () => {
  const user = makeUser();
  await userRepository.create(user);

  const fetched = await userRepository.getById(user.id);
  assert(fetched !== null, 'User must be retrievable after create');
  assertEqual(fetched.id, user.id, 'ID must match');
  assertEqual(fetched.username, user.username, 'Username must match');
});

suite.test('user: record persists after DB close + reopen (reload simulation)', async () => {
  const user = makeUser({ displayName: 'Reload Test' });
  await userRepository.create(user);

  await simulateReload();

  const fetched = await userRepository.getById(user.id);
  assert(fetched !== null, 'User must survive reload');
  assertEqual(fetched.displayName, 'Reload Test', 'displayName must be preserved');
});

suite.test('user: getByUsername index works after reload', async () => {
  const user = makeUser({ username: 'idx-test-user' });
  await userRepository.create(user);

  await simulateReload();

  const fetched = await userRepository.getByUsername('idx-test-user');
  assert(fetched !== null, 'Username index must work after reload');
  assertEqual(fetched.id, user.id, 'Must find same user by username');
});

suite.test('user: update is persisted and survives reload', async () => {
  const user = makeUser();
  await userRepository.create(user);

  const updated = { ...user, displayName: 'Updated Name', updatedAt: now() };
  await userRepository.update(updated);

  await simulateReload();

  const fetched = await userRepository.getById(user.id);
  assertEqual(fetched.displayName, 'Updated Name', 'Updated displayName must persist through reload');
});

suite.test('listing: record persists after reload', async () => {
  const seller = makeUser();
  await userRepository.create(seller);

  const listing = makeListing(seller.id, { title: 'Persistent Listing' });
  await listingRepository.create(listing);

  await simulateReload();

  const fetched = await listingRepository.getById(listing.id);
  assert(fetched !== null, 'Listing must survive reload');
  assertEqual(fetched.title, 'Persistent Listing', 'Title must be preserved');
  assertEqual(fetched.sellerId, seller.id, 'sellerId must be preserved');
});

suite.test('listing: getByIndex(sellerId) works after reload', async () => {
  const seller = makeUser();
  await userRepository.create(seller);

  const l1 = makeListing(seller.id, { title: 'L1' });
  const l2 = makeListing(seller.id, { title: 'L2' });
  await listingRepository.create(l1);
  await listingRepository.create(l2);

  await simulateReload();

  const bySellerList = await listingRepository.getBySellerId(seller.id);
  assert(bySellerList.length >= 2, 'Both listings must be found via sellerId index');
});

suite.test('thread + message: both persist across reload', async () => {
  const buyer  = makeUser();
  const seller = makeUser();
  const listing = makeListing(seller.id);
  await userRepository.create(buyer);
  await userRepository.create(seller);
  await listingRepository.create(listing);

  const thread = makeThread(buyer.id, seller.id, listing.id);
  await threadRepository.create(thread);

  const msg = makeMessage(thread.id, buyer.id, { body: 'Is this still available?' });
  await messageRepository.create(msg);

  await simulateReload();

  const fetchedThread = await threadRepository.getById(thread.id);
  assert(fetchedThread !== null, 'Thread must survive reload');
  assertEqual(fetchedThread.listingId, listing.id, 'Thread.listingId preserved');

  const messages = await messageRepository.getByIndex('threadId', thread.id);
  assertEqual(messages.length, 1, 'Message must survive reload');
  assertEqual(messages[0].body, 'Is this still available?', 'Message body preserved');
});

suite.test('transaction: persists and status survives reload', async () => {
  const buyer  = makeUser();
  const seller = makeUser();
  const listing = makeListing(seller.id);
  const thread  = makeThread(buyer.id, seller.id, listing.id);
  await userRepository.create(buyer);
  await userRepository.create(seller);
  await listingRepository.create(listing);
  await threadRepository.create(thread);

  const tx = makeTransaction(thread.id, buyer.id, seller.id, listing.id);
  await transactionRepository.create(tx);

  await simulateReload();

  const fetched = await transactionRepository.getById(tx.id);
  assert(fetched !== null, 'Transaction must survive reload');
  assertEqual(fetched.status, 'inquiry', 'Transaction status preserved');
  assertEqual(fetched.buyerId,  buyer.id,  'buyerId preserved');
  assertEqual(fetched.sellerId, seller.id, 'sellerId preserved');
});

suite.test('transaction: status update persists across reload', async () => {
  const buyer  = makeUser();
  const seller = makeUser();
  const listing = makeListing(seller.id);
  const thread  = makeThread(buyer.id, seller.id, listing.id);
  await userRepository.create(buyer);
  await userRepository.create(seller);
  await listingRepository.create(listing);
  await threadRepository.create(thread);

  const tx = makeTransaction(thread.id, buyer.id, seller.id, listing.id);
  await transactionRepository.create(tx);

  // Advance status
  await transactionRepository.update({ ...tx, status: 'reserved', reservedAt: now() });

  await simulateReload();

  const fetched = await transactionRepository.getById(tx.id);
  assertEqual(fetched.status, 'reserved', 'Updated transaction status must persist');
  assert(fetched.reservedAt, 'reservedAt timestamp must persist');
});

suite.test('multiple stores coexist without interference', async () => {
  const user = makeUser();
  const listing = makeListing(user.id);
  const thread = makeThread(user.id, user.id, listing.id);

  await userRepository.create(user);
  await listingRepository.create(listing);
  await threadRepository.create(thread);

  await simulateReload();

  // Each store has its own record
  const u = await userRepository.getById(user.id);
  const l = await listingRepository.getById(listing.id);
  const t = await threadRepository.getById(thread.id);

  assert(u !== null, 'User intact after multi-store reload');
  assert(l !== null, 'Listing intact after multi-store reload');
  assert(t !== null, 'Thread intact after multi-store reload');

  // Verify they did not corrupt each other
  assert(u.username !== undefined, 'User record has correct shape');
  assert(l.title !== undefined,    'Listing record has correct shape');
  assert(t.listingId !== undefined, 'Thread record has correct shape');
});

suite.test('notification: persists and isRead flag survives reload', async () => {
  const user = makeUser();
  await userRepository.create(user);

  const notif = {
    id: generateId(),
    userId: user.id,
    type: 'transaction',
    referenceId: generateId(),
    message: 'Your item was reserved',
    isRead: false,
    createdAt: now(),
  };
  await notificationRepository.create(notif);

  await simulateReload();

  const fetched = await notificationRepository.getById(notif.id);
  assert(fetched !== null, 'Notification must survive reload');
  assertEqual(fetched.isRead, false, 'isRead flag preserved');
  assertEqual(fetched.message, 'Your item was reserved', 'Message preserved');

  // Mark as read and verify that persists too
  await notificationRepository.update({ ...fetched, isRead: true });
  await simulateReload();

  const updated = await notificationRepository.getById(notif.id);
  assertEqual(updated.isRead, true, 'isRead=true must persist across reload');
});

suite.test('deleteDatabase: wipes all data, subsequent create works cleanly', async () => {
  const user = makeUser();
  await userRepository.create(user);

  // Wipe everything
  await deleteDatabase();

  // After delete, recreate DB (same IDBFactory but fresh DB)
  await getDatabase();

  // Previous data must be gone (IndexedDB returns undefined for missing keys)
  const fetched = await userRepository.getById(user.id);
  assert(fetched == null, 'All data must be wiped after deleteDatabase');

  // Fresh writes must work
  const newUser = makeUser({ displayName: 'Post-Delete' });
  await userRepository.create(newUser);
  const refetch = await userRepository.getById(newUser.id);
  assert(refetch !== null, 'New writes must work after deleteDatabase');
  assertEqual(refetch.displayName, 'Post-Delete', 'New record must have correct data');
});

suite.test('getAll returns all records across multiple creates', async () => {
  // Use fresh deleteDatabase to get a clean count
  await deleteDatabase();
  await getDatabase();

  const users = [makeUser(), makeUser(), makeUser()];
  for (const u of users) await userRepository.create(u);

  await simulateReload();

  const all = await userRepository.getAll();
  assert(all.length >= 3, `Must have at least 3 users, got ${all.length}`);
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
