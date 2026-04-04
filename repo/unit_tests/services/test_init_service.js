/**
 * Unit Tests: InitService
 *
 * Verifies first-run setup behavior:
 *  - Fresh-state detection (isInitialized)
 *  - Initial admin creation (createInitialAdmin)
 *  - Baseline category seeding (createBaselineCategories)
 *  - Guards against re-initialization when already set up
 *
 * Uses InMemoryRepository stubs — no IndexedDB required.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../setup.js';
import { InitService } from '../../src/services/InitService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import * as repos from '../../src/repositories/index.js';

// ── Node.js Web Crypto polyfill ──
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const suite = new TestRunner('InitService: First-Run Setup');

// ─────────────────────────────────────────────
// Setup stubs
// ─────────────────────────────────────────────

let userRepo;
let auditRepo;

function resetRepos() {
  userRepo = new InMemoryRepository();
  auditRepo = new InMemoryRepository();

  // Stub out all repo calls used by InitService / AuditService
  repos.userRepository.getAll    = () => userRepo.getAll();
  repos.userRepository.getByUsername = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.create    = (r) => userRepo.create(r);
  repos.userRepository.update    = (r) => userRepo.update(r);
  repos.userRepository.getById   = (id) => userRepo.getById(id);
  repos.auditLogRepository.create = (r) => auditRepo.create(r);
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

suite.test('isInitialized returns false when no users exist', async () => {
  resetRepos();
  const result = await InitService.isInitialized();
  assertEqual(result, false, 'empty DB should not be initialized');
});

suite.test('isInitialized returns false when only USER-role users exist', async () => {
  resetRepos();
  await userRepo.create({
    id: 'u-1',
    username: 'regularuser',
    roles: [Roles.USER],
  });
  const result = await InitService.isInitialized();
  assertEqual(result, false, 'user-only DB should not be initialized');
});

suite.test('isInitialized returns true when an ADMIN user exists', async () => {
  resetRepos();
  await userRepo.create({
    id: 'u-admin',
    username: 'administrator',
    roles: [Roles.ADMIN],
  });
  const result = await InitService.isInitialized();
  assertEqual(result, true, 'DB with admin user should be initialized');
});

suite.test('createInitialAdmin succeeds on fresh system', async () => {
  resetRepos();

  const user = await InitService.createInitialAdmin({
    username: 'setup_admin',
    password: 'Admin@Setup123!',
    displayName: 'Administrator',
    securityQuestions: [
      { question: 'What is your pet name?', answer: 'Fluffy' },
      { question: 'What city were you born?', answer: 'Boston' },
    ],
  });

  assert(user, 'should return created user');
  assertEqual(user.username, 'setup_admin');
  assertEqual(user.displayName, 'Administrator');
  assert(user.roles.includes(Roles.ADMIN), 'admin flag must be set');
});

suite.test('createInitialAdmin does not expose password hash or security question answers', async () => {
  resetRepos();

  const user = await InitService.createInitialAdmin({
    username: 'setup_admin2',
    password: 'Admin@Setup123!',
    displayName: 'Admin',
    securityQuestions: [
      { question: 'Pet name?', answer: 'Rex' },
      { question: 'Birth city?', answer: 'Austin' },
    ],
  });

  assert(!('passwordHash' in user), 'passwordHash must not be returned');
  assert(!('salt' in user), 'salt must not be returned');
  assert(!('securityQuestions' in user), 'securityQuestions must not be returned');
});

suite.test('createInitialAdmin stores user in DB with ADMIN role', async () => {
  resetRepos();

  await InitService.createInitialAdmin({
    username: 'setup_admin3',
    password: 'Admin@Setup123!',
    displayName: 'Admin',
    securityQuestions: [
      { question: 'Pet name?', answer: 'Rex' },
      { question: 'Birth city?', answer: 'Austin' },
    ],
  });

  const stored = await userRepo.getAll();
  assertEqual(stored.length, 1, 'one user should be stored');
  assert(stored[0].roles.includes(Roles.ADMIN), 'stored user must have ADMIN role');
  assert(stored[0].passwordHash, 'password must be hashed');
});

suite.test('createInitialAdmin rejects invalid username', async () => {
  resetRepos();
  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'bad-username!', // hyphens not allowed
      password: 'Admin@Setup123!',
      displayName: 'Admin',
      securityQuestions: [
        { question: 'Q1', answer: 'a1' },
        { question: 'Q2', answer: 'a2' },
      ],
    }),
    'ValidationError'
  );
});

suite.test('createInitialAdmin rejects weak password', async () => {
  resetRepos();
  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'setup_admin4',
      password: 'weak',
      displayName: 'Admin',
      securityQuestions: [
        { question: 'Q1', answer: 'a1' },
        { question: 'Q2', answer: 'a2' },
      ],
    }),
    'ValidationError'
  );
});

suite.test('createInitialAdmin rejects missing display name', async () => {
  resetRepos();
  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'setup_admin5',
      password: 'Admin@Setup123!',
      displayName: '',
      securityQuestions: [
        { question: 'Q1', answer: 'a1' },
        { question: 'Q2', answer: 'a2' },
      ],
    }),
    'ValidationError'
  );
});

suite.test('createInitialAdmin is blocked after system is already initialized', async () => {
  resetRepos();

  // Create the first admin
  await InitService.createInitialAdmin({
    username: 'first_admin',
    password: 'Admin@Setup123!',
    displayName: 'First Admin',
    securityQuestions: [
      { question: 'Q1', answer: 'a1' },
      { question: 'Q2', answer: 'a2' },
    ],
  });

  // Second attempt must be rejected
  await assertThrowsAsync(
    () => InitService.createInitialAdmin({
      username: 'second_admin',
      password: 'Admin@Setup123!',
      displayName: 'Second Admin',
      securityQuestions: [
        { question: 'Q1', answer: 'a1' },
        { question: 'Q2', answer: 'a2' },
      ],
    }),
    'ValidationError'
  );
});

suite.test('defaultCategories returns a non-empty list with name fields', () => {
  const cats = InitService.defaultCategories();
  assert(Array.isArray(cats) && cats.length > 0, 'should return non-empty array');
  for (const cat of cats) {
    assert(typeof cat.name === 'string' && cat.name.length > 0, `category name must be non-empty: ${JSON.stringify(cat)}`);
  }
});

suite.test('defaultCategories returns at least 5 categories', () => {
  const cats = InitService.defaultCategories();
  assert(cats.length >= 5, `expected >= 5 categories, got ${cats.length}`);
});

suite.test('isInitialized is the single source of truth — no admin means setup required', async () => {
  resetRepos();

  // Add a moderator — should NOT count as initialized
  await userRepo.create({ id: 'mod-1', username: 'moduser', roles: [Roles.MODERATOR] });
  const result = await InitService.isInitialized();
  assertEqual(result, false, 'moderator alone does not satisfy initialization requirement');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
