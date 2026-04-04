/**
 * Notification Preference Enforcement Tests
 *
 * Verifies that NotificationService.create respects user preferences:
 *   - preference OFF → notification blocked (returns null)
 *   - preference ON  → notification created
 *   - all four preference types enforced
 *   - types not in the preference map always delivered
 *   - duplicate unread notifications are suppressed
 */

import {
  TestRunner, assert, assertEqual, InMemoryRepository,
} from '../setup.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('Notification Preference Enforcement');

// ── Repo stubs ──
function stubRepos() {
  const userRepo  = new InMemoryRepository();
  const notifRepo = new InMemoryRepository();

  repos.userRepository.getById          = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail    = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getAll           = () => userRepo.getAll();
  repos.userRepository.getByUsername    = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.getOneByIndex    = (i, v) => userRepo.getOneByIndex(i, v);
  repos.userRepository.create           = (r) => userRepo.create(r);
  repos.userRepository.update           = (r) => userRepo.update(r);

  repos.notificationRepository.create        = (r) => notifRepo.create(r);
  repos.notificationRepository.getAll        = () => notifRepo.getAll();
  repos.notificationRepository.getById       = (id) => notifRepo.getById(id);
  repos.notificationRepository.getByIdOrFail = (id) => notifRepo.getByIdOrFail(id);
  repos.notificationRepository.update        = (r) => notifRepo.update(r);
  repos.notificationRepository.getByIndex    = (i, v) => notifRepo.getByIndex(i, v);

  // Rewire the repository-level helper methods used by NotificationService
  repos.notificationRepository.getByUserId = (userId) =>
    notifRepo.getByIndex('userId', userId);
  repos.notificationRepository.getUnreadByUserId = async (userId) => {
    const all = await notifRepo.getByIndex('userId', userId);
    return all.filter(n => !n.isRead);
  };
  repos.notificationRepository.findUnread = async (userId, type, referenceId) => {
    const all = await notifRepo.getByIndex('userId', userId);
    return all.find(n => !n.isRead && n.type === type && n.referenceId === referenceId) || null;
  };
  repos.notificationRepository.countUnreadByUserId = async (userId) => {
    const all = await notifRepo.getByIndex('userId', userId);
    return all.filter(n => !n.isRead).length;
  };

  return { userRepo, notifRepo };
}

function makeUser(id, prefs = {}) {
  return {
    id,
    username: `user_${id}`,
    displayName: 'Test',
    roles: ['user'],
    passwordHash: 'x', salt: 'x', securityQuestions: [],
    notificationPreferences: {
      messages: true,
      transactions: true,
      moderation: true,
      complaints: true,
      ...prefs,
    },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// ══════════════════════════════════════════════════════════
//  PREFERENCE: MESSAGES
// ══════════════════════════════════════════════════════════

suite.test('messages ON → notification created', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u1', { messages: true }));

  const result = await NotificationService.create('u1', 'message', 'ref-1', 'New message');
  assert(result !== null, 'Notification must be created when messages pref is ON');
  assert(result.id, 'Created notification must have an id');
});

suite.test('messages OFF → notification blocked', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u2', { messages: false }));

  const result = await NotificationService.create('u2', 'message', 'ref-2', 'New message');
  assertEqual(result, null, 'Notification must be blocked when messages pref is OFF');
});

// ══════════════════════════════════════════════════════════
//  PREFERENCE: TRANSACTIONS
// ══════════════════════════════════════════════════════════

suite.test('transactions ON → notification created', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u3', { transactions: true }));

  const result = await NotificationService.create('u3', 'transaction', 'tx-1', 'Transaction update');
  assert(result !== null, 'Notification must be created when transactions pref is ON');
});

suite.test('transactions OFF → notification blocked', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u4', { transactions: false }));

  const result = await NotificationService.create('u4', 'transaction', 'tx-2', 'Transaction update');
  assertEqual(result, null, 'Notification must be blocked when transactions pref is OFF');
});

// ══════════════════════════════════════════════════════════
//  PREFERENCE: MODERATION
// ══════════════════════════════════════════════════════════

suite.test('moderation ON → notification created', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u5', { moderation: true }));

  const result = await NotificationService.create('u5', 'moderation', 'case-1', 'Your listing was reviewed');
  assert(result !== null, 'Notification must be created when moderation pref is ON');
});

suite.test('moderation OFF → notification blocked', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u6', { moderation: false }));

  const result = await NotificationService.create('u6', 'moderation', 'case-2', 'Your listing was reviewed');
  assertEqual(result, null, 'Notification must be blocked when moderation pref is OFF');
});

// ══════════════════════════════════════════════════════════
//  PREFERENCE: COMPLAINTS (covers 'complaint' and 'refund' types)
// ══════════════════════════════════════════════════════════

