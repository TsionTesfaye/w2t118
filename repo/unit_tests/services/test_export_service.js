/**
 * ExportImportService — Unit Tests
 *
 * Covers:
 *   - exportRedactedSnapshot: all stores present; credential fields redacted; _meta.mode = "redacted"
 *   - exportRestorableSnapshot: encrypted user bundle present; visible users redacted; _meta.mode = "restorable"
 *   - exportFullSnapshot: backward-compat alias delegates to exportRedactedSnapshot
 *   - exportFiltered: credential fields redacted when users store selected
 *   - exportReports / exportReportsCSV: filter by status, targetType, dateFrom/dateTo
 *   - importSnapshot: redacted → users skipped; restorable + passphrase → users restored;
 *     restorable without passphrase → users skipped; wrong passphrase → error
 *   - RBAC: ADMIN_EXPORT, REPORT_EXPORT, ANALYTICS_EXPORT, ADMIN_IMPORT
 *
 * For round-trip register → export → wipe → import → login tests, see:
 *   e2e_tests/test_e2e_backup_restore.js
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { ExportImportService } from '../../src/services/ExportImportService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { Permissions } from '../../src/domain/enums/permissions.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('ExportImportService');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAdminSession() {
  return createSession('admin-001', [Roles.ADMIN]);
}

function makeUserSession() {
  return createSession('user-001', [Roles.USER]);
}

let _id = 1;
function uid() { return `id-${_id++}`; }

function makeUser(overrides = {}) {
  return {
    id: uid(),
    username: 'testuser',
    displayName: 'Test User',
    passwordHash: 'HASH_VALUE_SHOULD_NOT_APPEAR_IN_EXPORT',
    salt: 'SALT_VALUE_SHOULD_NOT_APPEAR_IN_EXPORT',
    roles: ['user'],
    securityQuestions: [
      { question: 'Pet name?', answerHash: 'AH1_SHOULD_NOT_APPEAR', answerSalt: 'AS1_SHOULD_NOT_APPEAR' },
      { question: 'City born?', answerHash: 'AH2_SHOULD_NOT_APPEAR', answerSalt: 'AS2_SHOULD_NOT_APPEAR' },
    ],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeReport(overrides = {}) {
  return {
    id: uid(),
    reporterId: 'user-001',
    targetId: uid(),
    targetType: 'listing',
    reason: 'spam',
    status: 'open',
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Repo stubs ────────────────────────────────────────────────────────────────

const reportRepoStub     = new InMemoryRepository();
const auditRepoStub      = new InMemoryRepository();
const userRepoStub       = new InMemoryRepository();
const listingRepoStub    = new InMemoryRepository();
const categoryRepoStub   = new InMemoryRepository();
const notifRepoStub      = new InMemoryRepository();
const transRepoStub      = new InMemoryRepository();
const threadRepoStub     = new InMemoryRepository();
const messageRepoStub    = new InMemoryRepository();
const addressRepoStub    = new InMemoryRepository();
const complaintRepoStub  = new InMemoryRepository();
const refundRepoStub     = new InMemoryRepository();
const coverageRepoStub   = new InMemoryRepository();
const sensitiveRepoStub  = new InMemoryRepository();
const blockRepoStub      = new InMemoryRepository();
const commentRepoStub    = new InMemoryRepository();
const modCaseRepoStub    = new InMemoryRepository();
const deliveryRepoStub   = new InMemoryRepository();
const listingVerRepoStub = new InMemoryRepository();

function stubAllRepos() {
  repos.reportRepository.getAll        = () => reportRepoStub.getAll();
  repos.reportRepository.create        = (r) => reportRepoStub.create(r);
  repos.reportRepository.getById       = (id) => reportRepoStub.getById(id);
  repos.reportRepository.update        = (r) => reportRepoStub.update(r);
  repos.reportRepository.clear         = () => reportRepoStub.clear();
  repos.reportRepository.bulkPut       = (rs) => reportRepoStub.bulkPut(rs);

  repos.auditLogRepository.create      = (r) => auditRepoStub.create(r);
  repos.auditLogRepository.getAll      = () => auditRepoStub.getAll();
  repos.auditLogRepository.getByIndex  = (i, v) => auditRepoStub.getByIndex(i, v);
  repos.auditLogRepository.clear       = () => auditRepoStub.clear();
  repos.auditLogRepository.bulkPut     = (rs) => auditRepoStub.bulkPut(rs);

  repos.userRepository.getAll          = () => userRepoStub.getAll();
  repos.userRepository.clear           = () => userRepoStub.clear();
  repos.userRepository.bulkPut         = (rs) => userRepoStub.bulkPut(rs);

  repos.listingRepository.getAll       = () => listingRepoStub.getAll();
  repos.listingRepository.clear        = () => listingRepoStub.clear();
  repos.listingRepository.bulkPut      = (rs) => listingRepoStub.bulkPut(rs);

  repos.categoryRepository.getAll      = () => categoryRepoStub.getAll();
  repos.categoryRepository.clear       = () => categoryRepoStub.clear();
  repos.categoryRepository.bulkPut     = (rs) => categoryRepoStub.bulkPut(rs);

  repos.notificationRepository.getAll  = () => notifRepoStub.getAll();
  repos.notificationRepository.clear   = () => notifRepoStub.clear();
  repos.notificationRepository.bulkPut = (rs) => notifRepoStub.bulkPut(rs);

  repos.transactionRepository.getAll   = () => transRepoStub.getAll();
  repos.transactionRepository.clear    = () => transRepoStub.clear();
  repos.transactionRepository.bulkPut  = (rs) => transRepoStub.bulkPut(rs);

  repos.threadRepository.getAll        = () => threadRepoStub.getAll();
  repos.threadRepository.clear         = () => threadRepoStub.clear();
  repos.threadRepository.bulkPut       = (rs) => threadRepoStub.bulkPut(rs);

  repos.messageRepository.getAll       = () => messageRepoStub.getAll();
  repos.messageRepository.clear        = () => messageRepoStub.clear();
  repos.messageRepository.bulkPut      = (rs) => messageRepoStub.bulkPut(rs);

  repos.addressRepository.getAll       = () => addressRepoStub.getAll();
  repos.addressRepository.clear        = () => addressRepoStub.clear();
  repos.addressRepository.bulkPut      = (rs) => addressRepoStub.bulkPut(rs);

  repos.complaintRepository.getAll     = () => complaintRepoStub.getAll();
  repos.complaintRepository.clear      = () => complaintRepoStub.clear();
  repos.complaintRepository.bulkPut    = (rs) => complaintRepoStub.bulkPut(rs);

  repos.refundRepository.getAll        = () => refundRepoStub.getAll();
  repos.refundRepository.clear         = () => refundRepoStub.clear();
  repos.refundRepository.bulkPut       = (rs) => refundRepoStub.bulkPut(rs);

  repos.coverageZipRepository.getAll   = () => coverageRepoStub.getAll();
  repos.coverageZipRepository.clear    = () => coverageRepoStub.clear();
  repos.coverageZipRepository.bulkPut  = (rs) => coverageRepoStub.bulkPut(rs);

  repos.sensitiveWordRepository.getAll = () => sensitiveRepoStub.getAll();
  repos.sensitiveWordRepository.clear  = () => sensitiveRepoStub.clear();
  repos.sensitiveWordRepository.bulkPut = (rs) => sensitiveRepoStub.bulkPut(rs);

  repos.blockRepository.getAll         = () => blockRepoStub.getAll();
  repos.blockRepository.clear          = () => blockRepoStub.clear();
  repos.blockRepository.bulkPut        = (rs) => blockRepoStub.bulkPut(rs);

  repos.commentRepository.getAll       = () => commentRepoStub.getAll();
  repos.commentRepository.clear        = () => commentRepoStub.clear();
  repos.commentRepository.bulkPut      = (rs) => commentRepoStub.bulkPut(rs);

  repos.moderationCaseRepository.getAll = () => modCaseRepoStub.getAll();
  repos.moderationCaseRepository.clear  = () => modCaseRepoStub.clear();
  repos.moderationCaseRepository.bulkPut = (rs) => modCaseRepoStub.bulkPut(rs);

  repos.deliveryBookingRepository.getAll = () => deliveryRepoStub.getAll();
  repos.deliveryBookingRepository.clear  = () => deliveryRepoStub.clear();
  repos.deliveryBookingRepository.bulkPut = (rs) => deliveryRepoStub.bulkPut(rs);

  repos.listingVersionRepository.getAll = () => listingVerRepoStub.getAll();
  repos.listingVersionRepository.clear  = () => listingVerRepoStub.clear();
  repos.listingVersionRepository.bulkPut = (rs) => listingVerRepoStub.bulkPut(rs);
}

stubAllRepos();

// ── exportRedactedSnapshot (via backward-compat alias exportFullSnapshot) ────

suite.test('exportRedactedSnapshot (via alias): result contains all expected store keys', async () => {
  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  const expectedStores = [
    'users', 'listings', 'listingVersions', 'transactions', 'threads', 'messages',
    'addresses', 'complaints', 'refunds', 'reports', 'auditLogs', 'notifications',
    'categories', 'coverageZips', 'sensitiveWords', 'blocks', 'comments',
    'moderationCases', 'deliveryBookings',
  ];
  for (const store of expectedStores) {
    assert(Object.prototype.hasOwnProperty.call(result, store), `Missing store: ${store}`);
  }
  assert(result._meta, 'Missing _meta');
  assertEqual(result._meta.version, 1);
});

suite.test('exportRedactedSnapshot (via alias): requires ADMIN_EXPORT (plain user is rejected)', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportFullSnapshot(makeUserSession()),
    null,
    'Permission denied',
  );
});

// ── Redacted snapshot — credential redaction safety ──────────────────────────

suite.test('redacted snapshot: passwordHash is NOT present in exported users', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-safe-1' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  for (const user of result.users) {
    assert(!Object.prototype.hasOwnProperty.call(user, 'passwordHash'),
      `passwordHash must be redacted, found on user ${user.id}`);
  }
});

suite.test('redacted snapshot: salt is NOT present in exported users', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-safe-2' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  for (const user of result.users) {
    assert(!Object.prototype.hasOwnProperty.call(user, 'salt'),
      `salt must be redacted, found on user ${user.id}`);
  }
});

suite.test('redacted snapshot: answerHash and answerSalt NOT in security questions', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-safe-3' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  for (const user of result.users) {
    if (Array.isArray(user.securityQuestions)) {
      for (const sq of user.securityQuestions) {
        assert(!Object.prototype.hasOwnProperty.call(sq, 'answerHash'),
          'answerHash must be redacted from securityQuestions');
        assert(!Object.prototype.hasOwnProperty.call(sq, 'answerSalt'),
          'answerSalt must be redacted from securityQuestions');
      }
    }
  }
});

suite.test('redacted snapshot: non-sensitive user fields are preserved', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-safe-4', username: 'alice', displayName: 'Alice' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  const exported = result.users.find(u => u.id === 'u-safe-4');
  assert(exported, 'User must be present in export');
  assertEqual(exported.username, 'alice', 'username must be preserved');
  assertEqual(exported.displayName, 'Alice', 'displayName must be preserved');
  assert(Array.isArray(exported.roles), 'roles must be preserved');
  assert(exported._credentialsRedacted === true, '_credentialsRedacted marker must be set');
});

suite.test('redacted snapshot: security question text is preserved after redaction', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-safe-5' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);

  const exported = result.users.find(u => u.id === 'u-safe-5');
  assert(exported, 'User must be present');
  assert(Array.isArray(exported.securityQuestions), 'securityQuestions array must exist');
  assert(exported.securityQuestions.every(sq => typeof sq.question === 'string' && sq.question.length > 0),
    'security question text must be preserved');
});

suite.test('redacted snapshot: _meta.redacted is true', async () => {
  const session = makeAdminSession();
  const result = await ExportImportService.exportFullSnapshot(session);
  assert(result._meta.redacted === true, '_meta.redacted must be true');
});

suite.test('exportFiltered with users: credential fields are redacted', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-filtered-1' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportFiltered(session, ['users']);

  for (const user of result.users) {
    assert(!Object.prototype.hasOwnProperty.call(user, 'passwordHash'),
      'passwordHash must be redacted in filtered export');
    assert(!Object.prototype.hasOwnProperty.call(user, 'salt'),
      'salt must be redacted in filtered export');
  }
  assert(result._meta.redacted === true, '_meta.redacted must be true when users included');
});

suite.test('exportFiltered without users: _meta.redacted not set', async () => {
  const session = makeAdminSession();
  const result = await ExportImportService.exportFiltered(session, ['categories']);
  assert(!result._meta.redacted, '_meta.redacted must not be set when users not included');
});

suite.test('importSnapshot with redacted snapshot: users store is skipped', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-live', username: 'live-user' }));

  const session = makeAdminSession();
  const redactedSnapshot = {
    _meta: { version: 1, exportedAt: Date.now(), exportedBy: 'admin', redacted: true },
    users: [{ id: 'u-imported', username: 'should-not-appear', _credentialsRedacted: true }],
  };

  await ExportImportService.importSnapshot(session, redactedSnapshot);

  // Live user must still be in DB — redacted users must not overwrite
  const allUsers = await userRepoStub.getAll();
  assert(allUsers.some(u => u.id === 'u-live'), 'Live user must not be overwritten by redacted import');
  assert(!allUsers.some(u => u.id === 'u-imported'), 'Redacted user must not be imported');
});

// ── exportReports (filter logic) ─────────────────────────────────────────────

suite.test('exportReports: returns all reports when no filters given', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ status: 'open' }));
  await reportRepoStub.create(makeReport({ status: 'resolved' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportReports(session, {});
  assertEqual(result.reports.length, 2, 'Should return both reports');
  assert(result._meta.totalRecords === 2);
});

suite.test('exportReports: filters by status', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ status: 'open' }));
  await reportRepoStub.create(makeReport({ status: 'resolved' }));
  await reportRepoStub.create(makeReport({ status: 'resolved' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportReports(session, { status: 'resolved' });
  assertEqual(result.reports.length, 2, 'Should return 2 resolved reports');
  assert(result.reports.every(r => r.status === 'resolved'), 'All should be resolved');
});

suite.test('exportReports: filters by targetType', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ targetType: 'listing' }));
  await reportRepoStub.create(makeReport({ targetType: 'user' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportReports(session, { targetType: 'user' });
  assertEqual(result.reports.length, 1);
  assertEqual(result.reports[0].targetType, 'user');
});

suite.test('exportReports: filters by dateFrom excludes older records', async () => {
  await reportRepoStub.clear();
  const old = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago
  const recent = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago

  await reportRepoStub.create(makeReport({ createdAt: old }));
  await reportRepoStub.create(makeReport({ createdAt: recent }));

  const session = makeAdminSession();
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const result = await ExportImportService.exportReports(session, { dateFrom: cutoff });
  assertEqual(result.reports.length, 1, 'Only recent report should be included');
});

suite.test('exportReports: filters by dateTo excludes newer records', async () => {
  await reportRepoStub.clear();
  const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const future = Date.now() + 2 * 24 * 60 * 60 * 1000;

  await reportRepoStub.create(makeReport({ createdAt: old }));
  await reportRepoStub.create(makeReport({ createdAt: future }));

  const session = makeAdminSession();
  const cutoff = new Date(Date.now()).toISOString().split('T')[0]; // today
  const result = await ExportImportService.exportReports(session, { dateTo: cutoff });
  assertEqual(result.reports.length, 1, 'Only past report should be included');
});

suite.test('exportReports: requires REPORT_EXPORT — plain user rejected', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportReports(makeUserSession(), {}),
    null,
    'Permission denied',
  );
});

suite.test('exportReports: admin (who has REPORT_EXPORT) can export', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport());

  const session = makeAdminSession();
  const result = await ExportImportService.exportReports(session, {});
  assert(result.reports.length >= 1, 'Admin should be able to export reports');
});

// ── exportReportsCSV ──────────────────────────────────────────────────────────

suite.test('exportReportsCSV: returns a non-empty string for populated store', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ status: 'open', targetType: 'listing', reason: 'spam' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, {});
  assert(typeof csv === 'string', 'exportReportsCSV must return a string');
  assert(csv.length > 0, 'CSV must not be empty when records exist');
});

suite.test('exportReportsCSV: first line is a header row', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ id: 'r-header-test' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, {});
  const firstLine = csv.split('\n')[0];
  // Header should contain known field names from the report object
  assert(firstLine.includes('id'), `Header missing "id": ${firstLine}`);
  assert(firstLine.includes('status'), `Header missing "status": ${firstLine}`);
  assert(firstLine.includes('createdAt'), `Header missing "createdAt": ${firstLine}`);
});

suite.test('exportReportsCSV: data rows contain expected values', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ id: 'r-csv-001', status: 'resolved', reason: 'fraud' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, {});
  assert(csv.includes('r-csv-001'), 'CSV must contain the report id');
  assert(csv.includes('resolved'), 'CSV must contain the status value');
  assert(csv.includes('fraud'), 'CSV must contain the reason value');
});

suite.test('exportReportsCSV: filters by status — only matching rows exported', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ id: 'r-open', status: 'open' }));
  await reportRepoStub.create(makeReport({ id: 'r-resolved', status: 'resolved' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, { status: 'resolved' });
  assert(csv.includes('r-resolved'), 'Resolved report must appear in CSV');
  assert(!csv.includes('r-open'), 'Open report must NOT appear in filtered CSV');
});

suite.test('exportReportsCSV: filters by targetType — only matching rows exported', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ id: 'r-listing', targetType: 'listing' }));
  await reportRepoStub.create(makeReport({ id: 'r-user', targetType: 'user' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, { targetType: 'user' });
  assert(csv.includes('r-user'), 'User-target report must appear in CSV');
  assert(!csv.includes('r-listing'), 'Listing-target report must NOT appear in filtered CSV');
});

suite.test('exportReportsCSV: filters by reason — only matching rows exported', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ id: 'r-spam', reason: 'spam' }));
  await reportRepoStub.create(makeReport({ id: 'r-fraud', reason: 'fraud' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, { reason: 'spam' });
  assert(csv.includes('r-spam'), 'Spam report must appear in CSV');
  assert(!csv.includes('r-fraud'), 'Fraud report must NOT appear in filtered CSV');
});

suite.test('exportReportsCSV: filters by dateFrom — older records excluded', async () => {
  await reportRepoStub.clear();
  const old = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const recent = Date.now() - 1 * 24 * 60 * 60 * 1000;
  await reportRepoStub.create(makeReport({ id: 'r-old', createdAt: old }));
  await reportRepoStub.create(makeReport({ id: 'r-recent', createdAt: recent }));

  const session = makeAdminSession();
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const csv = await ExportImportService.exportReportsCSV(session, { dateFrom: cutoff });
  assert(csv.includes('r-recent'), 'Recent report must appear in CSV');
  assert(!csv.includes('r-old'), 'Old report must NOT appear in date-filtered CSV');
});

suite.test('exportReportsCSV: returns empty string when no records match filter', async () => {
  await reportRepoStub.clear();
  await reportRepoStub.create(makeReport({ status: 'open' }));

  const session = makeAdminSession();
  const csv = await ExportImportService.exportReportsCSV(session, { status: 'dismissed' });
  assertEqual(csv, '', 'Empty CSV expected when no records match');
});

suite.test('exportReportsCSV: requires REPORT_EXPORT — plain user rejected', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportReportsCSV(makeUserSession(), {}),
    null,
    'Permission denied',
  );
});

// ── exportAnalytics RBAC ──────────────────────────────────────────────────────

suite.test('exportAnalytics: requires ANALYTICS_EXPORT — plain user rejected', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportAnalytics(makeUserSession()),
    null,
    'Permission denied',
  );
});

// ── importSnapshot ────────────────────────────────────────────────────────────

suite.test('importSnapshot: overwrites allowed stores from snapshot', async () => {
  const session = makeAdminSession();

  // Seed a user in the stub
  await userRepoStub.clear();
  const originalUser = { id: 'u-original', username: 'original', passwordHash: 'x', roles: ['user'], createdAt: 0 };
  await userRepoStub.create(originalUser);

  const snapshot = {
    _meta: { version: 1, exportedAt: Date.now(), exportedBy: 'admin' },
    users: [{ id: 'u-imported', username: 'imported', passwordHash: 'y', roles: ['user'], createdAt: 0 }],
  };

  const result = await ExportImportService.importSnapshot(session, snapshot);
  assert(result.success, 'Import should succeed');
  assert(result.importedStores.includes('users'), 'users store should be listed');

  const allUsers = await userRepoStub.getAll();
  assertEqual(allUsers.length, 1, 'Original user should be replaced');
  assertEqual(allUsers[0].id, 'u-imported', 'Imported user should be present');
});

suite.test('importSnapshot: auditLogs are NOT overwritten (protected store)', async () => {
  const session = makeAdminSession();

  await auditRepoStub.clear();
  const existingLog = { id: 'log-001', action: 'LOGIN', userId: 'admin', createdAt: Date.now() };
  await auditRepoStub.create(existingLog);

  const snapshot = {
    _meta: { version: 1, exportedAt: Date.now(), exportedBy: 'admin' },
    auditLogs: [{ id: 'log-injected', action: 'FAKE', userId: 'attacker', createdAt: 0 }],
    users: [],
  };

  await ExportImportService.importSnapshot(session, snapshot);

  const logs = await auditRepoStub.getAll();
  // auditLogs should NOT have been cleared — original log must survive
  // (import adds an audit entry, so there may be 2 entries, but log-001 must be there)
  assert(logs.some(l => l.id === 'log-001'), 'Original audit log must not be overwritten');
  assert(!logs.some(l => l.id === 'log-injected'), 'Injected audit log must be rejected');
});

suite.test('importSnapshot: rejects invalid snapshot (missing _meta)', async () => {
  await assertThrowsAsync(
    () => ExportImportService.importSnapshot(makeAdminSession(), { users: [] }),
    null,
    '_meta',
  );
});

suite.test('importSnapshot: rejects unsupported version', async () => {
  await assertThrowsAsync(
    () => ExportImportService.importSnapshot(makeAdminSession(), {
      _meta: { version: 99, exportedAt: Date.now(), exportedBy: 'admin' },
    }),
    null,
    'version',
  );
});

suite.test('importSnapshot: requires ADMIN_IMPORT — plain user rejected', async () => {
  await assertThrowsAsync(
    () => ExportImportService.importSnapshot(makeUserSession(), {
      _meta: { version: 1, exportedAt: Date.now(), exportedBy: 'admin' },
    }),
    null,
    'Permission denied',
  );
});

// ── exportRedactedSnapshot (explicit name) ───────────────────────────────────

suite.test('exportRedactedSnapshot: _meta.mode is "redacted"', async () => {
  const session = makeAdminSession();
  const result = await ExportImportService.exportRedactedSnapshot(session);
  assertEqual(result._meta.mode, 'redacted');
  assert(result._meta.redacted === true);
});

// ── exportRestorableSnapshot ─────────────────────────────────────────────────

suite.test('exportRestorableSnapshot: rejects passphrase shorter than 8 chars', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportRestorableSnapshot(makeAdminSession(), 'short'),
    null,
    'Passphrase must be at least 8 characters',
  );
});

suite.test('exportRestorableSnapshot: _meta.mode is "restorable" and redacted is false', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-restorable-1' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportRestorableSnapshot(session, 'test-passphrase-123');
  assertEqual(result._meta.mode, 'restorable');
  assert(result._meta.redacted === false, '_meta.redacted must be false for restorable');
  assert(result._encryptedUsers, '_encryptedUsers bundle must be present');
  assert(result._encryptedUsers.ciphertext, 'bundle must have ciphertext');
  assert(result._encryptedUsers.iv, 'bundle must have iv');
  assert(result._encryptedUsers.salt, 'bundle must have salt');
});

suite.test('exportRestorableSnapshot: visible users array is still redacted', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-restorable-2' }));

  const session = makeAdminSession();
  const result = await ExportImportService.exportRestorableSnapshot(session, 'test-passphrase-123');

  for (const user of result.users) {
    assert(!Object.prototype.hasOwnProperty.call(user, 'passwordHash'),
      'Visible users must still be redacted');
    assert(user._credentialsRedacted === true);
  }
});

suite.test('exportRestorableSnapshot: requires ADMIN_EXPORT (plain user rejected)', async () => {
  await assertThrowsAsync(
    () => ExportImportService.exportRestorableSnapshot(makeUserSession(), 'test-passphrase-123'),
    null,
    'Permission denied',
  );
});

// ── importSnapshot with restorable snapshot ──────────────────────────────────

suite.test('import restorable snapshot with passphrase: users restored', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-live-before', username: 'live-before' }));

  const session = makeAdminSession();
  const passphrase = 'secure-backup-pass!';

  // Export a restorable snapshot
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, passphrase);

  // Clear the user store and add a different user to prove overwrite
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-other', username: 'other-user' }));

  // Import with passphrase
  const result = await ExportImportService.importSnapshot(session, snapshot, { passphrase });
  assert(result.success);
  assert(result.usersRestored === true, 'usersRestored must be true');

  const allUsers = await userRepoStub.getAll();
  assert(allUsers.some(u => u.id === 'u-live-before'), 'Original exported user must be restored');
  assert(!allUsers.some(u => u.id === 'u-other'), 'Pre-import user must be replaced');
  // Verify credential fields are present (not redacted)
  const restored = allUsers.find(u => u.id === 'u-live-before');
  assert(restored.passwordHash, 'passwordHash must be restored');
  assert(restored.salt, 'salt must be restored');
});

suite.test('import restorable snapshot without passphrase: users skipped', async () => {
  await userRepoStub.clear();
  const liveUser = makeUser({ id: 'u-keep-live', username: 'keep-live' });
  await userRepoStub.create(liveUser);

  const session = makeAdminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, 'my-backup-pass!');

  // Import WITHOUT passphrase
  const result = await ExportImportService.importSnapshot(session, snapshot);
  assert(result.usersRestored === false, 'usersRestored must be false without passphrase');

  // Live user should not be overwritten by the redacted users array
  const allUsers = await userRepoStub.getAll();
  assert(allUsers.some(u => u.id === 'u-keep-live'), 'Live user must survive when no passphrase');
});

suite.test('import restorable snapshot with wrong passphrase: throws error', async () => {
  await userRepoStub.clear();
  await userRepoStub.create(makeUser({ id: 'u-enc-test' }));

  const session = makeAdminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, 'correct-passphrase!');

  await assertThrowsAsync(
    () => ExportImportService.importSnapshot(session, snapshot, { passphrase: 'wrong-passphrase!' }),
    null,
    'Decryption failed',
  );
});

// ── Run ───────────────────────────────────────────────────────────────────────

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
