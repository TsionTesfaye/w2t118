/**
 * Session Policy — enforces session lifecycle rules.
 * Idle timeout: 30 minutes
 * Absolute timeout: 12 hours
 */

import { AuthenticationError } from '../../utils/errors.js';
import { isExpired, THIRTY_MINUTES_MS, TWELVE_HOURS_MS, now } from '../../utils/time.js';

/**
 * Validate that a session is still active.
 * @param {Object} session - { userId, createdAt, lastActivityAt }
 * @throws {AuthenticationError} if session is expired
 * @returns {Object} session (for chaining)
 */
export function validateSession(session) {
  if (!session || !session.userId) {
    throw new AuthenticationError('No active session');
  }

  if (!session.createdAt) {
    throw new AuthenticationError('Invalid session: missing creation time');
  }

  // Absolute timeout: 12 hours from creation
  if (isExpired(session.createdAt, TWELVE_HOURS_MS)) {
    throw new AuthenticationError('Session expired (absolute timeout)');
  }

  // Idle timeout: 30 minutes from last activity
  if (session.lastActivityAt && isExpired(session.lastActivityAt, THIRTY_MINUTES_MS)) {
    throw new AuthenticationError('Session expired (idle timeout)');
  }

  return session;
}

/**
 * Create a new session object.
 */
export function createSession(userId, roles) {
  return {
    userId,
    roles: Array.isArray(roles) ? [...roles] : [roles],
    createdAt: now(),
    lastActivityAt: now(),
    tokenId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  };
}

/**
 * Touch session to update last activity time.
 */
export function touchSession(session) {
  return {
    ...session,
    lastActivityAt: now(),
  };
}
