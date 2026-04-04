/**
 * Auth Security Tests
 *
 * Verifies the three auth security hardening fixes:
 *
 *  1. Recovery username enumeration protection:
 *     - getSecurityQuestions: unknown user → placeholder questions (not error)
 *     - recoverPassword: unknown user → same generic error as wrong answers
 *
 *  2. Pre-lookup login throttle for unknown usernames (persistent):
 *     - Throttle applies BEFORE user lookup
 *     - Unknown username attempts are counted and locked out
 *     - Lock triggers after MAX_LOGIN_ATTEMPTS (5) within the window
 *     - Successful login clears the throttle entry
 *     - State is persisted via LoginThrottleStorage (survives reload, shared across tabs)
 *
 *  4. Throttle persistence, cross-tab, and TTL expiry:
 *     - State survives simulated reload (read from backend, not module memory)
 *     - Pre-existing locked state from a prior session is enforced
 *     - Shared backend → both tabs see same throttle state
 *     - Expired lockout is cleared (no false lockout)
 *     - Expired attempt window resets counter
 *     - Stale entries are pruned on each login
 *
 *  3. Consistent error responses:
 *     - Wrong password and unknown username return the same error message
 *     - No "User not found" / "Invalid username" raw messages in responses
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AuthService } from '../../src/services/AuthService.js';
import * as repos from '../../src/repositories/index.js';
import { LocalStorageAdapter } from '../../src/repositories/localStorageAdapter.js';
import {
  _overrideLoginThrottleStorage,
  makeThrottleMemoryBackend,
} from '../../src/utils/loginThrottleStorage.js';
import { AuditService } from '../../src/services/AuditService.js';
import { generateSalt, hashValue } from '../../src/utils/crypto.js';
import { now, FIFTEEN_MINUTES_MS, TEN_MINUTES_MS } from '../../src/utils/time.js';

const suite = new TestRunner('Auth Security: Enumeration & Throttle Hardening');

// ── Repo + adapter stubs ──
const userRepo    = new InMemoryRepository();
const sessionRepo = new InMemoryRepository();

function stubRepos() {
  repos.userRepository.getByUsername    = (u)    => userRepo.getOneByIndex('username', u);
  repos.userRepository.getById          = (id)   => userRepo.getById(id);
  repos.userRepository.getByIdOrFail    = (id)   => userRepo.getByIdOrFail(id);
  repos.userRepository.create           = (r)    => userRepo.create(r);
  repos.userRepository.update           = (r)    => userRepo.update(r);

  repos.sessionRepository.update  = (r)  => sessionRepo.update(r);
  repos.sessionRepository.delete  = (id) => sessionRepo.delete(id);

  // LocalStorageAdapter — no-op (not relevant to these tests)
  LocalStorageAdapter.get    = () => null;
  LocalStorageAdapter.set    = () => {};
  LocalStorageAdapter.remove = () => {};

  // AuditService — no-op (side effect not under test here)
  AuditService.log = async () => {};

  // Inject a fresh throttle backend so each test starts with clean state.
  // This replaces the old in-memory Map which was module-level and bled between tests.
  _overrideLoginThrottleStorage(makeThrottleMemoryBackend());
}

async function makeUser(username, password = 'TestPass@123!') {
  const salt = await generateSalt();
  const passwordHash = await hashValue(password, salt);
  const user = {
    id: `uid-${username}`,
    username,
    passwordHash,
    salt,
    roles: ['user'],
    displayName: username,
    avatar: null,
    bio: '',
    securityQuestions: [
      { question: "What was your first pet's name?", answerHash: 'ah1', answerSalt: 'as1' },
      { question: 'What city were you born in?',    answerHash: 'ah2', answerSalt: 'as2' },
    ],
    notificationPreferences: { messages: true, transactions: true, moderation: true, complaints: true },
    failedAttempts: 0,
    failedAttemptWindowStart: null,
    lockoutUntil: null,
    recoveryAttempts: 0,
    recoveryLockoutUntil: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await userRepo.create(user);
  return user;
}

// ═══════════════════════════════════════════════════════════════
//  SECTION 1 — Recovery Username Enumeration Protection
// ═══════════════════════════════════════════════════════════════

suite.test('getSecurityQuestions: known username returns real questions', async () => {
  stubRepos();
  await userRepo.clear();
  await makeUser('enum_known_1');

  const questions = await AuthService.getSecurityQuestions('enum_known_1');
  assert(Array.isArray(questions), 'Must return an array');
  assert(questions.length > 0, 'Must return at least one question');
  assert(questions[0].includes("pet"), 'First question should be the real question');
});

suite.test('getSecurityQuestions: unknown username returns placeholder questions (not an error)', async () => {
  stubRepos();
  await userRepo.clear();

  let threw = false;
  let result;
  try {
    result = await AuthService.getSecurityQuestions('nobody_exists_here');
  } catch (e) {
    threw = true;
  }

  assert(!threw, 'Must NOT throw for unknown username — would leak existence');
  assert(Array.isArray(result), 'Must return an array of placeholder questions');
  assert(result.length > 0, 'Placeholder questions array must not be empty');
});

suite.test('getSecurityQuestions: known vs unknown return same type (array, no error)', async () => {
  stubRepos();
  await userRepo.clear();
  await makeUser('enum_known_2');

  const knownResult   = await AuthService.getSecurityQuestions('enum_known_2');
  const unknownResult = await AuthService.getSecurityQuestions('enum_unknown_2');

  assert(Array.isArray(knownResult),   'Known user: must return array');
  assert(Array.isArray(unknownResult), 'Unknown user: must return array (not throw)');
});

suite.test('recoverPassword: unknown username throws generic "Incorrect security answers" error', async () => {
  stubRepos();
  await userRepo.clear();

  const err = await assertThrowsAsync(
    () => AuthService.recoverPassword('ghost_user', ['answer1', 'answer2'], 'NewPass@123!'),
    'AuthenticationError',
  );

  assert(
    !err.message.includes('not found') && !err.message.toLowerCase().includes('invalid username'),
    `Error must NOT reveal username existence. Got: "${err.message}"`,
  );
  assert(
    err.message.includes('Incorrect security answers'),
    `Error must be the generic "Incorrect security answers" message. Got: "${err.message}"`,
  );
});

suite.test('recoverPassword: wrong answers for existing user → same generic error', async () => {
  stubRepos();
  await userRepo.clear();
  await makeUser('enum_recovery_user');

  const err = await assertThrowsAsync(
    () => AuthService.recoverPassword('enum_recovery_user', ['wrong1', 'wrong2'], 'NewPass@123!'),
    'AuthenticationError',
  );

  assert(
    err.message.includes('Incorrect security answers'),
    `Wrong-answer error should match unknown-user error. Got: "${err.message}"`,
  );
});

// ═══════════════════════════════════════════════════════════════
//  SECTION 2 — Pre-Lookup Throttle for Unknown Usernames
// ═══════════════════════════════════════════════════════════════

suite.test('login: unknown username attempt is throttled (error type is AuthenticationError, not exempt)', async () => {
  stubRepos();
  await userRepo.clear();

  // Single attempt with unknown username should return the generic auth error
  const err = await assertThrowsAsync(
    () => AuthService.login('ghost_throttle_single', 'any'),
    'AuthenticationError',
  );
  assertEqual(err.message, 'Invalid username or password',
    'Must return the generic error for unknown username');
});

suite.test('login: repeated unknown username attempts trigger lockout (5-attempt threshold)', async () => {
  stubRepos();
  await userRepo.clear();

  // Use a unique username so prior test attempts don't bleed in
  const username = 'ghost_lockout_test_a';

  // 4 failed attempts — should NOT yet be locked (threshold is 5)
  for (let i = 0; i < 4; i++) {
    const err = await assertThrowsAsync(
      () => AuthService.login(username, 'wrong'),
      'AuthenticationError',
    );
    assertEqual(err.message, 'Invalid username or password',
      `Attempt ${i + 1}: must be AuthenticationError before lockout`);
  }

  // 5th attempt — triggers the lockout
  await assertThrowsAsync(() => AuthService.login(username, 'wrong'));

  // 6th attempt — should now be locked out (RateLimitError)
  const lockErr = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'RateLimitError',
  );
  assert(
    lockErr.message.includes('locked'),
    `6th attempt must throw RateLimitError with "locked" in message. Got: "${lockErr.message}"`,
  );
});

suite.test('login: throttle applies to unknown username the same as a known username', async () => {
  stubRepos();
  await userRepo.clear();

  // Exhaust throttle for an unknown username
  const unknownUser = 'ghost_equiv_unknown';
  for (let i = 0; i < 5; i++) {
    await assertThrowsAsync(() => AuthService.login(unknownUser, 'wrong'));
  }
  const unknownLockErr = await assertThrowsAsync(
    () => AuthService.login(unknownUser, 'wrong'),
    'RateLimitError',
  );

  // Create a real user and exhaust their throttle too
  await makeUser('ghost_equiv_known');
  const knownUser = 'ghost_equiv_known';
  for (let i = 0; i < 5; i++) {
    await assertThrowsAsync(() => AuthService.login(knownUser, 'wrongpassword'));
  }
  const knownLockErr = await assertThrowsAsync(
    () => AuthService.login(knownUser, 'wrongpassword'),
    'RateLimitError',
  );

  assertEqual(unknownLockErr.name, knownLockErr.name,
    'Unknown and known username lockout must throw the same error type');
  assert(
    unknownLockErr.message === knownLockErr.message,
    `Error messages must match — unknown: "${unknownLockErr.message}", known: "${knownLockErr.message}"`,
  );
});

suite.test('login: successful login clears the throttle entry', async () => {
  stubRepos();
  await userRepo.clear();

  const password = 'GoodPass@123!';
  const user = await makeUser('throttle_clear_user', password);

  // Cause 3 failed attempts to build up throttle state
  for (let i = 0; i < 3; i++) {
    await assertThrowsAsync(() => AuthService.login('throttle_clear_user', 'wrong'));
  }

  // Successful login — should clear the throttle
  const result = await AuthService.login('throttle_clear_user', password);
  assert(result.session, 'Successful login must return a session');

  // Now stub the user back (login may have updated it)
  // Verify a fresh login attempt after success is NOT immediately locked
  const freshErr = await assertThrowsAsync(
    () => AuthService.login('throttle_clear_user', 'wrong'),
    'AuthenticationError',
  );
  assertEqual(freshErr.message, 'Invalid username or password',
    'After successful login, next failed attempt should NOT be locked (throttle was cleared)');
});

// ═══════════════════════════════════════════════════════════════
//  SECTION 3 — Consistent Error Responses
// ═══════════════════════════════════════════════════════════════

suite.test('login: wrong password and unknown username return identical error message', async () => {
  stubRepos();
  await userRepo.clear();

  const password = 'RealPass@123!';
  await makeUser('consistent_known_user', password);

  const unknownErr = await assertThrowsAsync(
    () => AuthService.login('consistent_unknown_user', 'anything'),
    'AuthenticationError',
  );

  const wrongPassErr = await assertThrowsAsync(
    () => AuthService.login('consistent_known_user', 'wrongpassword'),
    'AuthenticationError',
  );

  assertEqual(
    unknownErr.message,
    wrongPassErr.message,
    'Unknown username and wrong password must return the same error message',
  );
});

suite.test('no raw "User not found" message anywhere in getSecurityQuestions response', async () => {
  stubRepos();
  await userRepo.clear();

  // Attempt to get questions for a non-existent user
  let threw = false;
  let result;
  try {
    result = await AuthService.getSecurityQuestions('enum_leak_check');
  } catch (e) {
    threw = true;
    assert(
      !e.message.toLowerCase().includes('not found'),
      `Error must not contain "not found": "${e.message}"`,
    );
  }

  if (!threw) {
    // Returned questions — verify the array doesn't leak existence info
    assert(Array.isArray(result), 'Must be an array');
  }
});

suite.test('no raw "Invalid username" message in recoverPassword for unknown user', async () => {
  stubRepos();
  await userRepo.clear();

  const err = await assertThrowsAsync(
    () => AuthService.recoverPassword('no_such_user_xyz', ['a', 'b'], 'NewPass@123!'),
  );

  assert(
    !err.message.toLowerCase().includes('invalid username'),
    `Must not expose "Invalid username". Got: "${err.message}"`,
  );
});

// ═══════════════════════════════════════════════════════════════
//  SECTION 4 — Throttle Persistence, Cross-Tab, and Expiry
// ═══════════════════════════════════════════════════════════════

suite.test('throttle: persists after simulated reload (reads from backend, not memory)', async () => {
  stubRepos();
  await userRepo.clear();

  // Use a shared persistent backend — simulates the same localStorage across reloads
  const persistentBackend = makeThrottleMemoryBackend();
  _overrideLoginThrottleStorage(persistentBackend);

  const username = 'persist_reload_test';

  // Make 5 failed attempts — reaches lockout threshold, state written to persistentBackend
  for (let i = 0; i < 5; i++) {
    await assertThrowsAsync(() => AuthService.login(username, 'wrong'));
  }

  // Simulate reload: inject the SAME backend again (in-memory module state would reset
  // on real reload, but the backend retains its data — proving reads go through the backend)
  _overrideLoginThrottleStorage(persistentBackend);

  // 6th attempt on the "reloaded" service — must still be locked
  const lockErr = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'RateLimitError',
  );
  assert(lockErr.message.includes('locked'),
    `Must be locked after simulated reload. Got: "${lockErr.message}"`);
  assert(lockErr.details?.retryAfter > 0,
    'retryAfter must be positive');
});

suite.test('throttle: pre-populated backend (simulating pre-existing locked state) is honored', async () => {
  stubRepos();
  await userRepo.clear();

  // Pre-populate the backend as if a previous session already locked the account
  const backend = makeThrottleMemoryBackend();
  backend.write({
    'prepop_locked_user': {
      attempts: 0,
      windowStart: null,
      lockUntil: now() + FIFTEEN_MINUTES_MS, // active lockout
    },
  });
  _overrideLoginThrottleStorage(backend);

  // First login attempt in this "session" must be throttled immediately
  const lockErr = await assertThrowsAsync(
    () => AuthService.login('prepop_locked_user', 'any'),
    'RateLimitError',
  );
  assert(lockErr.message.includes('locked'),
    `Pre-existing lockout must be enforced. Got: "${lockErr.message}"`);
});

suite.test('throttle: cross-tab — shared backend means both tabs see same state', async () => {
  stubRepos();
  await userRepo.clear();

  // Shared backend represents shared localStorage between tabs
  const sharedBackend = makeThrottleMemoryBackend();

  // Tab A: make 5 failed attempts
  _overrideLoginThrottleStorage(sharedBackend);
  const username = 'cross_tab_user';
  for (let i = 0; i < 5; i++) {
    await assertThrowsAsync(() => AuthService.login(username, 'wrong'));
  }

  // Tab B: inject the same backend (same localStorage) — must see the lockout
  _overrideLoginThrottleStorage(sharedBackend);
  const lockErr = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'RateLimitError',
  );
  assert(lockErr.message.includes('locked'),
    `Tab B must see Tab A's lockout via shared storage. Got: "${lockErr.message}"`);
});

suite.test('throttle: lockout entry with expired lockUntil is cleared (no false lockout)', async () => {
  stubRepos();
  await userRepo.clear();

  const username = 'expired_lock_user';

  // Pre-populate with an already-expired lockout
  const backend = makeThrottleMemoryBackend();
  backend.write({
    [username]: {
      attempts: 0,
      windowStart: null,
      lockUntil: now() - 1, // expired 1ms ago
    },
  });
  _overrideLoginThrottleStorage(backend);

  // Attempt should NOT be rate-limited (lockout expired) — falls through to auth error
  const err = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'AuthenticationError', // user not found, but NOT RateLimitError
  );
  assertEqual(err.message, 'Invalid username or password',
    `Expired lockout must not block login. Got: "${err.message}"`);
});

suite.test('throttle: attempt window expiry resets counter (no lockout after gap)', async () => {
  stubRepos();
  await userRepo.clear();

  const username = 'window_reset_user';

  // Pre-populate with 4 attempts whose window has already expired (> 10 min ago)
  const backend = makeThrottleMemoryBackend();
  backend.write({
    [username]: {
      attempts: 4,
      windowStart: now() - TEN_MINUTES_MS - 1, // window expired
      lockUntil: null,
    },
  });
  _overrideLoginThrottleStorage(backend);

  // One more attempt: window is expired so counter resets. Should get auth error, not lockout.
  const err = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
  );
  assert(err.name !== 'RateLimitError',
    `After window expiry a single attempt must not lock out. Got: "${err.name}: ${err.message}"`);
});

suite.test('throttle: stale entries are pruned during login', async () => {
  stubRepos();
  await userRepo.clear();

  const backend = makeThrottleMemoryBackend();

  // Write two stale entries: one expired lock, one expired window
  backend.write({
    'stale_locked': { attempts: 0, windowStart: null, lockUntil: now() - 1000 },
    'stale_window': { attempts: 3, windowStart: now() - TEN_MINUTES_MS - 1, lockUntil: null },
    'active_locked': { attempts: 0, windowStart: null, lockUntil: now() + FIFTEEN_MINUTES_MS },
  });
  _overrideLoginThrottleStorage(backend);

  // Trigger a login attempt (any username) — prune runs during this call
  await assertThrowsAsync(() => AuthService.login('trigger_prune', 'any'));

  const remaining = backend.read();
  assert(!remaining['stale_locked'], 'Expired lock entry must be pruned');
  assert(!remaining['stale_window'], 'Expired window entry must be pruned');
  assert(remaining['active_locked'], 'Active lock entry must be kept');
});

suite.test('throttle: corrupted entry does not bypass lockout (fail-safe)', async () => {
  stubRepos();
  await userRepo.clear();

  const username = 'corrupt_entry_user';

  // Pre-populate with a corrupted (non-object) entry — simulates storage tampering
  const backend = makeThrottleMemoryBackend();
  backend.write({ [username]: 'corrupted-string-value' });
  _overrideLoginThrottleStorage(backend);

  // First attempt should NOT crash and should NOT be rate-limited
  const err1 = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'AuthenticationError',
  );
  assertEqual(err1.message, 'Invalid username or password',
    'Corrupted entry must be treated as fresh state, not bypass throttle');

  // Verify the corrupted entry was replaced with a valid one
  const stored = backend.read();
  assert(stored[username] && typeof stored[username] === 'object',
    'Corrupted entry must be replaced with a valid throttle object');
  assertEqual(stored[username].attempts, 1, 'First real attempt must be recorded');
});

suite.test('throttle: corrupted entry is pruned during prune pass', async () => {
  stubRepos();
  await userRepo.clear();

  const backend = makeThrottleMemoryBackend();
  backend.write({
    'corrupt1': 42,
    'corrupt2': null,
    'corrupt3': [1,2,3],
    'valid_locked': { attempts: 0, windowStart: null, lockUntil: now() + FIFTEEN_MINUTES_MS },
  });
  _overrideLoginThrottleStorage(backend);

  // Trigger prune via any login attempt
  await assertThrowsAsync(() => AuthService.login('prune_trigger', 'any'));

  const remaining = backend.read();
  assert(!remaining['corrupt1'], 'Numeric corrupted entry must be pruned');
  assert(!remaining['corrupt2'], 'Null corrupted entry must be pruned');
  assert(!remaining['corrupt3'], 'Array corrupted entry must be pruned');
  assert(remaining['valid_locked'], 'Valid active lock must be kept');
});

suite.test('throttle: lockout enforced after exactly MAX_LOGIN_ATTEMPTS (5)', async () => {
  stubRepos();
  await userRepo.clear();

  const username = 'exact_threshold_user';

  // Attempts 1-4: AuthenticationError
  for (let i = 1; i <= 4; i++) {
    const err = await assertThrowsAsync(
      () => AuthService.login(username, 'wrong'),
    );
    assert(err.name !== 'RateLimitError',
      `Attempt ${i} must not be a RateLimitError yet`);
  }

  // Attempt 5: triggers lockout (still returns authN error or rate limit — the lock is SET)
  await assertThrowsAsync(() => AuthService.login(username, 'wrong'));

  // Attempt 6: must be RateLimitError
  const lockErr = await assertThrowsAsync(
    () => AuthService.login(username, 'wrong'),
    'RateLimitError',
  );
  assert(lockErr.message.includes('locked'),
    `6th attempt must be RateLimitError. Got: "${lockErr.message}"`);
  assert(lockErr.details?.retryAfter > 0, 'retryAfter must indicate remaining lockout time');
});

// ── Run ──
const results = await suite.run();
process.exit(results.failed > 0 ? 1 : 0);
