/**
 * Clean-Start Bootstrap Verification Tests
 *
 * Verifies the first-run initialization flow:
 *   - Fresh system (empty DB) requires setup
 *   - Setup wizard creates admin + categories correctly
 *   - After setup, system is fully functional (listings work)
 *   - Setup route is locked after initialization
 *   - Setup cannot be repeated (admin re-creation blocked)
 *   - Categories seeded during setup are immediately available
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../unit_tests/setup.js';
import { AuthService } from '../src/services/AuthService.js';
import { InitService } from '../src/services/InitService.js';
import { ListingService } from '../src/services/ListingService.js';
import { AdminService } from '../src/services/AdminService.js';
import { ThreadService } from '../src/services/ThreadService.js';
import { TransactionService } from '../src/services/TransactionService.js';
import { Roles } from '../src/domain/enums/roles.js';
import { ListingStatus } from '../src/domain/enums/statuses.js';
import * as repos from '../src/repositories/index.js';

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

const suite = new TestRunner('Clean-Start Bootstrap Verification');

// ─────────────────────────────────────────────
// Repo stubs
// ─────────────────────────────────────────────

function stubRepos() {
  const userRepo      = new InMemoryRepository();
  const sessionRepo   = new InMemoryRepository();
  const listingRepo   = new InMemoryRepository();
  const categoryRepo  = new InMemoryRepository();
  const auditRepo     = new InMemoryRepository();
  const threadRepo    = new InMemoryRepository();
  const txRepo        = new InMemoryRepository();
  const notifRepo     = new InMemoryRepository();
  const blockRepo     = new InMemoryRepository();
  const modCaseRepo   = new InMemoryRepository();

  repos.userRepository.getAll            = () => userRepo.getAll();
  repos.userRepository.getById           = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail     = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getByUsername     = (u)  => userRepo.getOneByIndex('username', u);
  repos.userRepository.getOneByIndex     = (i, v) => userRepo.getOneByIndex(i, v);
  repos.userRepository.create            = (r) => userRepo.create(r);
  repos.userRepository.update            = (r) => userRepo.update(r);

  repos.sessionRepository.create         = (r) => sessionRepo.create(r);
  repos.sessionRepository.getById        = (id) => sessionRepo.getById(id);
  repos.sessionRepository.getByIdOrFail  = (id) => sessionRepo.getByIdOrFail(id);
  repos.sessionRepository.update         = (r) => sessionRepo.update(r);
  repos.sessionRepository.delete         = (id) => sessionRepo.delete(id);
  repos.sessionRepository.getByIndex     = (i, v) => sessionRepo.getByIndex(i, v);
  repos.sessionRepository.getOneByIndex  = (i, v) => sessionRepo.getOneByIndex(i, v);

  repos.categoryRepository.create        = (r) => categoryRepo.create(r);
  repos.categoryRepository.getAll        = () => categoryRepo.getAll();
  repos.categoryRepository.getById       = (id) => categoryRepo.getById(id);
  repos.categoryRepository.getByIdOrFail = (id) => categoryRepo.getByIdOrFail(id);
  repos.categoryRepository.update        = (r) => categoryRepo.update(r);

  repos.listingRepository.create         = (r) => listingRepo.create(r);
  repos.listingRepository.getById        = (id) => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail  = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update         = (r) => listingRepo.update(r);
  repos.listingRepository.getAll         = () => listingRepo.getAll();
  repos.listingRepository.getByIndex     = (i, v) => listingRepo.getByIndex(i, v);
  repos.listingRepository.countByIndex   = (i, v) => listingRepo.countByIndex(i, v);

  repos.auditLogRepository.create        = (r) => auditRepo.create(r);
  repos.auditLogRepository.getAll        = () => auditRepo.getAll();
  repos.auditLogRepository.getByIndex    = (i, v) => auditRepo.getByIndex(i, v);

  repos.threadRepository.create          = (r) => threadRepo.create(r);
  repos.threadRepository.getById         = (id) => threadRepo.getById(id);
  repos.threadRepository.getByIdOrFail   = (id) => threadRepo.getByIdOrFail(id);
  repos.threadRepository.update          = (r) => threadRepo.update(r);
  repos.threadRepository.getByIndex      = (i, v) => threadRepo.getByIndex(i, v);
  repos.threadRepository.getOneByIndex   = (i, v) => threadRepo.getOneByIndex(i, v);

  repos.transactionRepository.create     = (r) => txRepo.create(r);
  repos.transactionRepository.getById    = (id) => txRepo.getById(id);
  repos.transactionRepository.getByIdOrFail = (id) => txRepo.getByIdOrFail(id);
  repos.transactionRepository.update     = (r) => txRepo.update(r);
  repos.transactionRepository.getByIndex = (i, v) => txRepo.getByIndex(i, v);
  repos.transactionRepository.getOneByIndex = (i, v) => txRepo.getOneByIndex(i, v);

  repos.notificationRepository.create    = (r) => notifRepo.create(r);
  repos.notificationRepository.getAll    = () => notifRepo.getAll();
  repos.notificationRepository.getById   = (id) => notifRepo.getById(id);
  repos.notificationRepository.getByIdOrFail = (id) => notifRepo.getByIdOrFail(id);
  repos.notificationRepository.update    = (r) => notifRepo.update(r);
  repos.notificationRepository.getByIndex = (i, v) => notifRepo.getByIndex(i, v);

  repos.blockRepository.getByIndex       = (i, v) => blockRepo.getByIndex(i, v);
  repos.blockRepository.getOneByIndex    = (i, v) => blockRepo.getOneByIndex(i, v);
  repos.blockRepository.create           = (r) => blockRepo.create(r);
  repos.blockRepository.delete           = (id) => blockRepo.delete(id);
  repos.blockRepository.getById          = (id) => blockRepo.getById(id);

  repos.moderationCaseRepository.create  = (r) => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById = (id) => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = (id) => modCaseRepo.getByIdOrFail(id);
  repos.moderationCaseRepository.update  = (r) => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus = (s) => modCaseRepo.getByIndex('status', s);

  // Sensitive words: empty list means no pre-screening flags
  repos.sensitiveWordRepository.getAll   = () => Promise.resolve([]);
  repos.sensitiveWordRepository.create   = (r) => modCaseRepo.create(r);
  repos.sensitiveWordRepository.getById  = (id) => Promise.resolve(null);
  repos.sensitiveWordRepository.getByIdOrFail = (id) => Promise.reject(new Error(`Not found: ${id}`));
  repos.sensitiveWordRepository.delete   = () => Promise.resolve();

  // Noop stubs for any remaining repos
  const noopRepo = new InMemoryRepository();
  for (const key of Object.keys(repos)) {
    const r = repos[key];
    if (typeof r === 'object' && r !== null && Object.isExtensible(r) && !r.create) {
      r.create      = (x) => noopRepo.create(x);
      r.getAll      = () => noopRepo.getAll();
      r.getByIndex  = () => Promise.resolve([]);
      r.getOneByIndex = () => Promise.resolve(null);
    }
  }

  return { userRepo, categoryRepo, listingRepo };
}

const SQ = [
  { question: 'What is your pet name?', answer: 'Fluffy' },
  { question: 'What city were you born?', answer: 'Boston' },
];

// ══════════════════════════════════════════════════════════
//  FRESH SYSTEM DETECTION
// ══════════════════════════════════════════════════════════

suite.test('Fresh system (empty DB) reports not initialized', async () => {
  stubRepos();
  _ls.clear();

  const initialized = await InitService.isInitialized();
  assertEqual(initialized, false, 'Empty DB must not be initialized');
});

suite.test('System with only USER-role accounts is not initialized', async () => {
  const { userRepo } = stubRepos();
  _ls.clear();

  // Manually insert a regular user (no admin)
  await userRepo.create({
    id: 'user-1', username: 'regular', roles: [Roles.USER],
    passwordHash: 'x', salt: 'x', securityQuestions: [],
    displayName: 'Regular', createdAt: Date.now(), updatedAt: Date.now(),
  });

  const initialized = await InitService.isInitialized();
  assertEqual(initialized, false, 'USER-only DB must not be initialized');
});

suite.test('System with MODERATOR but no ADMIN is not initialized', async () => {
  const { userRepo } = stubRepos();
  _ls.clear();

  await userRepo.create({
    id: 'mod-1', username: 'modonly', roles: [Roles.MODERATOR],
    passwordHash: 'x', salt: 'x', securityQuestions: [],
    displayName: 'Mod', createdAt: Date.now(), updatedAt: Date.now(),
  });

  const initialized = await InitService.isInitialized();
  assertEqual(initialized, false, 'MODERATOR-only DB must not be initialized');
});

// ══════════════════════════════════════════════════════════
//  SETUP WIZARD: ADMIN CREATION (STEP 1)
// ══════════════════════════════════════════════════════════

suite.test('Setup step 1: creates admin with ADMIN role', async () => {
  stubRepos();
  _ls.clear();

  const admin = await InitService.createInitialAdmin({
    username: 'setup_admin',
    password: 'SetupAdmin@1234!',
    displayName: 'System Admin',
    securityQuestions: SQ,
  });

  assert(admin.roles.includes(Roles.ADMIN), 'Created user must have ADMIN role');
  assertEqual(admin.username, 'setup_admin', 'Username must be stored');
});

suite.test('Setup step 1: system becomes initialized after admin creation', async () => {
  stubRepos();
  _ls.clear();

  assertEqual(await InitService.isInitialized(), false, 'Must start uninitialized');

  await InitService.createInitialAdmin({
    username: 'setup_admin2',
    password: 'SetupAdmin@5678!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });

  assertEqual(await InitService.isInitialized(), true, 'Must be initialized after admin creation');
});

suite.test('Setup step 1: admin can login immediately after creation', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin3',
    password: 'SetupAdmin@9012!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });

  const { session, user } = await AuthService.login('setup_admin3', 'SetupAdmin@9012!');
  assert(session, 'Login must return a session');
  assert(session.roles.includes(Roles.ADMIN), 'Admin session must carry ADMIN role');
  assertEqual(user.username, 'setup_admin3', 'Login must return the correct user');
});

suite.test('Setup step 1: rejects weak passwords', async () => {
  stubRepos();
  _ls.clear();

  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'setup_admin4',
      password: 'weak',
      displayName: 'Admin',
      securityQuestions: SQ,
    }),
    'ValidationError'
  );
});

suite.test('Setup step 1: rejects missing display name', async () => {
  stubRepos();
  _ls.clear();

  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'setup_admin5',
      password: 'SetupAdmin@5678!',
      displayName: '',
      securityQuestions: SQ,
    }),
    'ValidationError'
  );
});

// ══════════════════════════════════════════════════════════
//  SETUP WIZARD: CATEGORY SEEDING (STEP 2)
// ══════════════════════════════════════════════════════════

suite.test('Setup step 2: creates baseline categories', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin6',
    password: 'SetupAdmin@6789!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });
  const { session } = await AuthService.login('setup_admin6', 'SetupAdmin@6789!');

  const cats = await InitService.createBaselineCategories(session, InitService.defaultCategories());
  assert(cats.length >= 5, 'At least 5 default categories must be created');
  assert(cats.every(c => c.id && c.name), 'Every category must have id and name');
});

suite.test('Setup step 2: custom categories can be seeded', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin7',
    password: 'SetupAdmin@7890!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });
  const { session } = await AuthService.login('setup_admin7', 'SetupAdmin@7890!');

  const customCats = [
    { name: 'Electronics' },
    { name: 'Clothing' },
    { name: 'Books' },
  ];
  const cats = await InitService.createBaselineCategories(session, customCats);
  assertEqual(cats.length, 3, 'Must create exactly 3 custom categories');
  assertEqual(cats[0].name, 'Electronics', 'First category name must match');
});

suite.test('defaultCategories returns at least 5 named entries', () => {
  const defaults = InitService.defaultCategories();
  assert(Array.isArray(defaults), 'defaultCategories must return an array');
  assert(defaults.length >= 5, `Expected >= 5 categories, got ${defaults.length}`);
  assert(defaults.every(c => typeof c.name === 'string' && c.name.length > 0),
    'Every default category must have a non-empty name');
});

// ══════════════════════════════════════════════════════════
//  POST-SETUP FUNCTIONALITY
// ══════════════════════════════════════════════════════════

suite.test('After setup: categories are immediately available for listing creation', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin8',
    password: 'SetupAdmin@8901!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });
  const { session: adminSession } = await AuthService.login('setup_admin8', 'SetupAdmin@8901!');

  const cats = await InitService.createBaselineCategories(adminSession, [
    { name: 'Electronics' },
  ]);

  // Seed a regular user
  await AuthService.register({
    username: 'post_setup_seller',
    password: 'Seller@Post1up!!',
    displayName: 'Seller',
    securityQuestions: SQ,
  });
  const { session: sellerSession } = await AuthService.login('post_setup_seller', 'Seller@Post1up!!');

  // Create and publish a listing using the seeded category
  const draft = await ListingService.create(sellerSession, {
    title: 'Laptop', description: '<p>Good laptop</p>', price: 500,
    categoryId: cats[0].id, deliveryOptions: { pickup: true, delivery: false },
  });
  const { listing } = await ListingService.publish(sellerSession, draft.id);
  assertEqual(listing.status, ListingStatus.ACTIVE, 'Listing must be ACTIVE after publish');
});

suite.test('After setup: admin cannot be created again (setup blocked)', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin9',
    password: 'SetupAdmin@9012!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });

  // Second call must be blocked
  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'setup_admin10',
      password: 'SetupAdmin@0123!',
      displayName: 'Admin2',
      securityQuestions: SQ,
    }),
    'ValidationError',
    'already initialized'
  );
});

suite.test('After setup: the admin user has full administrative capabilities', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'setup_admin11',
    password: 'SetupAdmin@1234!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });
  const { session } = await AuthService.login('setup_admin11', 'SetupAdmin@1234!');

  // Can create categories
  const cat = await AdminService.createCategory(session, { name: 'Test', sortOrder: 1 });
  assert(cat.id, 'Admin must be able to create categories');

  // Can view category list
  const tree = await AdminService.getCategoryTree(session);
  assert(Array.isArray(tree), 'Admin must be able to fetch category tree');
  assert(tree.some(c => c.id === cat.id), 'Created category must appear in tree');
});

// ══════════════════════════════════════════════════════════
//  SETUP GATE: SETUP ROUTE SIMULATION
// ══════════════════════════════════════════════════════════

suite.test('Setup gate: uninitialized → isInitialized returns false', async () => {
  stubRepos();
  _ls.clear();

  // Simulate router guard logic
  let initialized = await InitService.isInitialized();
  assertEqual(initialized, false, 'Uninitialized system should redirect to /setup');
});

suite.test('Setup gate: after init, isInitialized returns true (setup route locked)', async () => {
  stubRepos();
  _ls.clear();

  await InitService.createInitialAdmin({
    username: 'gate_admin',
    password: 'GateAdmin@1234!',
    displayName: 'Admin',
    securityQuestions: SQ,
  });

  // Simulate router guard logic
  const initialized = await InitService.isInitialized();
  assertEqual(initialized, true, 'Initialized system should block /setup and redirect to login/home');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
