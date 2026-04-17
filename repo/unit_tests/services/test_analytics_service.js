/**
 * AnalyticsService — Unit Tests
 *
 * Covers: computeKPIs (returns all metrics, requires ANALYTICS_VIEW permission),
 * computeTrends (listings / transactions / complaints, unknown metric throws).
 *
 * Stubs: transactionRepository, complaintRepository, listingRepository,
 *        auditLogRepository.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AnalyticsService } from '../../src/services/AnalyticsService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { ComplaintStatus, TransactionStatus, ListingStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('AnalyticsService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const transactionRepo = new InMemoryRepository();
const complaintRepo   = new InMemoryRepository();
const listingRepo     = new InMemoryRepository();
const auditLogRepo    = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function userSession(id  = 'user-1')  { return createSession(id, [Roles.USER]); }

function stubRepos() {
  repos.transactionRepository.getAll = () => transactionRepo.getAll();
  repos.complaintRepository.getAll   = () => complaintRepo.getAll();
  repos.listingRepository.getAll     = () => listingRepo.getAll();
  repos.auditLogRepository.getAll    = () => auditLogRepo.getAll();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('computeKPIs: returns all expected keys', async () => {
  stubRepos();
  await transactionRepo.clear(); await complaintRepo.clear(); await listingRepo.clear();

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assert('postVolume'      in kpis, 'postVolume present');
  assert('claimRate'       in kpis, 'claimRate present');
  assert('avgHandlingTime' in kpis, 'avgHandlingTime present');
  assert('computedAt'      in kpis, 'computedAt present');
});

suite.test('computeKPIs: requires ANALYTICS_VIEW permission (non-admin USER lacks it)', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AnalyticsService.computeKPIs(userSession()),
    'AuthorizationError',
  );
});

suite.test('computeKPIs: postVolume totals reflect seeded listings', async () => {
  stubRepos();
  await listingRepo.clear();
  // Add two recent listings
  await listingRepo.create({ id: uid(), status: ListingStatus.ACTIVE, createdAt: Date.now() - 1000 });
  await listingRepo.create({ id: uid(), status: ListingStatus.ACTIVE, createdAt: Date.now() - 2000 });

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assertEqual(kpis.postVolume.total, 2);
  assertEqual(kpis.postVolume.last24h, 2);
});

suite.test('computeKPIs: claimRate is 0 when no transactions', async () => {
  stubRepos();
  await transactionRepo.clear(); await complaintRepo.clear();

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assertEqual(kpis.claimRate.rate, 0);
  assertEqual(kpis.claimRate.totalTransactions, 0);
});

suite.test('computeKPIs: claimRate calculates correctly', async () => {
  stubRepos();
  await transactionRepo.clear(); await complaintRepo.clear();

  await transactionRepo.create({ id: uid(), status: TransactionStatus.COMPLETED, createdAt: Date.now() });
  await transactionRepo.create({ id: uid(), status: TransactionStatus.COMPLETED, createdAt: Date.now() });
  await complaintRepo.create({ id: uid(), status: ComplaintStatus.OPEN, createdAt: Date.now() });

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assertEqual(kpis.claimRate.totalTransactions, 2);
  assertEqual(kpis.claimRate.totalComplaints, 1);
  assertEqual(kpis.claimRate.rate, 0.5);
});

suite.test('computeKPIs: avgHandlingTime is 0 when no resolved complaints', async () => {
  stubRepos();
  await complaintRepo.clear();

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assertEqual(kpis.avgHandlingTime.resolvedCount, 0);
  assertEqual(kpis.avgHandlingTime.averageMs, 0);
});

suite.test('computeKPIs: avgHandlingTime computed from resolved complaints', async () => {
  stubRepos();
  await complaintRepo.clear();

  const createdAt  = Date.now() - 4 * 60 * 60 * 1000; // 4 hours ago
  const resolvedAt = Date.now();
  await complaintRepo.create({
    id: uid(), status: ComplaintStatus.RESOLVED,
    createdAt, resolvedAt,
  });

  const kpis = await AnalyticsService.computeKPIs(adminSession());
  assertEqual(kpis.avgHandlingTime.resolvedCount, 1);
  assert(kpis.avgHandlingTime.averageMs > 0, 'averageMs > 0');
  assert(kpis.avgHandlingTime.averageHours > 0, 'averageHours > 0');
});

suite.test('computeTrends: listings metric returns array of buckets', async () => {
  stubRepos();
  await listingRepo.clear();
  await listingRepo.create({ id: uid(), status: ListingStatus.ACTIVE, createdAt: Date.now() - 1000 });

  const trends = await AnalyticsService.computeTrends(adminSession(), {
    metric: 'listings', periodDays: 30, bucketSize: 'day',
  });
  assert(Array.isArray(trends), 'returns array');
  assert(trends.length > 0, 'has at least one bucket');
  assert('date' in trends[0], 'bucket has date');
  assert('count' in trends[0], 'bucket has count');
});

suite.test('computeTrends: transactions metric returns array', async () => {
  stubRepos();
  await transactionRepo.clear();
  await transactionRepo.create({ id: uid(), status: TransactionStatus.COMPLETED, createdAt: Date.now() - 1000 });

  const trends = await AnalyticsService.computeTrends(adminSession(), {
    metric: 'transactions', periodDays: 7,
  });
  assert(Array.isArray(trends), 'returns array');
});

suite.test('computeTrends: complaints metric returns array', async () => {
  stubRepos();
  await complaintRepo.clear();
  await complaintRepo.create({ id: uid(), status: ComplaintStatus.OPEN, createdAt: Date.now() - 1000 });

  const trends = await AnalyticsService.computeTrends(adminSession(), {
    metric: 'complaints', periodDays: 7,
  });
  assert(Array.isArray(trends), 'returns array');
});

suite.test('computeTrends: unknown metric throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AnalyticsService.computeTrends(adminSession(), { metric: 'bogus' }),
    'ValidationError',
  );
});

suite.test('computeTrends: requires ANALYTICS_VIEW permission', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AnalyticsService.computeTrends(userSession(), { metric: 'listings' }),
    'AuthorizationError',
  );
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(() => AnalyticsService.computeKPIs(null), 'AuthenticationError');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
