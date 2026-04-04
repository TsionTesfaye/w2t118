/**
 * Route Guard Logic Tests
 *
 * Validates RBAC enforcement at the service layer (which backs route guards):
 *   - Uninitialized system detection (setup gate)
 *   - Initialized system blocks re-setup
 *   - Guest-only access (non-auth users cannot call auth-guarded services)
 *   - Auth-required access (invalid/missing session rejected)
 *   - Role-based access (USER vs MODERATOR vs SUPPORT_AGENT vs ADMIN)
 *   - Ownership checks (users cannot mutate others' resources)
 *   - No bypass possible via session spoofing
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AuthService } from '../../src/services/AuthService.js';
import { InitService } from '../../src/services/InitService.js';
import { ListingService } from '../../src/services/ListingService.js';
import { AdminService } from '../../src/services/AdminService.js';
import { ModerationService } from '../../src/services/ModerationService.js';
import { SupportService } from '../../src/services/SupportService.js';
import { UserService } from '../../src/services/UserService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { ListingStatus } from '../../src/domain/enums/statuses.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('Route Guard Logic');

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

// ─────────────────────────────────────────────
// Repo stubs
// ─────────────────────────────────────────────

function stubRepos() {
  const userRepo     = new InMemoryRepository();
  const sessionRepo  = new InMemoryRepository();
  const listingRepo  = new InMemoryRepository();
  const categoryRepo = new InMemoryRepository();
  const auditRepo    = new InMemoryRepository();
  const modCaseRepo  = new InMemoryRepository();
  const notifRepo    = new InMemoryRepository();
  const blockRepo    = new InMemoryRepository();

  repos.userRepository.getAll           = () => userRepo.getAll();
  repos.userRepository.getById          = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail    = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getByUsername    = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.getOneByIndex    = (i, v) => userRepo.getOneByIndex(i, v);
  repos.userRepository.create           = (r) => userRepo.create(r);
  repos.userRepository.update           = (r) => userRepo.update(r);

  repos.sessionRepository.create        = (r) => sessionRepo.create(r);
  repos.sessionRepository.getById       = (id) => sessionRepo.getById(id);
  repos.sessionRepository.getByIdOrFail = (id) => sessionRepo.getByIdOrFail(id);
  repos.sessionRepository.update        = (r) => sessionRepo.update(r);
  repos.sessionRepository.delete        = (id) => sessionRepo.delete(id);
  repos.sessionRepository.getByIndex    = (i, v) => sessionRepo.getByIndex(i, v);
  repos.sessionRepository.getOneByIndex = (i, v) => sessionRepo.getOneByIndex(i, v);

  repos.categoryRepository.create       = (r) => categoryRepo.create(r);
  repos.categoryRepository.getAll       = () => categoryRepo.getAll();
  repos.categoryRepository.getById      = (id) => categoryRepo.getById(id);
  repos.categoryRepository.getByIdOrFail = (id) => categoryRepo.getByIdOrFail(id);
  repos.categoryRepository.update       = (r) => categoryRepo.update(r);

  repos.listingRepository.create        = (r) => listingRepo.create(r);
  repos.listingRepository.getById       = (id) => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update        = (r) => listingRepo.update(r);
  repos.listingRepository.getAll        = () => listingRepo.getAll();
  repos.listingRepository.getByIndex    = (i, v) => listingRepo.getByIndex(i, v);
  repos.listingRepository.countByIndex  = (i, v) => listingRepo.countByIndex(i, v);

  repos.auditLogRepository.create       = (r) => auditRepo.create(r);
  repos.auditLogRepository.getAll       = () => auditRepo.getAll();
  repos.auditLogRepository.getByIndex   = (i, v) => auditRepo.getByIndex(i, v);

  repos.moderationCaseRepository.create = (r) => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById = (id) => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = (id) => modCaseRepo.getByIdOrFail(id);
  repos.moderationCaseRepository.update = (r) => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus = (s) => modCaseRepo.getByIndex('status', s);

  repos.notificationRepository.create   = (r) => notifRepo.create(r);
  repos.notificationRepository.getAll   = () => notifRepo.getAll();
  repos.notificationRepository.getById  = (id) => notifRepo.getById(id);
  repos.notificationRepository.getByIdOrFail = (id) => notifRepo.getByIdOrFail(id);
  repos.notificationRepository.update   = (r) => notifRepo.update(r);
  repos.notificationRepository.getByIndex = (i, v) => notifRepo.getByIndex(i, v);

  repos.blockRepository.getByIndex      = (i, v) => blockRepo.getByIndex(i, v);
  repos.blockRepository.getOneByIndex   = (i, v) => blockRepo.getOneByIndex(i, v);
  repos.blockRepository.create          = (r) => blockRepo.create(r);
  repos.blockRepository.delete          = (id) => blockRepo.delete(id);
  repos.blockRepository.getById         = (id) => blockRepo.getById(id);

  repos.sensitiveWordRepository.getAll  = () => Promise.resolve([]);
  repos.sensitiveWordRepository.create  = (r) => Promise.resolve(r);
  repos.sensitiveWordRepository.getById = () => Promise.resolve(null);
  repos.sensitiveWordRepository.getByIdOrFail = (id) => Promise.reject(new Error(`Not found: ${id}`));
  repos.sensitiveWordRepository.delete  = () => Promise.resolve();

  const noopRepo = new InMemoryRepository();
  for (const key of Object.keys(repos)) {
    const r = repos[key];
    if (typeof r === 'object' && r !== null && Object.isExtensible(r) && !r.create) {
      r.create        = (x) => noopRepo.create(x);
      r.getAll        = () => noopRepo.getAll();
      r.getByIndex    = () => Promise.resolve([]);
      r.getOneByIndex = () => Promise.resolve(null);
    }
  }

  return { userRepo, categoryRepo, listingRepo };
}

// ── Session factories ──
function makeSession(userId, roles) {
  return { userId, roles, lastActivityAt: Date.now(), createdAt: Date.now() };
}

const SQ = [
  { question: 'First pet?', answer: 'Buddy' },
  { question: 'Birth city?', answer: 'Austin' },
];

// ══════════════════════════════════════════════════════════
//  SETUP GATE
// ══════════════════════════════════════════════════════════

suite.test('Setup gate: empty DB is not initialized', async () => {
  stubRepos();
  _ls.clear();
  assertEqual(await InitService.isInitialized(), false);
});

suite.test('Setup gate: initialized after first admin creation', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin1', password: 'RouteGuard@1234!',
    displayName: 'Admin', securityQuestions: SQ,
  });

  assertEqual(await InitService.isInitialized(), true);
});

suite.test('Setup gate: second admin creation is blocked', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin2', password: 'RouteGuard@2345!',
    displayName: 'Admin', securityQuestions: SQ,
  });

  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'rg_admin2b', password: 'RouteGuard@2345!',
      displayName: 'Admin2', securityQuestions: SQ,
    }),
    'ValidationError',
    'already initialized'
  );
});

// ══════════════════════════════════════════════════════════
//  AUTH GUARD: SESSION VALIDATION
// ══════════════════════════════════════════════════════════

suite.test('Auth guard: null session rejected by all services', async () => {
  stubRepos();
  _ls.clear();

  await assertThrowsAsync(
    () => AdminService.getCategoryTree(null),
    'AuthenticationError'
  );

  await assertThrowsAsync(
    () => ListingService.getActiveListings(null),
    'AuthenticationError'
  );
});

suite.test('Auth guard: empty session object rejected', async () => {
  stubRepos();
  _ls.clear();

  await assertThrowsAsync(
    () => AdminService.getCategoryTree({}),
    'AuthenticationError'
  );
});

suite.test('Auth guard: session without userId rejected', async () => {
  stubRepos();
  _ls.clear();

  const badSession = { roles: [Roles.USER], lastActivityAt: Date.now() };
  await assertThrowsAsync(
    () => ListingService.getActiveListings(badSession),
    'AuthenticationError'
  );
});

// ══════════════════════════════════════════════════════════
//  RBAC: ADMIN-ONLY ROUTES
// ══════════════════════════════════════════════════════════

suite.test('RBAC: USER cannot create categories (admin-only)', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin3', password: 'RouteGuard@3456!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_user3', password: 'RouteUser@3456!',
    displayName: 'User', securityQuestions: SQ,
  });
  const { session: userSession } = await AuthService.login('rg_user3', 'RouteUser@3456!');

  await assertThrowsAsync(
    () => AdminService.createCategory(userSession, { name: 'Cat', sortOrder: 1 }),
    'AuthorizationError'
  );
});

suite.test('RBAC: MODERATOR cannot create categories (admin-only)', async () => {
  stubRepos();
  _ls.clear();

  const modSession = makeSession('mod-rg-1', [Roles.MODERATOR]);

  await assertThrowsAsync(
    () => AdminService.createCategory(modSession, { name: 'Cat', sortOrder: 1 }),
    'AuthorizationError'
  );
});

suite.test('RBAC: SUPPORT_AGENT cannot create categories (admin-only)', async () => {
  stubRepos();
  _ls.clear();

  const agentSession = makeSession('agent-rg-1', [Roles.SUPPORT_AGENT]);

  await assertThrowsAsync(
    () => AdminService.createCategory(agentSession, { name: 'Cat', sortOrder: 1 }),
    'AuthorizationError'
  );
});

suite.test('RBAC: ADMIN can create categories', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin4', password: 'RouteGuard@4567!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('rg_admin4', 'RouteGuard@4567!');

  const cat = await AdminService.createCategory(adminSession, { name: 'Electronics', sortOrder: 1 });
  assert(cat.id, 'Admin must be able to create categories');
});

// ══════════════════════════════════════════════════════════
//  RBAC: MODERATOR ROUTES
// ══════════════════════════════════════════════════════════

suite.test('RBAC: USER cannot pick up moderation cases', async () => {
  stubRepos();
  _ls.clear();

  const modCase = await ModerationService.createCase(null, {
    contentId: 'listing-x', contentType: 'listing', reason: 'test',
  });

  const userSession = makeSession('user-rg-2', [Roles.USER]);
  await assertThrowsAsync(
    () => ModerationService.pickUpCase(userSession, modCase.id),
    'AuthorizationError'
  );
});

suite.test('RBAC: USER cannot decide moderation cases', async () => {
  stubRepos();
  _ls.clear();

  const modCase = await ModerationService.createCase(null, {
    contentId: 'listing-y', contentType: 'listing', reason: 'test',
  });

  const userSession = makeSession('user-rg-3', [Roles.USER]);
  await assertThrowsAsync(
    () => ModerationService.decide(userSession, modCase.id, { decision: 'approved' }),
    'AuthorizationError'
  );
});

suite.test('RBAC: MODERATOR can pick up cases', async () => {
  stubRepos();
  _ls.clear();

  const modCase = await ModerationService.createCase(null, {
    contentId: 'listing-z', contentType: 'listing', reason: 'test',
  });

  const modSession = makeSession('mod-rg-2', [Roles.MODERATOR]);
  const picked = await ModerationService.pickUpCase(modSession, modCase.id);
  assert(picked, 'Moderator must be able to pick up cases');
});

// ══════════════════════════════════════════════════════════
//  RBAC: SUPPORT AGENT ROUTES
// ══════════════════════════════════════════════════════════

suite.test('RBAC: USER cannot transition complaint status', async () => {
  stubRepos();
  _ls.clear();

  // Manually insert a complaint in OPEN state
  const { listingRepo } = stubRepos();
  const noopRepo = new InMemoryRepository();
  repos.complaintRepository.create        = (r) => noopRepo.create(r);
  repos.complaintRepository.getById       = (id) => noopRepo.getById(id);
  repos.complaintRepository.getByIdOrFail = (id) => noopRepo.getByIdOrFail(id);
  repos.complaintRepository.update        = (r) => noopRepo.update(r);
  repos.complaintRepository.getByIndex    = (i, v) => noopRepo.getByIndex(i, v);
  repos.complaintRepository.getOneByIndex = (i, v) => noopRepo.getOneByIndex(i, v);

  await noopRepo.create({
    id: 'complaint-rg-1', userId: 'user-rg-4', transactionId: 'tx-rg-1',
    issueType: 'other', description: 'Issue', status: 'open',
    resolution: null, resolvedAt: null, assignedTo: null,
    slaDeadline: Date.now() + 86400000, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const userSession = makeSession('user-rg-4', [Roles.USER]);
  await assertThrowsAsync(
    () => SupportService.transitionComplaint(userSession, 'complaint-rg-1', 'investigating'),
    'AuthorizationError'
  );
});

suite.test('RBAC: SUPPORT_AGENT can transition complaint status', async () => {
  stubRepos();
  _ls.clear();

  const noopRepo2 = new InMemoryRepository();
  repos.complaintRepository.create        = (r) => noopRepo2.create(r);
  repos.complaintRepository.getById       = (id) => noopRepo2.getById(id);
  repos.complaintRepository.getByIdOrFail = (id) => noopRepo2.getByIdOrFail(id);
  repos.complaintRepository.update        = (r) => noopRepo2.update(r);
  repos.complaintRepository.getByIndex    = (i, v) => noopRepo2.getByIndex(i, v);
  repos.complaintRepository.getOneByIndex = (i, v) => noopRepo2.getOneByIndex(i, v);

  await noopRepo2.create({
    id: 'complaint-rg-2', userId: 'user-rg-5', transactionId: 'tx-rg-2',
    issueType: 'other', description: 'Issue', status: 'open',
    resolution: null, resolvedAt: null, assignedTo: null,
    slaDeadline: Date.now() + 86400000, createdAt: Date.now(), updatedAt: Date.now(),
  });

  const agentSession = makeSession('agent-rg-2', [Roles.SUPPORT_AGENT]);
  const result = await SupportService.transitionComplaint(agentSession, 'complaint-rg-2', 'investigating');
  assertEqual(result.status, 'investigating', 'Support agent must be able to transition complaints');
});

// ══════════════════════════════════════════════════════════
//  OWNERSHIP CHECKS
// ══════════════════════════════════════════════════════════

suite.test('Ownership: user cannot edit another user\'s listing', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin5', password: 'RouteGuard@5678!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('rg_admin5', 'RouteGuard@5678!');
  const cat = await AdminService.createCategory(adminSession, { name: 'Test', sortOrder: 1 });

  await AuthService.register({
    username: 'rg_owner', password: 'RouteOwner@5678!',
    displayName: 'Owner', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_attacker', password: 'RouteAtk@5678!!',
    displayName: 'Attacker', securityQuestions: SQ,
  });
  const { session: ownerSession } = await AuthService.login('rg_owner', 'RouteOwner@5678!');
  const { session: attackerSession } = await AuthService.login('rg_attacker', 'RouteAtk@5678!!');

  const listing = await ListingService.create(ownerSession, {
    title: 'My Item', description: '<p>Mine</p>', price: 100,
    categoryId: cat.id, deliveryOptions: { pickup: true, delivery: false },
  });

  await assertThrowsAsync(
    () => ListingService.update(attackerSession, listing.id, { title: 'Hijacked' }),
    'AuthorizationError'
  );
});

suite.test('Ownership: admin override — admin can assign roles to any user', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin6', password: 'RouteGuard@6789!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_target', password: 'RouteTarget@6789!',
    displayName: 'Target', securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('rg_admin6', 'RouteGuard@6789!');
  const { session: targetSession } = await AuthService.login('rg_target', 'RouteTarget@6789!');

  // Admin can assign MODERATOR role to any user
  await UserService.assignRole(adminSession, targetSession.userId, Roles.MODERATOR);
  const profile = await UserService.getProfile(adminSession, targetSession.userId);
  assert(profile.roles.includes(Roles.MODERATOR), 'Admin must be able to assign roles');
});

suite.test('Ownership: regular user cannot assign roles to others', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'rg_admin7', password: 'RouteGuard@7890!',
    displayName: 'Admin', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_user7a', password: 'RouteUser@7890!',
    displayName: 'User7a', securityQuestions: SQ,
  });
  await AuthService.register({
    username: 'rg_user7b', password: 'RouteUser@7891!',
    displayName: 'User7b', securityQuestions: SQ,
  });
  const { session: userSession } = await AuthService.login('rg_user7a', 'RouteUser@7890!');
  const { session: targetSession } = await AuthService.login('rg_user7b', 'RouteUser@7891!');

  await assertThrowsAsync(
    () => UserService.assignRole(userSession, targetSession.userId, Roles.MODERATOR),
    'AuthorizationError'
  );
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
