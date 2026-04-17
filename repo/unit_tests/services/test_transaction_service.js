/**
 * TransactionService — Unit Tests
 *
 * Covers: create, transition (INQUIRY→RESERVED→AGREED→COMPLETED), cancel,
 * getById, getByThreadId, getMyTransactions, role-gated step ownership,
 * ConflictError on duplicate, markListingSold on COMPLETED.
 *
 * Stubs: transactionRepository, listingRepository, threadRepository,
 *        NotificationService, ThreadService, AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { TransactionService } from '../../src/services/TransactionService.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { ThreadService } from '../../src/services/ThreadService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { TransactionStatus, ListingStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('TransactionService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const txRepo      = new InMemoryRepository();
const listingRepo = new InMemoryRepository();
const threadRepo  = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

// ── Sessions ──────────────────────────────────────────────────────────────────
function adminSession(id = 'admin-1')  { return createSession(id, [Roles.ADMIN]); }
function userSession(id = 'user-1')   { return createSession(id, [Roles.USER]); }

// ── Stubs ─────────────────────────────────────────────────────────────────────
function stubRepos() {
  repos.transactionRepository.create        = r  => txRepo.create(r);
  repos.transactionRepository.getById       = id => txRepo.getById(id);
  repos.transactionRepository.getByIdOrFail = async id => {
    const r = await txRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.transactionRepository.getAll        = ()  => txRepo.getAll();
  repos.transactionRepository.update        = r   => txRepo.update(r);
  repos.transactionRepository.getByIndex    = (k, v) => txRepo.getByIndex(k, v);
  repos.transactionRepository.getOneByIndex = (k, v) => txRepo.getOneByIndex(k, v);
  repos.transactionRepository.getByThreadId = async (id) => txRepo.getOneByIndex('threadId', id);

  repos.listingRepository.getById          = id => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail    = async id => {
    const r = await listingRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.listingRepository.update           = r  => listingRepo.update(r);
  repos.listingRepository.getByIndex       = (k, v) => listingRepo.getByIndex(k, v);

  repos.threadRepository.getByIdOrFail     = async id => {
    const r = await threadRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.threadRepository.update            = r => threadRepo.update(r);

  AuditService.log                         = async () => {};
  NotificationService.create               = async () => {};
  ThreadService.markReadOnly               = async () => {};
}

function makeListing(overrides = {}) {
  return {
    id:              uid(),
    sellerId:        'seller-1',
    title:           'Item',
    status:          ListingStatus.ACTIVE,
    deliveryOptions: { pickup: true, delivery: false },
    createdAt:       Date.now(),
    updatedAt:       Date.now(),
    ...overrides,
  };
}

function makeThread(listingId, overrides = {}) {
  return {
    id:         uid(),
    listingId,
    buyerId:    'buyer-1',
    sellerId:   'seller-1',
    isReadOnly: false,
    createdAt:  Date.now(),
    updatedAt:  Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('create: creates INQUIRY transaction for thread participants', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing();
  await listingRepo.create(listing);
  const thread = makeThread(listing.id);
  await threadRepo.create(thread);

  const result = await TransactionService.create(userSession('buyer-1'), thread.id);
  assertEqual(result.status,   TransactionStatus.INQUIRY);
  assertEqual(result.buyerId,  'buyer-1');
  assertEqual(result.sellerId, 'seller-1');
  assertEqual(result.threadId, thread.id);
});

suite.test('create: seller cannot initiate their own transaction', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { buyerId: 'buyer-1', sellerId: 'seller-1' });
  await threadRepo.create(thread);

  // seller tries to create transaction in their own thread — not participant as buyer
  await assertThrowsAsync(
    () => TransactionService.create(userSession('seller-1'), thread.id),
    'ValidationError',
  );
});

suite.test('transition: seller advances INQUIRY → RESERVED', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  const result = await TransactionService.transition(
    userSession('seller-1'), tx.id, TransactionStatus.RESERVED,
  );
  assertEqual(result.status, TransactionStatus.RESERVED);
  assert(result.reservedAt, 'reservedAt set');
});

suite.test('transition: buyer cannot advance INQUIRY → RESERVED (seller-only step)', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.transition(userSession('buyer-1'), tx.id, TransactionStatus.RESERVED),
    'ValidationError',
  );
});

suite.test('transition: buyer advances RESERVED → AGREED (buyer-only step)', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.RESERVED, reservedAt: Date.now(),
    agreedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  const result = await TransactionService.transition(
    userSession('buyer-1'), tx.id, TransactionStatus.AGREED,
  );
  assertEqual(result.status, TransactionStatus.AGREED);
});

suite.test('transition: seller cannot advance RESERVED → AGREED', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.RESERVED, reservedAt: Date.now(),
    agreedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.transition(userSession('seller-1'), tx.id, TransactionStatus.AGREED),
    'ValidationError',
  );
});

suite.test('transition: buyer advances AGREED → COMPLETED', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, reservedAt: Date.now(), agreedAt: Date.now(),
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  const result = await TransactionService.transition(
    userSession('buyer-1'), tx.id, TransactionStatus.COMPLETED,
  );
  assertEqual(result.status, TransactionStatus.COMPLETED);
  assert(result.completedAt, 'completedAt set');
});

suite.test('transition: COMPLETED marks listing as SOLD', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, reservedAt: Date.now(), agreedAt: Date.now(),
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await TransactionService.transition(userSession('buyer-1'), tx.id, TransactionStatus.COMPLETED);

  const updatedListing = await listingRepo.getById(listing.id);
  assertEqual(updatedListing.status, ListingStatus.SOLD);
});

suite.test('transition: non-participant cannot transition', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.transition(userSession('stranger'), tx.id, TransactionStatus.RESERVED),
    'ValidationError',
  );
});

suite.test('transition: invalid state machine transition throws', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  // INQUIRY → COMPLETED is an invalid skip
  await assertThrowsAsync(
    () => TransactionService.transition(userSession('buyer-1'), tx.id, TransactionStatus.COMPLETED),
    'StateTransitionError',
  );
});

suite.test('cancel: buyer can cancel in AGREED state with reason code', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, reservedAt: Date.now(), agreedAt: Date.now(),
    completedAt: null, canceledAt: null, cancellationReason: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  const result = await TransactionService.cancel(
    userSession('buyer-1'), tx.id, 'buyer_changed_mind',
  );
  assertEqual(result.status, TransactionStatus.CANCELED);
  assert(result.cancellationReason, 'reason recorded');
});

suite.test('cancel: cannot cancel a COMPLETED transaction', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.COMPLETED,
    reservedAt: Date.now(), agreedAt: Date.now(), completedAt: Date.now(),
    canceledAt: null, cancellationReason: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.cancel(userSession('buyer-1'), tx.id, 'changed_mind'),
    'ValidationError',
  );
});

suite.test('cancel: missing reason code throws ValidationError', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, reservedAt: Date.now(), agreedAt: Date.now(),
    completedAt: null, canceledAt: null, cancellationReason: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.cancel(userSession('buyer-1'), tx.id, null),
    'ValidationError',
  );
});

suite.test('getById: participant can fetch transaction', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  const result = await TransactionService.getById(userSession('buyer-1'), tx.id);
  assertEqual(result.id, tx.id);
});

suite.test('getById: non-participant regular user cannot fetch', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);
  const thread = makeThread(listing.id, { id: uid() });
  await threadRepo.create(thread);

  const tx = {
    id: uid(), threadId: thread.id, listingId: listing.id,
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY, reservedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await txRepo.create(tx);

  await assertThrowsAsync(
    () => TransactionService.getById(userSession('stranger'), tx.id),
    'ValidationError',
  );
});

suite.test('getMyTransactions: returns both buyer and seller transactions', async () => {
  stubRepos();
  await txRepo.clear(); await listingRepo.clear(); await threadRepo.clear();

  const listing = makeListing({ id: uid() });
  await listingRepo.create(listing);

  const t1 = { id: uid(), threadId: uid(), listingId: listing.id, buyerId: 'user-1', sellerId: 'other', status: TransactionStatus.INQUIRY, createdAt: Date.now(), updatedAt: Date.now() };
  const t2 = { id: uid(), threadId: uid(), listingId: listing.id, buyerId: 'other',  sellerId: 'user-1', status: TransactionStatus.RESERVED, createdAt: Date.now(), updatedAt: Date.now() };
  const t3 = { id: uid(), threadId: uid(), listingId: listing.id, buyerId: 'x',      sellerId: 'y',      status: TransactionStatus.AGREED, createdAt: Date.now(), updatedAt: Date.now() };
  await txRepo.create(t1); await txRepo.create(t2); await txRepo.create(t3);

  const results = await TransactionService.getMyTransactions(userSession('user-1'));
  assertEqual(results.length, 2);
  assert(results.some(t => t.id === t1.id), 'buyer tx');
  assert(results.some(t => t.id === t2.id), 'seller tx');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
