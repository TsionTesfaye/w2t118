/**
 * Auth Service — registration, login, session, recovery.
 * Enforces: password rules, rate limiting, lockout, session timeouts.
 */

import { userRepository, sessionRepository } from '../repositories/index.js';
import { LocalStorageAdapter, StorageKeys } from '../repositories/localStorageAdapter.js';
import { LoginThrottleStorage } from '../utils/loginThrottleStorage.js';
import { generateId } from '../utils/id.js';
import { generateSalt, hashValue, verifyHash } from '../utils/crypto.js';
import { now, isExpired, TEN_MINUTES_MS, FIFTEEN_MINUTES_MS } from '../utils/time.js';
import { validatePassword, validateUsername, validateSecurityQuestions, LIMITS } from '../domain/validation/rules.js';
import { createSession, validateSession, touchSession } from '../domain/policies/sessionPolicy.js';
import { AuthenticationError, RateLimitError, ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { Roles } from '../domain/enums/roles.js';

// ── Pre-lookup login throttle ──────────────────────────────────────────────────
//
// State is persisted via LoginThrottleStorage (localStorage in the browser,
// in-memory object in Node.js) so that:
//   • lockouts survive page reloads
//   • all tabs share the same throttle state (same localStorage key)
//
// Applies BEFORE user lookup so unknown usernames are rate-limited
// identically to existing ones, preventing username enumeration.

function _isValidThrottleEntry(entry) {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry);
}

function _checkLoginThrottle(username) {
  const key = username.toLowerCase().trim();
  const entry = LoginThrottleStorage.get(key);
  if (!entry) return;
  // Corrupted entry (primitive, array, etc.) — delete and start fresh
  if (!_isValidThrottleEntry(entry)) {
    LoginThrottleStorage.delete(key);
    return;
  }
  const currentTime = now();
  if (entry.lockUntil) {
    if (currentTime < entry.lockUntil) {
      const remainingMs = entry.lockUntil - currentTime;
      throw new RateLimitError('Account is locked due to too many failed attempts', remainingMs);
    }
    // Lockout expired — remove entry so next attempt starts a fresh window
    LoginThrottleStorage.delete(key);
  }
}

function _recordLoginThrottle(username) {
  const key = username.toLowerCase().trim();
  const currentTime = now();
  let entry = LoginThrottleStorage.get(key);
  // Start fresh on missing or corrupted data
  if (!_isValidThrottleEntry(entry)) {
    entry = { attempts: 0, windowStart: currentTime, lockUntil: null };
  }

  // Reset window if the 10-minute attempt window has elapsed
  if (entry.windowStart && isExpired(entry.windowStart, TEN_MINUTES_MS)) {
    entry = { attempts: 0, windowStart: currentTime, lockUntil: null };
  }

  entry.attempts = (entry.attempts || 0) + 1;

  if (entry.attempts >= LIMITS.MAX_LOGIN_ATTEMPTS) {
    entry.lockUntil = currentTime + FIFTEEN_MINUTES_MS;
    entry.attempts = 0;
    entry.windowStart = null;
  }

  LoginThrottleStorage.set(key, entry);
}

/**
 * Remove all throttle entries whose lockout and attempt window have both
 * expired. Called on each login attempt to prevent unbounded storage growth.
 */
function _pruneStaleThrottleEntries() {
  const currentTime = now();
  const all = LoginThrottleStorage.getAll();
  const pruned = {};
  for (const [key, entry] of Object.entries(all)) {
    // Drop corrupted entries
    if (!_isValidThrottleEntry(entry)) continue;
    // Keep active lockouts
    if (entry.lockUntil && currentTime < entry.lockUntil) {
      pruned[key] = entry;
      continue;
    }
    // Keep entries still within their attempt window (even if no lock yet)
    if (!entry.lockUntil && entry.windowStart && !isExpired(entry.windowStart, TEN_MINUTES_MS)) {
      pruned[key] = entry;
    }
    // Otherwise drop — lockout expired or window expired
  }
  LoginThrottleStorage.replaceAll(pruned);
}

