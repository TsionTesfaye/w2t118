/**
 * E2E: Password Recovery + Profile Update
 *
 * Tests the full recovery flow end-to-end using REAL crypto (PBKDF2):
 *
 *   1. Register user via AuthService (actual password hashing)
 *   2. getSecurityQuestions → returns question text, NOT hashes
 *   3. recoverPassword with wrong answers → AuthenticationError
 *   4. recoverPassword with correct answers → success
 *   5. Login with new password works
 *   6. Login with old password fails
 *   7. Update profile: displayName + avatar
 *   8. getProfile confirms avatar and displayName persisted
 *   9. Profile does NOT expose sensitive fields
 *
 * Uses InMemoryRepository stubs — no IndexedDB required.
 * Crypto is REAL (PBKDF2 via Node 18 Web Crypto).
 */

// ── Node.js localStorage stub (AuthService uses LocalStorageAdapter) ──
const _ls = new Map();
globalThis.localStorage = {
  getItem:    (key) => _ls.get(key) ?? null,
  setItem:    (key, val) => _ls.set(key, String(val)),
  removeItem: (key) => _ls.delete(key),
  clear:      () => _ls.clear(),
};

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../unit_tests/setup.js';
import { AuthService } from '../src/services/AuthService.js';
import { UserService } from '../src/services/UserService.js';
import { Roles } from '../src/domain/enums/roles.js';
import * as repos from '../src/repositories/index.js';

const suite = new TestRunner('E2E: Password Recovery + Profile Update');

// ─────────────────────────────────────────────
// Repository wiring
// ─────────────────────────────────────────────

function setupRepos() {
  const userRepo    = new InMemoryRepository();
  const sessionRepo = new InMemoryRepository();

  repos.userRepository.getByUsername   = (un) => userRepo.getOneByIndex('username', un);
  repos.userRepository.getById         = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail   = async (id) => {
    const u = await userRepo.getById(id);
    if (!u) throw Object.assign(new Error(`Not found: ${id}`), { code: 'NOT_FOUND' });
    return u;
  };
  repos.userRepository.create          = (u) => userRepo.create(u);
  repos.userRepository.update          = (u) => userRepo.update(u);
  repos.userRepository.getAll          = () => userRepo.getAll();

  repos.sessionRepository.getById      = (id) => sessionRepo.getById(id);
  repos.sessionRepository.create       = (s) => sessionRepo.create(s);
  repos.sessionRepository.update       = (s) => sessionRepo.update(s);
  repos.sessionRepository.delete       = (id) => sessionRepo.delete(id);

  repos.auditLogRepository.create      = () => Promise.resolve();
  repos.notificationRepository.create  = () => Promise.resolve();

  return { userRepo, sessionRepo };
}

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const USERNAME    = 'recovery_e2e_user';
const PASSWORD    = 'Str0ng!Passw0rd#';
const NEW_PASS    = 'N3wStr0ng!Pass#';
const DISPLAY     = 'Recovery Tester';
const QUESTIONS = [
  { question: "What was your childhood nickname?", answer: 'sparky' },
  { question: 'What city did you grow up in?',     answer: 'Chicago' },
];

async function registerTestUser() {
  return AuthService.register({
    username: USERNAME,
    password: PASSWORD,
    displayName: DISPLAY,
    securityQuestions: QUESTIONS,
  });
}

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

suite.test('register: creates user with hashed password and security questions', async () => {
  setupRepos();
  const user = await registerTestUser();

  assert(user.id,       'User must have an id');
  assertEqual(user.username,    USERNAME, 'Username must match');
  assertEqual(user.displayName, DISPLAY,  'displayName must match');
  assert(!('passwordHash'       in user), 'passwordHash must not be exposed');
  assert(!('securityQuestions'  in user), 'securityQuestions must not be exposed');
  assert(!('salt'               in user), 'salt must not be exposed');
});

