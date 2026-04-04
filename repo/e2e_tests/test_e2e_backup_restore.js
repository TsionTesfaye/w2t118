/**
 * E2E: Backup / Restore Round-Trip
 *
 * Proves the complete export → reset → import → authenticate lifecycle:
 *
 *   1. Register a user with real PBKDF2-hashed credentials
 *   2. Create related app data (listing, category)
 *   3. Export a restorable snapshot (passphrase-encrypted)
 *   4. Wipe all stores
 *   5. Import the snapshot with the correct passphrase
 *   6. Verify the restored user can log in
 *   7. Verify related data was also restored
 *
 * Also covers the redacted-snapshot contract:
 *   - Redacted export → import → users NOT restored
 *   - Redacted export metadata is unambiguous
 *
 * And security edge cases:
 *   - Wrong passphrase → error, no partial restore
 *   - Missing passphrase on restorable → users skipped, no silent fallback
 *   - Restorable export never leaks credentials in the visible users array
 *
 * All service logic is REAL. Only the persistence layer uses InMemoryRepository.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../unit_tests/setup.js';
import { AuthService } from '../src/services/AuthService.js';
import { ExportImportService } from '../src/services/ExportImportService.js';
import { Roles } from '../src/domain/enums/roles.js';
import { createSession } from '../src/domain/policies/sessionPolicy.js';
import { AuditService } from '../src/services/AuditService.js';
import { LocalStorageAdapter } from '../src/repositories/localStorageAdapter.js';
import {
  _overrideLoginThrottleStorage,
  makeThrottleMemoryBackend,
} from '../src/utils/loginThrottleStorage.js';
import * as repos from '../src/repositories/index.js';

const suite = new TestRunner('E2E: Backup / Restore Round-Trip');

// ── Shared repo stubs ─────────────────────────────────────────────────────────
// Each repo gets a real InMemoryRepository so service logic works end-to-end.

const userRepo       = new InMemoryRepository();
const sessionRepo    = new InMemoryRepository();
const listingRepo    = new InMemoryRepository();
const listingVerRepo = new InMemoryRepository();
const transRepo      = new InMemoryRepository();
const threadRepo     = new InMemoryRepository();
const messageRepo    = new InMemoryRepository();
const addressRepo    = new InMemoryRepository();
const complaintRepo  = new InMemoryRepository();
const refundRepo     = new InMemoryRepository();
const reportRepo     = new InMemoryRepository();
const auditRepo      = new InMemoryRepository();
const notifRepo      = new InMemoryRepository();
const categoryRepo   = new InMemoryRepository();
const coverageRepo   = new InMemoryRepository();
const sensitiveRepo  = new InMemoryRepository();
const blockRepo      = new InMemoryRepository();
const commentRepo    = new InMemoryRepository();
const modCaseRepo    = new InMemoryRepository();
const deliveryRepo   = new InMemoryRepository();

function wireAllRepos() {
  // userRepository — AuthService needs getByUsername, getByIdOrFail, create, update
  repos.userRepository.getAll        = () => userRepo.getAll();
  repos.userRepository.getById       = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getByUsername = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.create        = (r) => userRepo.create(r);
  repos.userRepository.update        = (r) => userRepo.update(r);
  repos.userRepository.clear         = () => userRepo.clear();
  repos.userRepository.bulkPut       = (rs) => userRepo.bulkPut(rs);

  repos.sessionRepository.update = (r) => sessionRepo.update(r);
  repos.sessionRepository.delete = (id) => sessionRepo.delete(id);

  const wire = (repoRef, stub) => {
    repoRef.getAll  = () => stub.getAll();
    repoRef.clear   = () => stub.clear();
    repoRef.bulkPut = (rs) => stub.bulkPut(rs);
  };

  wire(repos.listingRepository, listingRepo);
  wire(repos.listingVersionRepository, listingVerRepo);
  wire(repos.transactionRepository, transRepo);
  wire(repos.threadRepository, threadRepo);
  wire(repos.messageRepository, messageRepo);
  wire(repos.addressRepository, addressRepo);
  wire(repos.complaintRepository, complaintRepo);
  wire(repos.refundRepository, refundRepo);
  wire(repos.reportRepository, reportRepo);
  wire(repos.notificationRepository, notifRepo);
  wire(repos.categoryRepository, categoryRepo);
  wire(repos.coverageZipRepository, coverageRepo);
  wire(repos.sensitiveWordRepository, sensitiveRepo);
  wire(repos.blockRepository, blockRepo);
  wire(repos.commentRepository, commentRepo);
  wire(repos.moderationCaseRepository, modCaseRepo);
  wire(repos.deliveryBookingRepository, deliveryRepo);

  repos.auditLogRepository.create     = (r) => auditRepo.create(r);
  repos.auditLogRepository.getAll     = () => auditRepo.getAll();
  repos.auditLogRepository.getByIndex = (i, v) => auditRepo.getByIndex(i, v);
  repos.auditLogRepository.clear      = () => auditRepo.clear();
  repos.auditLogRepository.bulkPut    = (rs) => auditRepo.bulkPut(rs);

  // Stubs for non-repo dependencies
  LocalStorageAdapter.get    = () => null;
  LocalStorageAdapter.set    = () => {};
  LocalStorageAdapter.remove = () => {};
  AuditService.log = async () => {};
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
}

async function clearAllRepos() {
  for (const r of [
    userRepo, sessionRepo, listingRepo, listingVerRepo, transRepo, threadRepo,
    messageRepo, addressRepo, complaintRepo, refundRepo, reportRepo, auditRepo,
    notifRepo, categoryRepo, coverageRepo, sensitiveRepo, blockRepo, commentRepo,
    modCaseRepo, deliveryRepo,
  ]) {
    await r.clear();
  }
}

function adminSession() {
  return createSession('admin-001', [Roles.ADMIN]);
}

const TEST_PASSWORD = 'SecurePass@Backup1!';
const PASSPHRASE = 'my-disaster-recovery-key';

// ═══════════════════════════════════════════════════════════════════════════════
//  1. FULL ROUND-TRIP: register → export → wipe → import → login
// ═══════════════════════════════════════════════════════════════════════════════

suite.test('round-trip: exported user can log in after restore', async () => {
  wireAllRepos();
  await clearAllRepos();

  // Step 1: Register a real user with PBKDF2-hashed password
  const registered = await AuthService.register({
    username: 'backup_user',
    password: TEST_PASSWORD,
    displayName: 'Backup User',
    securityQuestions: [
      { question: 'Pet?', answer: 'dog' },
      { question: 'City?', answer: 'paris' },
    ],
  });
  assert(registered.id, 'User must be registered');

  // Step 2: Seed some related data
  await categoryRepo.create({ id: 'cat-1', name: 'Electronics', parentId: null, sortOrder: 0, createdAt: Date.now(), updatedAt: Date.now() });
  await listingRepo.create({ id: 'lst-1', sellerId: registered.id, title: 'Phone', status: 'active', createdAt: Date.now(), updatedAt: Date.now() });

  // Step 3: Export restorable snapshot
  const session = adminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, PASSPHRASE);
  assert(snapshot._meta.mode === 'restorable', 'Must be restorable mode');
  assert(snapshot._encryptedUsers, 'Must have encrypted users bundle');

  // Step 4: Wipe everything (simulate disaster)
  await clearAllRepos();
  const usersAfterWipe = await userRepo.getAll();
  assertEqual(usersAfterWipe.length, 0, 'User store must be empty after wipe');

  // Step 5: Import with passphrase
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend()); // fresh throttle
  const importResult = await ExportImportService.importSnapshot(session, snapshot, { passphrase: PASSPHRASE });
  assert(importResult.success, 'Import must succeed');
  assert(importResult.usersRestored === true, 'Users must be restored');

  // Step 6: Verify login works with the original password
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend()); // fresh throttle for login
  const loginResult = await AuthService.login('backup_user', TEST_PASSWORD);
  assert(loginResult.session, 'Login must return a valid session');
  assertEqual(loginResult.user.username, 'backup_user', 'Logged-in user must be the restored user');
  assertEqual(loginResult.user.displayName, 'Backup User', 'displayName must survive round-trip');

  // Step 7: Verify related data was restored
  const cats = await categoryRepo.getAll();
  assert(cats.some(c => c.id === 'cat-1' && c.name === 'Electronics'), 'Category must be restored');
  const listings = await listingRepo.getAll();
  assert(listings.some(l => l.id === 'lst-1' && l.title === 'Phone'), 'Listing must be restored');
});

suite.test('round-trip: wrong password fails after restore (credentials are real)', async () => {
  wireAllRepos();
  await clearAllRepos();

  await AuthService.register({
    username: 'wrongpass_user',
    password: TEST_PASSWORD,
    displayName: 'Wrong Pass Test',
    securityQuestions: [
      { question: 'Pet?', answer: 'cat' },
      { question: 'City?', answer: 'rome' },
    ],
  });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, PASSPHRASE);

  await clearAllRepos();
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
  await ExportImportService.importSnapshot(session, snapshot, { passphrase: PASSPHRASE });

  // Correct password works
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
  const ok = await AuthService.login('wrongpass_user', TEST_PASSWORD);
  assert(ok.session, 'Correct password must succeed');

  // Wrong password fails
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
  const err = await assertThrowsAsync(
    () => AuthService.login('wrongpass_user', 'NotTheRightPassword!1'),
    'AuthenticationError',
  );
  assertEqual(err.message, 'Invalid username or password');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2. REDACTED SNAPSHOT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

suite.test('redacted export: mode and redacted flag are unambiguous', async () => {
  wireAllRepos();
  await clearAllRepos();
  await userRepo.create({ id: 'u-1', username: 'alice', passwordHash: 'h', salt: 's', roles: ['user'], createdAt: Date.now() });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRedactedSnapshot(session);

  assertEqual(snapshot._meta.mode, 'redacted', '_meta.mode must be "redacted"');
  assert(snapshot._meta.redacted === true, '_meta.redacted must be true');
  assert(!snapshot._encryptedUsers, 'Redacted snapshot must NOT contain _encryptedUsers');
});

suite.test('redacted export: credential fields are stripped', async () => {
  wireAllRepos();
  await clearAllRepos();
  await userRepo.create({
    id: 'u-2', username: 'bob', passwordHash: 'secret-hash', salt: 'secret-salt',
    roles: ['user'], securityQuestions: [{ question: 'Q?', answerHash: 'ah', answerSalt: 'as' }],
    createdAt: Date.now(),
  });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRedactedSnapshot(session);
  const user = snapshot.users.find(u => u.id === 'u-2');

  assert(!('passwordHash' in user), 'passwordHash must be stripped');
  assert(!('salt' in user), 'salt must be stripped');
  assert(user._credentialsRedacted === true, '_credentialsRedacted marker must be set');
  for (const sq of user.securityQuestions) {
    assert(!('answerHash' in sq), 'answerHash must be stripped');
    assert(!('answerSalt' in sq), 'answerSalt must be stripped');
    assert(sq.question, 'question text must be preserved');
  }
});

suite.test('redacted import: users store is skipped, live users survive', async () => {
  wireAllRepos();
  await clearAllRepos();
  await userRepo.create({ id: 'u-live', username: 'live', passwordHash: 'h', salt: 's', roles: ['user'], createdAt: Date.now() });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRedactedSnapshot(session);

  // Add a different user after export
  await userRepo.clear();
  await userRepo.create({ id: 'u-new', username: 'new-user', passwordHash: 'x', salt: 'y', roles: ['user'], createdAt: Date.now() });

  const result = await ExportImportService.importSnapshot(session, snapshot);
  assert(result.usersRestored === false, 'usersRestored must be false for redacted');

  const users = await userRepo.getAll();
  assert(users.some(u => u.id === 'u-new'), 'Live user must not be overwritten');
  assert(!users.some(u => u.id === 'u-live'), 'Exported redacted user must not be imported');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  3. CONTRACT SPLIT — modes are distinct and never silently mixed
// ═══════════════════════════════════════════════════════════════════════════════

suite.test('restorable snapshot without passphrase does NOT silently restore users', async () => {
  wireAllRepos();
  await clearAllRepos();

  await AuthService.register({
    username: 'no_silent_user',
    password: TEST_PASSWORD,
    displayName: 'No Silent Restore',
    securityQuestions: [
      { question: 'Q1?', answer: 'a1' },
      { question: 'Q2?', answer: 'a2' },
    ],
  });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, PASSPHRASE);

  await clearAllRepos();

  // Import WITHOUT passphrase — must not silently import the redacted visible users
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
  const result = await ExportImportService.importSnapshot(session, snapshot);
  assert(result.usersRestored === false, 'Without passphrase, usersRestored must be false');

  const users = await userRepo.getAll();
  assertEqual(users.length, 0, 'No users should be imported without passphrase');
});

suite.test('restorable snapshot with wrong passphrase throws, no partial import of users', async () => {
  wireAllRepos();
  await clearAllRepos();

  await AuthService.register({
    username: 'partial_test_user',
    password: TEST_PASSWORD,
    displayName: 'Partial Test',
    securityQuestions: [
      { question: 'Q?', answer: 'a' },
      { question: 'Q2?', answer: 'b' },
    ],
  });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, PASSPHRASE);

  await clearAllRepos();
  await userRepo.create({ id: 'u-pre-import', username: 'pre-import', passwordHash: 'h', salt: 's', roles: ['user'], createdAt: Date.now() });

  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
  await assertThrowsAsync(
    () => ExportImportService.importSnapshot(session, snapshot, { passphrase: 'wrong-key-1234!' }),
    null,
    'Decryption failed',
  );

  // Pre-import user must still be there (import must have failed before overwriting)
  const users = await userRepo.getAll();
  assert(users.some(u => u.id === 'u-pre-import'), 'Pre-import user must survive failed decrypt');
});

// ═══════════════════════════════════════════════════════════════════════════════
//  4. SECURITY EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

suite.test('restorable export: visible users array never contains credential material', async () => {
  wireAllRepos();
  await clearAllRepos();

  await AuthService.register({
    username: 'leak_check_user',
    password: TEST_PASSWORD,
    displayName: 'Leak Check',
    securityQuestions: [
      { question: 'Q?', answer: 'a' },
      { question: 'Q2?', answer: 'b' },
    ],
  });

  const session = adminSession();
  const snapshot = await ExportImportService.exportRestorableSnapshot(session, PASSPHRASE);

  for (const user of snapshot.users) {
    assert(!('passwordHash' in user), `passwordHash must not be in visible users array`);
    assert(!('salt' in user), `salt must not be in visible users array`);
    assert(user._credentialsRedacted === true, '_credentialsRedacted must be set');
    if (user.securityQuestions) {
      for (const sq of user.securityQuestions) {
        assert(!('answerHash' in sq), 'answerHash must not leak in visible array');
        assert(!('answerSalt' in sq), 'answerSalt must not leak in visible array');
      }
    }
  }
});

suite.test('restorable export: RBAC enforced — plain user rejected', async () => {
  wireAllRepos();
  const userSession = createSession('user-001', [Roles.USER]);
  await assertThrowsAsync(
    () => ExportImportService.exportRestorableSnapshot(userSession, PASSPHRASE),
    null,
    'Permission denied',
  );
});

suite.test('redacted export: RBAC enforced — plain user rejected', async () => {
  wireAllRepos();
  const userSession = createSession('user-001', [Roles.USER]);
  await assertThrowsAsync(
    () => ExportImportService.exportRedactedSnapshot(userSession),
    null,
    'Permission denied',
  );
});

// ── Run ──────────────────────────────────────────────────────────────────────

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