export const AuthService = {
  /**
   * Register a new user.
   */
  async register({ username, password, displayName, securityQuestions }) {
    // Validate inputs
    validateUsername(username);
    validatePassword(password);
    if (!displayName || displayName.trim().length === 0) {
      throw new ValidationError('Display name is required', { displayName: 'Required' });
    }
    validateSecurityQuestions(securityQuestions);

    // Check username uniqueness
    const existing = await userRepository.getByUsername(username);
    if (existing) {
      throw new ValidationError('Username already taken', { username: 'Already exists' });
    }

    // Hash password
    const salt = await generateSalt();
    const passwordHash = await hashValue(password, salt);

    // Hash security question answers
    const hashedQuestions = [];
    for (const sq of securityQuestions) {
      const answerSalt = await generateSalt();
      const answerHash = await hashValue(sq.answer.toLowerCase().trim(), answerSalt);
      hashedQuestions.push({
        question: sq.question,
        answerHash,
        answerSalt,
      });
    }

    const user = {
      id: generateId(),
      username,
      passwordHash,
      salt,
      roles: [Roles.USER],
      displayName: displayName.trim(),
      avatar: null,
      bio: '',
      securityQuestions: hashedQuestions,
      notificationPreferences: {
        messages: true,
        moderation: true,
        transactions: true,
        complaints: true,
      },
      failedAttempts: 0,
      failedAttemptWindowStart: null,
      lockoutUntil: null,
      recoveryAttempts: 0,
      recoveryLockoutUntil: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await userRepository.create(user);
    await AuditService.log(user.id, AuditActions.USER_REGISTERED, 'user', user.id);

    // Return sanitized user (no secrets)
    return sanitizeUser(user);
  },

  /**
   * Log in with username and password.
   */
  async login(username, password) {
    if (!username || !password) {
      throw new AuthenticationError('Username and password are required');
    }

    // Pre-lookup throttle — applies to ALL usernames (existing or not).
    // Prevents enumeration via differential throttling behavior.
    // Prune stale entries first to keep storage lean.
    _pruneStaleThrottleEntries();
    _checkLoginThrottle(username);

    const user = await userRepository.getByUsername(username);
    if (!user) {
      // Don't reveal whether username exists; record throttle attempt.
      _recordLoginThrottle(username);
      throw new AuthenticationError('Invalid username or password');
    }

    // Check per-user lockout (for existing users)
    if (user.lockoutUntil && now() < user.lockoutUntil) {
      const remainingMs = user.lockoutUntil - now();
      throw new RateLimitError(
        'Account is locked due to too many failed attempts',
        remainingMs
      );
    }

    // Clear lockout if expired
    if (user.lockoutUntil && now() >= user.lockoutUntil) {
      user.lockoutUntil = null;
      user.failedAttempts = 0;
      user.failedAttemptWindowStart = null;
    }

    // Verify password
    const isValid = await verifyHash(password, user.passwordHash, user.salt);
    if (!isValid) {
      _recordLoginThrottle(username);
      await this._recordFailedAttempt(user);
      throw new AuthenticationError('Invalid username or password');
    }

    // Success — clear throttle entry and reset failure counters
    LoginThrottleStorage.delete(username.toLowerCase().trim());
    user.failedAttempts = 0;
    user.failedAttemptWindowStart = null;
    user.lockoutUntil = null;
    user.updatedAt = now();
    await userRepository.update(user);

    // Create session
    const session = createSession(user.id, user.roles);
    await sessionRepository.update(session); // put = upsert by userId
    LocalStorageAdapter.set(StorageKeys.SESSION, session);

    await AuditService.log(user.id, AuditActions.USER_LOGIN, 'user', user.id);

    return {
      user: sanitizeUser(user),
      session,
    };
  },

  /**
   * Validate and refresh the current session.
   */
  async validateCurrentSession() {
    const session = LocalStorageAdapter.get(StorageKeys.SESSION);
    if (!session) {
      throw new AuthenticationError('No active session');
    }

    // This throws if expired
    validateSession(session);

    // Touch session
    const updated = touchSession(session);
    LocalStorageAdapter.set(StorageKeys.SESSION, updated);
    await sessionRepository.update(updated);

    return updated;
  },

  /**
   * Get the current session without refreshing.
   */
  getCurrentSession() {
    const session = LocalStorageAdapter.get(StorageKeys.SESSION);
    if (!session) return null;
    try {
      validateSession(session);
      return session;
    } catch {
      // Session expired — clean up
      LocalStorageAdapter.remove(StorageKeys.SESSION);
      return null;
    }
  },

  /**
   * Log out.
   */
  async logout() {
    const session = LocalStorageAdapter.get(StorageKeys.SESSION);
    if (session) {
      await AuditService.log(session.userId, AuditActions.USER_LOGOUT, 'user', session.userId);
      await sessionRepository.delete(session.userId);
    }
    LocalStorageAdapter.remove(StorageKeys.SESSION);
  },

  /**
   * Returns the security question prompts for a given username.
   * Exposes only the question text — never hashes or salts.
   *
   * @param {string} username
   * @returns {Promise<string[]>} Array of question strings
   */
  async getSecurityQuestions(username) {
    if (!username) throw new ValidationError('Username is required', { username: 'Required' });
    const user = await userRepository.getByUsername(username);
    if (!user) {
      // Do NOT reveal whether the account exists.
      // Return generic placeholder questions so the recovery UI behaves
      // identically for known and unknown usernames.
      return [
        "What was the name of your first pet?",
        "What city were you born in?",
      ];
    }
    return user.securityQuestions.map(sq => sq.question);
  },

  /**
   * Recover password using security questions.
   */
  async recoverPassword(username, answers, newPassword) {
    if (!username) throw new ValidationError('Username is required', { username: 'Required' });
    validatePassword(newPassword);

    const user = await userRepository.getByUsername(username);
    if (!user) {
      // Do NOT reveal whether the account exists.
      // Throw the same error as incorrect security answers.
      throw new AuthenticationError('Incorrect security answers');
    }

    // Check recovery lockout
    if (user.recoveryLockoutUntil && now() < user.recoveryLockoutUntil) {
      throw new RateLimitError('Recovery locked due to too many failed attempts');
    }

    // Clear expired recovery lockout
    if (user.recoveryLockoutUntil && now() >= user.recoveryLockoutUntil) {
      user.recoveryAttempts = 0;
      user.recoveryLockoutUntil = null;
    }

    // Verify all security question answers
    if (!Array.isArray(answers) || answers.length !== user.securityQuestions.length) {
      await this._recordRecoveryFailure(user);
      throw new AuthenticationError('Incorrect security answers');
    }

    for (let i = 0; i < user.securityQuestions.length; i++) {
      const sq = user.securityQuestions[i];
      const provided = answers[i];
      if (!provided) {
        await this._recordRecoveryFailure(user);
        throw new AuthenticationError('Incorrect security answers');
      }
      const isMatch = await verifyHash(provided.toLowerCase().trim(), sq.answerHash, sq.answerSalt);
      if (!isMatch) {
        await this._recordRecoveryFailure(user);
        throw new AuthenticationError('Incorrect security answers');
      }
    }

    // All answers correct — update password
    const salt = await generateSalt();
    const passwordHash = await hashValue(newPassword, salt);
    user.passwordHash = passwordHash;
    user.salt = salt;
    user.recoveryAttempts = 0;
    user.recoveryLockoutUntil = null;
    user.failedAttempts = 0;
    user.lockoutUntil = null;
    user.updatedAt = now();

    await userRepository.update(user);

    // Invalidate any active session for this user (force re-login everywhere)
    await sessionRepository.delete(user.id);
    LocalStorageAdapter.remove(StorageKeys.SESSION);

    await AuditService.log(user.id, AuditActions.PASSWORD_RECOVERED, 'user', user.id);

    return { success: true };
  },

  /**
   * Change password (authenticated).
   */
  async changePassword(session, currentPassword, newPassword) {
    validateSession(session);
    validatePassword(newPassword);

    const user = await userRepository.getByIdOrFail(session.userId);
    const isValid = await verifyHash(currentPassword, user.passwordHash, user.salt);
    if (!isValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    const salt = await generateSalt();
    const passwordHash = await hashValue(newPassword, salt);
    user.passwordHash = passwordHash;
    user.salt = salt;
    user.updatedAt = now();

    await userRepository.update(user);
    await AuditService.log(session.userId, AuditActions.PASSWORD_CHANGED, 'user', user.id);

    // Invalidate session — force re-login
    await this.logout();
    return { success: true, requiresReLogin: true };
  },

  // ── Private Helpers ──

  async _recordFailedAttempt(user) {
    const currentTime = now();

    // Reset window if expired
    if (user.failedAttemptWindowStart && isExpired(user.failedAttemptWindowStart, TEN_MINUTES_MS)) {
      user.failedAttempts = 0;
      user.failedAttemptWindowStart = null;
    }

    // Start new window if needed
    if (!user.failedAttemptWindowStart) {
      user.failedAttemptWindowStart = currentTime;
    }

    user.failedAttempts = (user.failedAttempts || 0) + 1;

    // Lock if threshold reached
    if (user.failedAttempts >= LIMITS.MAX_LOGIN_ATTEMPTS) {
      user.lockoutUntil = currentTime + FIFTEEN_MINUTES_MS;
      user.failedAttempts = 0;
      user.failedAttemptWindowStart = null;
      await AuditService.log(user.id, AuditActions.USER_LOCKED, 'user', user.id, {
        reason: 'max_failed_attempts',
      });
    }

    user.updatedAt = currentTime;
    await userRepository.update(user);
    await AuditService.log(user.id, AuditActions.USER_LOGIN_FAILED, 'user', user.id);
  },

  async _recordRecoveryFailure(user) {
    user.recoveryAttempts = (user.recoveryAttempts || 0) + 1;
    if (user.recoveryAttempts >= LIMITS.RECOVERY_MAX_ATTEMPTS) {
      user.recoveryLockoutUntil = now() + FIFTEEN_MINUTES_MS;
    }
    user.updatedAt = now();
    await userRepository.update(user);
  },
};

/**
 * Strip sensitive fields from user object.
 */
function sanitizeUser(user) {
  const { passwordHash, salt, securityQuestions, failedAttempts, failedAttemptWindowStart,
    lockoutUntil, recoveryAttempts, recoveryLockoutUntil, ...safe } = user;
  return safe;
}

export { sanitizeUser };
