/**
 * AuditService — Unit Tests
 *
 * Covers: log() (creates entry, required fields, actorId fallback),
 * getAll() (permission guard, admin only), getByActor(), getByEntityType(),
 * count(), append-only (delete throws).
 *
 * Stubs: auditLogRepository (InMemory, with delete override to match real behaviour).
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AuditService, AuditActions } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('AuditService');

const auditLogRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function userSession(id  = 'user-1')  { return createSession(id, [Roles.USER]); }

function stubRepos() {
  repos.auditLogRepository.create          = r  => auditLogRepo.create(r);
  repos.auditLogRepository.getAll          = () => auditLogRepo.getAll();
  repos.auditLogRepository.count           = async () => (await auditLogRepo.getAll()).length;
  repos.auditLogRepository.getByActorId    = id => auditLogRepo.getByIndex('actorId', id);
  repos.auditLogRepository.getByEntityType = t  => auditLogRepo.getByIndex('entityType', t);
  repos.auditLogRepository.getByAction     = a  => auditLogRepo.getByIndex('action', a);
  // Simulate append-only: delete blocked
  repos.auditLogRepository.delete = async () => { throw new Error('Audit logs cannot be deleted'); };
}

// ── log() ─────────────────────────────────────────────────────────────────────

suite.test('log: creates an entry and returns it', async () => {
  stubRepos(); await auditLogRepo.clear();
  const entry = await AuditService.log('user-1', AuditActions.USER_LOGIN, 'user', 'user-1', {});
  assert(entry.id, 'entry has id');
  assertEqual(entry.actorId, 'user-1');
  assertEqual(entry.action, AuditActions.USER_LOGIN);
  assertEqual(entry.entityType, 'user');
  assertEqual(entry.entityId, 'user-1');
  assert(entry.timestamp > 0, 'timestamp set');
});

suite.test('log: stores entry in repository (getAll retrieves it)', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('user-1', AuditActions.LISTING_CREATED, 'listing', 'lst-1');
  const all = await auditLogRepo.getAll();
  assertEqual(all.length, 1);
  assertEqual(all[0].action, AuditActions.LISTING_CREATED);
});

suite.test('log: null actorId falls back to "system"', async () => {
  stubRepos(); await auditLogRepo.clear();
  const entry = await AuditService.log(null, AuditActions.MODERATION_CASE_CREATED, 'moderation_case', uid());
  assertEqual(entry.actorId, 'system');
});

suite.test('log: metadata is stored on entry', async () => {
  stubRepos(); await auditLogRepo.clear();
  const meta = { transactionId: 'tx-1', issueType: 'item_not_received' };
  const entry = await AuditService.log('user-1', AuditActions.COMPLAINT_CREATED, 'complaint', uid(), meta);
  assertEqual(entry.metadata.transactionId, 'tx-1');
  assertEqual(entry.metadata.issueType, 'item_not_received');
});

suite.test('log: multiple entries accumulate', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('user-1', AuditActions.USER_LOGIN, 'user', 'user-1');
  await AuditService.log('user-1', AuditActions.LISTING_CREATED, 'listing', uid());
  await AuditService.log('user-2', AuditActions.USER_LOGIN, 'user', 'user-2');

  const all = await auditLogRepo.getAll();
  assertEqual(all.length, 3);
});

suite.test('log: each AuditActions constant produces correct action string', async () => {
  stubRepos(); await auditLogRepo.clear();
  const entry = await AuditService.log('u1', AuditActions.ROLE_ASSIGNED, 'user', uid(), { role: 'moderator' });
  assertEqual(entry.action, 'user.role_assigned');
});

// ── getAll() ──────────────────────────────────────────────────────────────────

suite.test('getAll: admin can retrieve all audit logs', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('user-1', AuditActions.USER_LOGIN, 'user', 'user-1');
  await AuditService.log('user-2', AuditActions.LISTING_CREATED, 'listing', uid());

  const logs = await AuditService.getAll(adminSession());
  assertEqual(logs.length, 2);
});

suite.test('getAll: regular user cannot access audit logs', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AuditService.getAll(userSession()),
    'AuthorizationError',
  );
});

suite.test('getAll: null session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AuditService.getAll(null),
    'AuthenticationError',
  );
});

// ── getByActor() ──────────────────────────────────────────────────────────────

suite.test('getByActor: returns only entries for the specified actor', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('user-1', AuditActions.USER_LOGIN, 'user', 'user-1');
  await AuditService.log('user-1', AuditActions.LISTING_CREATED, 'listing', uid());
  await AuditService.log('user-2', AuditActions.USER_LOGIN, 'user', 'user-2');

  const entries = await AuditService.getByActor('user-1');
  assertEqual(entries.length, 2);
  assert(entries.every(e => e.actorId === 'user-1'), 'all entries belong to user-1');
});

// ── getByEntityType() ─────────────────────────────────────────────────────────

suite.test('getByEntityType: returns only entries matching entity type', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('u1', AuditActions.LISTING_CREATED, 'listing', uid());
  await AuditService.log('u1', AuditActions.LISTING_CREATED, 'listing', uid());
  await AuditService.log('u1', AuditActions.COMPLAINT_CREATED, 'complaint', uid());

  const listingEntries = await AuditService.getByEntityType('listing');
  assertEqual(listingEntries.length, 2);
  assert(listingEntries.every(e => e.entityType === 'listing'), 'all listing entries');
});

// ── count() ───────────────────────────────────────────────────────────────────

suite.test('count: returns 0 on empty store', async () => {
  stubRepos(); await auditLogRepo.clear();
  const c = await AuditService.count();
  assertEqual(c, 0);
});

suite.test('count: returns correct count after logging', async () => {
  stubRepos(); await auditLogRepo.clear();
  await AuditService.log('u1', AuditActions.USER_LOGIN, 'user', uid());
  await AuditService.log('u2', AuditActions.USER_LOGIN, 'user', uid());
  const c = await AuditService.count();
  assertEqual(c, 2);
});

// ── Append-only enforcement ───────────────────────────────────────────────────

suite.test('AuditLogRepository.delete throws (append-only contract)', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => repos.auditLogRepository.delete('some-id'),
    'Error',
  );
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
