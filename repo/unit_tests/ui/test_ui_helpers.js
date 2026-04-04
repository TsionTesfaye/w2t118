/**
 * UI Helper Logic Tests
 *
 * Covers the Node.js-testable helper functions backing these UI features:
 *   - isVideoMedia   — media gallery type detection
 *   - AuthService.getSecurityQuestions — recovery flow question fetch
 *   - Avatar upload validation — size & type guard logic
 *
 * Note: sanitizeHtml uses browser DOM and cannot run in Node; it is exercised
 * by the E2E build and manual testing.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../setup.js';
import { AuthService } from '../../src/services/AuthService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('UI Helpers: media detection, recovery questions, avatar validation');

// ─────────────────────────────────────────────
// isVideoMedia — mirrors ListingDetailView.vue implementation
// ─────────────────────────────────────────────

function isVideoMedia(item) {
  if (item.type?.startsWith('video/')) return true;
  const src = item.url || item.data || '';
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(src);
}

suite.test('isVideoMedia: detects video by MIME type', () => {
  assert(isVideoMedia({ type: 'video/mp4', url: 'clip.mp4' }), 'video/mp4 must be detected');
  assert(isVideoMedia({ type: 'video/webm', url: 'clip.webm' }), 'video/webm must be detected');
});

suite.test('isVideoMedia: detects video by file extension when type absent', () => {
  assert(isVideoMedia({ url: 'https://cdn.example.com/clip.mp4' }), '.mp4 URL must be detected');
  assert(isVideoMedia({ data: 'blob:clip.webm' }), '.webm data must be detected');
  assert(isVideoMedia({ url: '/videos/intro.mov' }), '.mov must be detected');
  assert(isVideoMedia({ url: '/videos/demo.ogg' }), '.ogg must be detected');
});

suite.test('isVideoMedia: does not misclassify images', () => {
  assert(!isVideoMedia({ type: 'image/jpeg', url: 'photo.jpg' }), 'image/jpeg must not be video');
  assert(!isVideoMedia({ url: 'photo.png' }), '.png URL must not be video');
  assert(!isVideoMedia({ url: 'photo.gif' }), '.gif URL must not be video');
  assert(!isVideoMedia({}), 'empty item must not be video');
});

suite.test('isVideoMedia: handles query strings and fragments in URL', () => {
  assert(isVideoMedia({ url: 'https://cdn.example.com/clip.mp4?t=5' }), '.mp4 with query string');
  assert(isVideoMedia({ url: 'https://cdn.example.com/clip.webm#t=1' }), '.webm with fragment');
});

// ─────────────────────────────────────────────
// Avatar upload validation — mirrors handleAvatarChange in UserCenterView.vue
// ─────────────────────────────────────────────

function validateAvatarFile(file) {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Only image files are allowed' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: 'Image must be 2 MB or less' };
  }
  return { ok: true, error: '' };
}

suite.test('validateAvatarFile: accepts valid JPEG within size limit', () => {
  const result = validateAvatarFile({ type: 'image/jpeg', size: 500_000 });
  assert(result.ok, 'Valid JPEG under 2 MB must be accepted');
  assertEqual(result.error, '', 'No error for valid file');
});

suite.test('validateAvatarFile: rejects non-image file types', () => {
  const result = validateAvatarFile({ type: 'video/mp4', size: 100_000 });
  assert(!result.ok, 'Video file must be rejected');
  assert(result.error.length > 0, 'Error message must be set');
});

suite.test('validateAvatarFile: rejects images exceeding 2 MB', () => {
  const result = validateAvatarFile({ type: 'image/png', size: 3 * 1024 * 1024 });
  assert(!result.ok, 'Image over 2 MB must be rejected');
  assert(result.error.length > 0, 'Error message must be set');
});

suite.test('validateAvatarFile: accepts PNG and GIF', () => {
  assert(validateAvatarFile({ type: 'image/png', size: 100_000 }).ok, 'PNG must be accepted');
  assert(validateAvatarFile({ type: 'image/gif', size: 100_000 }).ok, 'GIF must be accepted');
});

// ─────────────────────────────────────────────
// AuthService.getSecurityQuestions — recovery flow
// ─────────────────────────────────────────────

function setupUserRepo() {
  const userRepo = new InMemoryRepository();
  repos.userRepository.getByUsername = (username) => userRepo.getOneByIndex('username', username);
  repos.userRepository.getById       = (id) => userRepo.getById(id);
  repos.userRepository.create        = (u) => userRepo.create(u);
  repos.userRepository.update        = (u) => userRepo.update(u);
  return userRepo;
}

async function seedUser(userRepo, username) {
  const { hashValue, generateSalt } = await import('../../src/utils/crypto.js');
  const { generateId } = await import('../../src/utils/id.js');

  const salt = await generateSalt();
  const passwordHash = await hashValue('TestPassw0rd!', salt);
  const asSalt1 = await generateSalt();
  const asHash1 = await hashValue('fluffy', asSalt1);
  const asSalt2 = await generateSalt();
  const asHash2 = await hashValue('springfield', asSalt2);

  const user = {
    id: generateId(),
    username,
    passwordHash,
    salt,
    roles: [Roles.USER],
    displayName: 'Test User',
    avatar: null,
    bio: '',
    securityQuestions: [
      { question: "What was your first pet's name?", answerHash: asHash1, answerSalt: asSalt1 },
      { question: 'What city were you born in?',     answerHash: asHash2, answerSalt: asSalt2 },
    ],
    failedAttempts: 0,
    lockoutUntil: null,
    recoveryAttempts: 0,
    recoveryLockoutUntil: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await userRepo.create(user);
  return user;
}

suite.test('getSecurityQuestions: returns question text for valid username', async () => {
  const userRepo = setupUserRepo();
  await seedUser(userRepo, 'sq-user-1');

  const questions = await AuthService.getSecurityQuestions('sq-user-1');

  assert(Array.isArray(questions), 'Must return an array');
  assertEqual(questions.length, 2, 'Must return both questions');
  assert(typeof questions[0] === 'string' && questions[0].length > 0, 'Q1 must be non-empty string');
  assert(typeof questions[1] === 'string' && questions[1].length > 0, 'Q2 must be non-empty string');
  assert(questions[0].includes('pet'),  'Q1 text must match what was stored');
  assert(questions[1].includes('city'), 'Q2 text must match what was stored');
});

suite.test('getSecurityQuestions: does not expose answerHash or answerSalt', async () => {
  const userRepo = setupUserRepo();
  await seedUser(userRepo, 'sq-user-2');

  const questions = await AuthService.getSecurityQuestions('sq-user-2');

  for (const q of questions) {
    assertEqual(typeof q, 'string', 'Each entry must be a plain string, not an object');
    assert(!q.toLowerCase().includes('hash'), 'Must not expose hash data');
    assert(!q.toLowerCase().includes('salt'), 'Must not expose salt data');
  }
});

suite.test('getSecurityQuestions: unknown username returns placeholder questions (enumeration-safe)', async () => {
  setupUserRepo(); // fresh empty repo — user does not exist
  let threw = false;
  let result;
  try {
    result = await AuthService.getSecurityQuestions('no-such-user-xyz');
  } catch {
    threw = true;
  }
  assert(!threw, 'Must NOT throw for unknown username — throwing leaks existence');
  assert(Array.isArray(result), 'Must return an array of placeholder questions');
  assert(result.length > 0, 'Placeholder array must not be empty');
  for (const q of result) {
    assertEqual(typeof q, 'string', 'Each placeholder must be a plain string');
    assert(!q.toLowerCase().includes('not found'), 'Must not mention "not found"');
  }
});

suite.test('getSecurityQuestions: throws ValidationError when username is empty', async () => {
  await assertThrowsAsync(
    () => AuthService.getSecurityQuestions(''),
    'ValidationError',
    'Username is required',
  );
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
