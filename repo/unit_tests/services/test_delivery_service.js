/**
 * DeliveryService — Unit Tests
 *
 * Covers: isZipCovered, addCoveragePrefix, removeCoveragePrefix,
 * getAllCoverage, getAvailableWindows, bookDelivery.
 *
 * Stubs: deliveryBookingRepository, coverageZipRepository,
 *        transactionRepository, listingRepository, AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { DeliveryService } from '../../src/services/DeliveryService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { TransactionStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('DeliveryService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const bookingRepo     = new InMemoryRepository();
const coverageRepo    = new InMemoryRepository();
const transactionRepo = new InMemoryRepository();
const listingRepo     = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1') { return createSession(id, [Roles.USER]); }
function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }

function stubRepos() {
  // deliveryBookingRepository
  repos.deliveryBookingRepository.create            = r  => bookingRepo.create(r);
  repos.deliveryBookingRepository.getAll            = ()  => bookingRepo.getAll();
  repos.deliveryBookingRepository.getByWindowKey    = wk => bookingRepo.getByIndex('windowKey', wk);
  repos.deliveryBookingRepository.getByTransactionId = async tid => bookingRepo.getOneByIndex('transactionId', tid);
  repos.deliveryBookingRepository.countByIndex       = async (k, v) =>
    (await bookingRepo.getByIndex(k, v)).length;

  // coverageZipRepository
  repos.coverageZipRepository.create    = r   => coverageRepo.create(r);
  repos.coverageZipRepository.getAll    = ()  => coverageRepo.getAll();
  repos.coverageZipRepository.delete    = id  => coverageRepo.delete(id);
  repos.coverageZipRepository.getByPrefix = async prefix =>
    coverageRepo.getOneByIndex('prefix', prefix);

  // transactionRepository
  repos.transactionRepository.getById      = id => transactionRepo.getById(id);
  repos.transactionRepository.getByIdOrFail = async id => {
    const r = await transactionRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };

  // listingRepository
  repos.listingRepository.getById      = id => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = async id => {
    const r = await listingRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };

  AuditService.log = async () => {};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('isZipCovered: returns true for covered ZIP', async () => {
  stubRepos(); await coverageRepo.clear();
  await coverageRepo.create({ id: uid(), prefix: '627', createdAt: Date.now() });

  const result = await DeliveryService.isZipCovered('62701');
  assertEqual(result, true);
});

suite.test('isZipCovered: returns false for uncovered ZIP', async () => {
  stubRepos(); await coverageRepo.clear();

  const result = await DeliveryService.isZipCovered('90210');
  assertEqual(result, false);
});

suite.test('isZipCovered: invalid ZIP throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => DeliveryService.isZipCovered('ABCDE'),
    'ValidationError',
  );
});

suite.test('isZipCovered: missing ZIP throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => DeliveryService.isZipCovered(''),
    'ValidationError',
  );
});

suite.test('addCoveragePrefix: admin can add a valid prefix', async () => {
  stubRepos(); await coverageRepo.clear();
  const result = await DeliveryService.addCoveragePrefix(adminSession(), '627');
  assertEqual(result.prefix, '627');
  assert(result.id, 'id assigned');
});

suite.test('addCoveragePrefix: regular user cannot add prefix', async () => {
  stubRepos(); await coverageRepo.clear();
  await assertThrowsAsync(
    () => DeliveryService.addCoveragePrefix(userSession(), '627'),
    'AuthorizationError',
  );
});

suite.test('addCoveragePrefix: duplicate prefix throws ValidationError', async () => {
  stubRepos(); await coverageRepo.clear();
  await DeliveryService.addCoveragePrefix(adminSession(), '627');
  await assertThrowsAsync(
    () => DeliveryService.addCoveragePrefix(adminSession(), '627'),
    'ValidationError',
  );
});

suite.test('addCoveragePrefix: invalid prefix (not 3 digits) throws ValidationError', async () => {
  stubRepos(); await coverageRepo.clear();
  await assertThrowsAsync(
    () => DeliveryService.addCoveragePrefix(adminSession(), '62'),
    'ValidationError',
  );
});

suite.test('removeCoveragePrefix: admin can remove an existing prefix', async () => {
  stubRepos(); await coverageRepo.clear();
  await DeliveryService.addCoveragePrefix(adminSession(), '627');
  await DeliveryService.removeCoveragePrefix(adminSession(), '627');
  const result = await DeliveryService.isZipCovered('62701');
  assertEqual(result, false);
});

suite.test('removeCoveragePrefix: removing non-existent prefix throws ValidationError', async () => {
  stubRepos(); await coverageRepo.clear();
  await assertThrowsAsync(
    () => DeliveryService.removeCoveragePrefix(adminSession(), '999'),
    'ValidationError',
  );
});

suite.test('getAllCoverage: returns all coverage entries', async () => {
  stubRepos(); await coverageRepo.clear();
  await DeliveryService.addCoveragePrefix(adminSession(), '627');
  await DeliveryService.addCoveragePrefix(adminSession(), '606');
  const all = await DeliveryService.getAllCoverage(userSession());
  assertEqual(all.length, 2);
});

suite.test('getAvailableWindows: returns slots for a date', async () => {
  stubRepos(); await bookingRepo.clear();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const windows = await DeliveryService.getAvailableWindows(userSession(), tomorrow);
  assert(Array.isArray(windows), 'returns array');
  assert(windows.length > 0, 'has windows');
  assert('availableSlots' in windows[0], 'slot has availableSlots');
  assert('isFull' in windows[0], 'slot has isFull');
});

suite.test('bookDelivery: books successfully when coverage and capacity exist', async () => {
  stubRepos();
  await bookingRepo.clear(); await coverageRepo.clear();
  await transactionRepo.clear(); await listingRepo.clear();

  // Seed coverage for ZIP 62701
  await coverageRepo.create({ id: uid(), prefix: '627', createdAt: Date.now() });

  const listing = {
    id: uid(), sellerId: 'seller-1', title: 'Item',
    deliveryOptions: { pickup: false, delivery: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await listingRepo.create(listing);

  const transaction = {
    id: uid(), listingId: listing.id, buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await transactionRepo.create(transaction);

  const result = await DeliveryService.bookDelivery(
    userSession('buyer-1'),
    { transactionId: transaction.id, windowKey: '2025-01-15:09-12', zipCode: '62701' },
  );
  assert(result.id, 'booking has id');
  assertEqual(result.transactionId, transaction.id);
  assertEqual(result.userId, 'buyer-1');
});

suite.test('bookDelivery: non-participant cannot book', async () => {
  stubRepos();
  await bookingRepo.clear(); await coverageRepo.clear();
  await transactionRepo.clear(); await listingRepo.clear();

  await coverageRepo.create({ id: uid(), prefix: '627', createdAt: Date.now() });

  const listing = {
    id: uid(), sellerId: 'seller-1', title: 'Item',
    deliveryOptions: { pickup: false, delivery: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await listingRepo.create(listing);

  const transaction = {
    id: uid(), listingId: listing.id, buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await transactionRepo.create(transaction);

  await assertThrowsAsync(
    () => DeliveryService.bookDelivery(
      userSession('stranger'),
      { transactionId: transaction.id, windowKey: '2025-01-15:09-12', zipCode: '62701' },
    ),
    'ValidationError',
  );
});

suite.test('bookDelivery: listing without delivery option throws ValidationError', async () => {
  stubRepos();
  await bookingRepo.clear(); await coverageRepo.clear();
  await transactionRepo.clear(); await listingRepo.clear();

  await coverageRepo.create({ id: uid(), prefix: '627', createdAt: Date.now() });

  const listing = {
    id: uid(), sellerId: 'seller-1', title: 'Item',
    deliveryOptions: { pickup: true, delivery: false }, // no delivery
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await listingRepo.create(listing);

  const transaction = {
    id: uid(), listingId: listing.id, buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await transactionRepo.create(transaction);

  await assertThrowsAsync(
    () => DeliveryService.bookDelivery(
      userSession('buyer-1'),
      { transactionId: transaction.id, windowKey: '2025-01-15:09-12', zipCode: '62701' },
    ),
    'ValidationError',
  );
});

suite.test('bookDelivery: uncovered ZIP throws ValidationError', async () => {
  stubRepos();
  await bookingRepo.clear(); await coverageRepo.clear();
  await transactionRepo.clear(); await listingRepo.clear();
  // No coverage entries added

  const listing = {
    id: uid(), sellerId: 'seller-1', title: 'Item',
    deliveryOptions: { pickup: false, delivery: true },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await listingRepo.create(listing);

  const transaction = {
    id: uid(), listingId: listing.id, buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await transactionRepo.create(transaction);

  await assertThrowsAsync(
    () => DeliveryService.bookDelivery(
      userSession('buyer-1'),
      { transactionId: transaction.id, windowKey: '2025-01-15:09-12', zipCode: '99999' },
    ),
    'ValidationError',
  );
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