suite.test('getSecurityQuestions: returns question text only (no hashes)', async () => {
  setupRepos();
  await registerTestUser();

  const questions = await AuthService.getSecurityQuestions(USERNAME);

  assert(Array.isArray(questions), 'Must return array');
  assertEqual(questions.length, 2, 'Must return both questions');
  assertEqual(questions[0], QUESTIONS[0].question, 'Q1 text must match');
  assertEqual(questions[1], QUESTIONS[1].question, 'Q2 text must match');

  // Must be plain strings — not objects containing hashes
  for (const q of questions) {
    assertEqual(typeof q, 'string', 'Each entry must be a plain string');
  }
});

suite.test('getSecurityQuestions: unknown username returns placeholder questions (enumeration-safe)', async () => {
  setupRepos();
  let threw = false;
  let result;
  try {
    result = await AuthService.getSecurityQuestions('no-such-user');
  } catch {
    threw = true;
  }
  assert(!threw, 'Must NOT throw for unknown username — throwing leaks existence');
  assert(Array.isArray(result), 'Must return an array of placeholder questions');
  assert(result.length > 0, 'Placeholder array must not be empty');
});

suite.test('recoverPassword: wrong answers throw AuthenticationError', async () => {
  setupRepos();
  await registerTestUser();

  await assertThrowsAsync(
    () => AuthService.recoverPassword(USERNAME, ['wronganswer1', 'wronganswer2'], NEW_PASS),
    'AuthenticationError',
    'Incorrect security answers',
  );
});

suite.test('recoverPassword: correct answers reset password', async () => {
  setupRepos();
  await registerTestUser();

  const result = await AuthService.recoverPassword(
    USERNAME,
    [QUESTIONS[0].answer, QUESTIONS[1].answer],
    NEW_PASS,
  );

  assert(result.success, 'Recovery must succeed');
});

suite.test('after recovery: login with new password succeeds', async () => {
  setupRepos();
  await registerTestUser();
  await AuthService.recoverPassword(
    USERNAME,
    [QUESTIONS[0].answer, QUESTIONS[1].answer],
    NEW_PASS,
  );

  const result = await AuthService.login(USERNAME, NEW_PASS);

  assert(result.session, 'Session must be returned');
  assert(result.user,    'User must be returned');
  assertEqual(result.user.username, USERNAME, 'Username must match');
});

suite.test('after recovery: old password no longer works', async () => {
  setupRepos();
  await registerTestUser();
  await AuthService.recoverPassword(
    USERNAME,
    [QUESTIONS[0].answer, QUESTIONS[1].answer],
    NEW_PASS,
  );

  await assertThrowsAsync(
    () => AuthService.login(USERNAME, PASSWORD),
    'AuthenticationError',
  );
});

suite.test('case-insensitive answer matching: answers are trimmed and lowercased', async () => {
  setupRepos();
  await registerTestUser();

  // Answers provided with different casing and whitespace
  const result = await AuthService.recoverPassword(
    USERNAME,
    ['  SPARKY  ', '  CHICAGO  '],
    NEW_PASS,
  );

  assert(result.success, 'Recovery must succeed with differently-cased answers');
});

suite.test('profile update: avatar + displayName persisted and readable', async () => {
  setupRepos();
  await registerTestUser();
  const loginResult = await AuthService.login(USERNAME, PASSWORD);
  const session = loginResult.session;

  const AVATAR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  await UserService.updateProfile(session, {
    displayName: 'Updated Name',
    bio: 'A recovering user.',
    avatar: AVATAR,
  });

  const profile = await UserService.getProfile(session, session.userId);

  assertEqual(profile.displayName, 'Updated Name', 'displayName must be updated');
  assertEqual(profile.bio, 'A recovering user.', 'bio must be updated');
  assertEqual(profile.avatar, AVATAR, 'avatar must be persisted');
});

suite.test('getProfile does not expose password or security data', async () => {
  setupRepos();
  await registerTestUser();
  const { session } = await AuthService.login(USERNAME, PASSWORD);

  const profile = await UserService.getProfile(session, session.userId);

  const forbiddenFields = [
    'passwordHash', 'salt', 'securityQuestions',
    'failedAttempts', 'lockoutUntil', 'recoveryAttempts', 'recoveryLockoutUntil',
  ];
  for (const field of forbiddenFields) {
    assert(!(field in profile), `${field} must not appear in profile response`);
  }
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
