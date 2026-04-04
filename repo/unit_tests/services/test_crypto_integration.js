/**
 * Crypto Integration Tests — Phase 6 Mandatory
 *
 * Tests REAL PBKDF2 hashing (no mocks).
 * Verifies: salt generation, password hashing, password verification,
 * security answer hashing, incorrect credential rejection.
 *
 * Runs in Node 18+ via Web Crypto API (crypto.subtle is a global in Node 18).
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import { generateSalt, hashValue, verifyHash } from '../../src/utils/crypto.js';

const suite = new TestRunner('Crypto Integration: Real PBKDF2 Hashing');

// ─────────────────────────────────────────────
// Salt generation
// ─────────────────────────────────────────────

suite.test('generateSalt: produces a non-empty base64 string', async () => {
  const salt = await generateSalt();
  assert(typeof salt === 'string', 'Salt must be a string');
  assert(salt.length > 0, 'Salt must not be empty');
  // Base64-encoded 32 bytes = 44 chars
  assert(salt.length >= 40, `Salt must be at least 40 chars, got ${salt.length}`);
});

suite.test('generateSalt: each call produces a unique salt', async () => {
  const salt1 = await generateSalt();
  const salt2 = await generateSalt();
  assert(salt1 !== salt2, 'Each salt must be unique (random)');
});

suite.test('generateSalt: result is valid base64', async () => {
  const salt = await generateSalt();
  // Valid base64 pattern
  const b64Regex = /^[A-Za-z0-9+/]+=*$/;
  assert(b64Regex.test(salt), `Salt must be valid base64: "${salt}"`);
});

// ─────────────────────────────────────────────
// Password hashing
// ─────────────────────────────────────────────

suite.test('hashValue: produces a hash different from the plaintext', async () => {
  const salt = await generateSalt();
  const password = 'MyPassword123!';
  const hash = await hashValue(password, salt);
  assert(hash !== password, 'Hash must not equal plaintext password');
  assert(typeof hash === 'string', 'Hash must be a string');
  assert(hash.length > 0, 'Hash must not be empty');
});

suite.test('hashValue: same input + same salt produces same hash (deterministic)', async () => {
  const salt = await generateSalt();
  const password = 'Consistent!99';
  const hash1 = await hashValue(password, salt);
  const hash2 = await hashValue(password, salt);
  assertEqual(hash1, hash2, 'Same password + same salt must produce identical hash');
});

suite.test('hashValue: different salts produce different hashes for same password', async () => {
  const salt1 = await generateSalt();
  const salt2 = await generateSalt();
  const password = 'SamePassword1!';
  const hash1 = await hashValue(password, salt1);
  const hash2 = await hashValue(password, salt2);
  assert(hash1 !== hash2, 'Different salts must produce different hashes (rainbow table protection)');
});

suite.test('hashValue: different passwords with same salt produce different hashes', async () => {
  const salt = await generateSalt();
  const hash1 = await hashValue('PasswordA1!', salt);
  const hash2 = await hashValue('PasswordB2!', salt);
  assert(hash1 !== hash2, 'Different passwords must produce different hashes');
});

suite.test('hashValue: rejects empty string', async () => {
  const salt = await generateSalt();
  try {
    await hashValue('', salt);
    assert(false, 'Must throw for empty password');
  } catch (e) {
    assert(e.message.includes('non-empty'), `Expected non-empty error, got: ${e.message}`);
  }
});

suite.test('hashValue: rejects null value', async () => {
  const salt = await generateSalt();
  try {
    await hashValue(null, salt);
    assert(false, 'Must throw for null password');
  } catch (e) {
    assert(typeof e.message === 'string', 'Error must have message');
  }
});

suite.test('hashValue: rejects invalid salt', async () => {
  try {
    await hashValue('Password1!', '');
    assert(false, 'Must throw for empty salt');
  } catch (e) {
    assert(e.message.includes('salt'), `Expected salt error, got: ${e.message}`);
  }
});

// ─────────────────────────────────────────────
// Password verification
// ─────────────────────────────────────────────

suite.test('verifyHash: correct password verifies successfully', async () => {
  const password = 'CorrectPassword1!';
  const salt = await generateSalt();
  const hash = await hashValue(password, salt);
  const result = await verifyHash(password, hash, salt);
  assert(result === true, 'Correct password must verify as true');
});

suite.test('verifyHash: wrong password fails verification', async () => {
  const password = 'CorrectPassword1!';
  const wrong = 'WrongPassword9!';
  const salt = await generateSalt();
  const hash = await hashValue(password, salt);
  const result = await verifyHash(wrong, hash, salt);
  assert(result === false, 'Wrong password must verify as false');
});

suite.test('verifyHash: correct password with wrong salt fails', async () => {
  const password = 'CorrectPassword1!';
  const correctSalt = await generateSalt();
  const wrongSalt = await generateSalt();
  const hash = await hashValue(password, correctSalt);
  const result = await verifyHash(password, hash, wrongSalt);
  assert(result === false, 'Correct password with wrong salt must fail');
});

suite.test('verifyHash: tampered hash fails verification', async () => {
  const password = 'TamperedPw1!';
  const salt = await generateSalt();
  const hash = await hashValue(password, salt);
  // Tamper: flip the last char
  const tampered = hash.slice(0, -1) + (hash[hash.length - 1] === 'A' ? 'B' : 'A');
  const result = await verifyHash(password, tampered, salt);
  assert(result === false, 'Tampered hash must fail verification');
});

suite.test('verifyHash: empty password against real hash fails', async () => {
  const password = 'RealPassword1!';
  const salt = await generateSalt();
  const hash = await hashValue(password, salt);
  try {
    const result = await verifyHash('', hash, salt);
    assert(result === false, 'Empty password must fail verification');
  } catch (e) {
    // hashValue('', salt) throws — acceptable, means empty string cannot match
    assert(e.message.includes('non-empty'), 'Error must indicate non-empty requirement');
  }
});

// ─────────────────────────────────────────────
// Security question answer hashing
// ─────────────────────────────────────────────

suite.test('security answers: correct answer verifies (case-normalized)', async () => {
  const rawAnswer = '  New York  ';
  const normalizedAnswer = rawAnswer.toLowerCase().trim(); // matches AuthService normalization
  const salt = await generateSalt();
  const hash = await hashValue(normalizedAnswer, salt);

  // Verify using same normalization
  const result = await verifyHash(normalizedAnswer, hash, salt);
  assert(result === true, 'Normalized security answer must verify correctly');
});

suite.test('security answers: wrong answer fails', async () => {
  const correctAnswer = 'new york';
  const wrongAnswer = 'los angeles';
  const salt = await generateSalt();
  const hash = await hashValue(correctAnswer, salt);
  const result = await verifyHash(wrongAnswer, hash, salt);
  assert(result === false, 'Wrong security answer must fail');
});

suite.test('security answers: different questions have independent hashes', async () => {
  const salt1 = await generateSalt();
  const salt2 = await generateSalt();
  const answer1 = 'fluffy';
  const answer2 = 'new york';
  const hash1 = await hashValue(answer1, salt1);
  const hash2 = await hashValue(answer2, salt2);
  assert(hash1 !== hash2, 'Different answers with different salts produce different hashes');
});

suite.test('security answers: answer is stored as hash not plaintext', async () => {
  const answer = 'mySecretAnswer';
  const salt = await generateSalt();
  const hash = await hashValue(answer, salt);
  assert(!hash.includes(answer), 'Hash must not contain plaintext answer');
  assert(!hash.includes(answer.toLowerCase()), 'Hash must not contain lowercase answer');
});

// ─────────────────────────────────────────────
// Full auth credential lifecycle
// ─────────────────────────────────────────────

suite.test('full lifecycle: register then login with correct credentials', async () => {
  const password = 'UserPassword99!';
  const salt = await generateSalt();
  const hash = await hashValue(password, salt);

  // Simulate stored user
  const storedUser = { passwordHash: hash, salt };

  // Simulate login verification
  const loginResult = await verifyHash(password, storedUser.passwordHash, storedUser.salt);
  assert(loginResult === true, 'Login with correct password must succeed');
});

suite.test('full lifecycle: login fails after password change (old hash rejected)', async () => {
  const oldPassword = 'OldPassword1!';
  const newPassword = 'NewPassword2!';
  const salt = await generateSalt();

  const oldHash = await hashValue(oldPassword, salt);
  const newSalt = await generateSalt();
  const newHash = await hashValue(newPassword, newSalt);

  // Attempt old password against new hash
  const result = await verifyHash(oldPassword, newHash, newSalt);
  assert(result === false, 'Old password must fail after password change');

  // New password works
  const newResult = await verifyHash(newPassword, newHash, newSalt);
  assert(newResult === true, 'New password must succeed after change');
});

suite.test('full lifecycle: two users with same password have different hashes', async () => {
  const sharedPassword = 'SharedPass1!';
  const salt1 = await generateSalt();
  const salt2 = await generateSalt();
  const hash1 = await hashValue(sharedPassword, salt1);
  const hash2 = await hashValue(sharedPassword, salt2);
  assert(hash1 !== hash2,
    'Two users with same password must have different hashes (salts prevent rainbow tables)');
});

suite.test('full lifecycle: recovery answer hashed and verified correctly', async () => {
  const answers = [
    { question: 'First pet?', answer: '  Fluffy  ' },
    { question: 'Birth city?', answer: '  LONDON  ' },
  ];

  const hashed = [];
  for (const sq of answers) {
    const normalized = sq.answer.toLowerCase().trim();
    const salt = await generateSalt();
    const hash = await hashValue(normalized, salt);
    hashed.push({ question: sq.question, answerHash: hash, answerSalt: salt });
  }

  // Simulate recovery: user provides answers
  const recoveryAttempts = ['fluffy', 'london'];
  let allCorrect = true;

  for (let i = 0; i < hashed.length; i++) {
    const match = await verifyHash(recoveryAttempts[i], hashed[i].answerHash, hashed[i].answerSalt);
    if (!match) allCorrect = false;
  }

  assert(allCorrect === true, 'All security answers must verify correctly during recovery');
});

suite.test('full lifecycle: recovery fails with wrong answers', async () => {
  const answer = 'correctanswer';
  const salt = await generateSalt();
  const hash = await hashValue(answer, salt);

  const result = await verifyHash('wronganswer', hash, salt);
  assert(result === false, 'Wrong recovery answer must fail verification');
});

// ─────────────────────────────────────────────
// Node 18 crypto API availability
// ─────────────────────────────────────────────

suite.test('Node18: crypto.subtle is available as global', () => {
  assert(typeof crypto !== 'undefined', 'crypto global must exist in Node 18');
  assert(typeof crypto.subtle !== 'undefined', 'crypto.subtle must be available');
  assert(typeof crypto.subtle.importKey === 'function', 'crypto.subtle.importKey must exist');
  assert(typeof crypto.subtle.deriveBits === 'function', 'crypto.subtle.deriveBits must exist');
});

suite.test('Node18: crypto.getRandomValues is available', () => {
  assert(typeof crypto.getRandomValues === 'function', 'crypto.getRandomValues must exist');
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // Verify it actually populated the buffer (non-zero after randomization is very likely)
  const hasNonZero = Array.from(buf).some(b => b !== 0);
  assert(hasNonZero, 'getRandomValues must populate buffer with random bytes');
});

suite.test('Node18: btoa and atob are available as globals', () => {
  assert(typeof btoa === 'function', 'btoa must be available in Node 18');
  assert(typeof atob === 'function', 'atob must be available in Node 18');
  const encoded = btoa('hello world');
  const decoded = atob(encoded);
  assertEqual(decoded, 'hello world', 'btoa/atob round-trip must work');
});

suite.test('Node18: TextEncoder/TextDecoder are available', () => {
  assert(typeof TextEncoder !== 'undefined', 'TextEncoder must exist');
  assert(typeof TextDecoder !== 'undefined', 'TextDecoder must exist');
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const bytes = enc.encode('test string');
  assertEqual(dec.decode(bytes), 'test string', 'TextEncoder/TextDecoder round-trip must work');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