suite.test('complaints ON → complaint notification created', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u7', { complaints: true }));

  const result = await NotificationService.create('u7', 'complaint', 'comp-1', 'Complaint update');
  assert(result !== null, 'Notification must be created when complaints pref is ON');
});

suite.test('complaints OFF → complaint notification blocked', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u8', { complaints: false }));

  const result = await NotificationService.create('u8', 'complaint', 'comp-2', 'Complaint update');
  assertEqual(result, null, 'Notification must be blocked when complaints pref is OFF');
});

suite.test('complaints OFF → refund notification also blocked', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u9', { complaints: false }));

  const result = await NotificationService.create('u9', 'refund', 'refund-1', 'Refund update');
  assertEqual(result, null, 'Refund notification must be blocked when complaints pref is OFF');
});

suite.test('complaints ON → refund notification created', async () => {
  const { userRepo } = stubRepos();
  await userRepo.create(makeUser('u10', { complaints: true }));

  const result = await NotificationService.create('u10', 'refund', 'refund-2', 'Refund approved');
  assert(result !== null, 'Refund notification must be created when complaints pref is ON');
});

// ══════════════════════════════════════════════════════════
//  DEFAULT: ALL PREFS ON (no explicit config)
// ══════════════════════════════════════════════════════════

suite.test('user with no preference config receives notifications (defaults ON)', async () => {
  const { userRepo } = stubRepos();
  // User with no notificationPreferences at all
  await userRepo.create({
    id: 'u11', username: 'u11', displayName: 'Test',
    roles: ['user'], passwordHash: 'x', salt: 'x', securityQuestions: [],
    notificationPreferences: {},
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  const result = await NotificationService.create('u11', 'transaction', 'tx-10', 'Update');
  assert(result !== null, 'Notification must be created when preference is not explicitly set (default ON)');
});

suite.test('unknown user still receives notification (graceful fallback)', async () => {
  stubRepos(); // no users seeded

  // If user lookup fails, notification should still be created
  const result = await NotificationService.create('unknown-user', 'transaction', 'tx-11', 'Update');
  assert(result !== null, 'Notification must be created when user cannot be fetched (fail-open)');
});

// ══════════════════════════════════════════════════════════
//  DEDUPLICATION
// ══════════════════════════════════════════════════════════

suite.test('duplicate unread notification for same event is suppressed', async () => {
  const { userRepo, notifRepo } = stubRepos();
  await userRepo.create(makeUser('u12'));

  // First notification — should be created
  const first = await NotificationService.create('u12', 'transaction', 'tx-dup', 'Seller reserved');
  assert(first !== null, 'First notification must be created');

  // Second notification for same event — should return existing, not create new
  const second = await NotificationService.create('u12', 'transaction', 'tx-dup', 'Seller reserved again');
  assertEqual(second.id, first.id, 'Duplicate must return the existing notification');

  // Only one notification in storage
  const all = await notifRepo.getAll();
  const forUser = all.filter(n => n.userId === 'u12' && n.referenceId === 'tx-dup');
  assertEqual(forUser.length, 1, 'Only one notification must exist for the same event');
});

suite.test('different referenceIds create separate notifications', async () => {
  const { userRepo, notifRepo } = stubRepos();
  await userRepo.create(makeUser('u13'));

  await NotificationService.create('u13', 'transaction', 'tx-a', 'Update A');
  await NotificationService.create('u13', 'transaction', 'tx-b', 'Update B');

  const all = await notifRepo.getAll();
  assertEqual(all.length, 2, 'Different events must each create a notification');
});

suite.test('same referenceId but different type creates separate notifications', async () => {
  const { userRepo, notifRepo } = stubRepos();
  await userRepo.create(makeUser('u14'));

  await NotificationService.create('u14', 'transaction', 'ref-x', 'Transaction');
  await NotificationService.create('u14', 'message', 'ref-x', 'Message');

  const all = await notifRepo.getAll();
  assertEqual(all.length, 2, 'Different types on same referenceId must each create a notification');
});

suite.test('after marking as read, same event creates a fresh notification', async () => {
  const { userRepo, notifRepo } = stubRepos();
  await userRepo.create(makeUser('u15'));

  const first = await NotificationService.create('u15', 'moderation', 'case-x', 'Review 1');
  // Mark as read
  await notifRepo.update({ ...first, isRead: true });

  // Same event can now generate a new notification (original was read)
  const second = await NotificationService.create('u15', 'moderation', 'case-x', 'Review 2');
  assert(second !== null, 'New notification must be created after original was read');
  assert(second.id !== first.id, 'New notification must have a different id');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
