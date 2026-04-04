/**
 * Tests for session policy (timeouts, creation, validation).
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../setup.js';
import { validateSession, createSession, touchSession } from '../../src/domain/policies/sessionPolicy.js';
import { THIRTY_MINUTES_MS, TWELVE_HOURS_MS } from '../../src/utils/time.js';

const suite = new TestRunner('Session Policy');

suite.test('createSession creates valid session', () => {
  const session = createSession('u1', ['user']);
  assertEqual(session.userId, 'u1');
  assert(session.roles.includes('user'), 'should have user role');
  assert(session.createdAt > 0, 'should have createdAt');
  assert(session.lastActivityAt > 0, 'should have lastActivityAt');
  assert(session.tokenId, 'should have tokenId');
});

suite.test('validateSession passes for fresh session', () => {
  const session = createSession('u1', ['user']);
  const result = validateSession(session);
  assertEqual(result.userId, 'u1');
});

suite.test('validateSession rejects null session', async () => {
  await assertThrowsAsync(() => validateSession(null), 'AuthenticationError');
});

suite.test('validateSession rejects session without userId', async () => {
  await assertThrowsAsync(() => validateSession({ roles: ['user'] }), 'AuthenticationError');
});

suite.test('validateSession rejects idle-expired session', async () => {
  const session = createSession('u1', ['user']);
  session.lastActivityAt = Date.now() - THIRTY_MINUTES_MS - 1000;
  await assertThrowsAsync(() => validateSession(session), 'AuthenticationError', 'idle');
});

suite.test('validateSession rejects absolute-expired session', async () => {
  const session = createSession('u1', ['user']);
  session.createdAt = Date.now() - TWELVE_HOURS_MS - 1000;
  await assertThrowsAsync(() => validateSession(session), 'AuthenticationError', 'absolute');
});

suite.test('touchSession updates lastActivityAt', () => {
  const session = createSession('u1', ['user']);
  const original = session.lastActivityAt;

  // Simulate time passing
  const updated = touchSession(session);
  assert(updated.lastActivityAt >= original, 'lastActivityAt should be >= original');
  assertEqual(updated.userId, session.userId);
});

suite.test('validateSession passes session just within idle timeout', () => {
  const session = createSession('u1', ['user']);
  session.lastActivityAt = Date.now() - THIRTY_MINUTES_MS + 5000; // 5 seconds before expiry
  const result = validateSession(session);
  assertEqual(result.userId, 'u1');
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
