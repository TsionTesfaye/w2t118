/**
 * Init Service — first-run setup detection and bootstrapping.
 *
 * Responsible for:
 *  - Detecting whether the system has been initialized (admin user exists)
 *  - Creating the initial administrator account during first-run setup
 *  - Seeding baseline categories after admin creation
 *
 * These methods bypass normal session-guarded service calls because
 * no session exists yet during the first-run flow.
 */

import { userRepository } from '../repositories/index.js';
import { generateId } from '../utils/id.js';
import { generateSalt, hashValue } from '../utils/crypto.js';
import { now } from '../utils/time.js';
import { validatePassword, validateUsername, validateSecurityQuestions } from '../domain/validation/rules.js';
import { ValidationError } from '../utils/errors.js';
import { Roles } from '../domain/enums/roles.js';
import { AuditService, AuditActions } from './AuditService.js';

export const InitService = {
  /**
   * Returns true when the system has been initialized.
   * Initialized means at least one user with the ADMIN role exists.
   */
  async isInitialized() {
    try {
      const allUsers = await userRepository.getAll();
      return allUsers.some(u => Array.isArray(u.roles) && u.roles.includes(Roles.ADMIN));
    } catch {
      return false;
    }
  },

  /**
   * Create the initial administrator account.
   * ONLY callable when isInitialized() returns false.
   * Throws if the system is already initialized.
   *
   * @returns {Object} Sanitized user record (no secrets)
   */
  async createInitialAdmin({ username, password, displayName, securityQuestions }) {
    if (await this.isInitialized()) {
      throw new ValidationError('System already initialized. Admin setup is disabled.');
    }

    validateUsername(username);
    validatePassword(password);
    if (!displayName || displayName.trim().length === 0) {
      throw new ValidationError('Display name is required');
    }
    validateSecurityQuestions(securityQuestions);

    const existing = await userRepository.getByUsername(username);
    if (existing) {
      throw new ValidationError('Username already taken', { username: 'Already exists' });
    }

    const salt = await generateSalt();
    const passwordHash = await hashValue(password, salt);

    const hashedQuestions = [];
    for (const sq of securityQuestions) {
      const answerSalt = await generateSalt();
      const answerHash = await hashValue(sq.answer.toLowerCase().trim(), answerSalt);
      hashedQuestions.push({ question: sq.question, answerHash, answerSalt });
    }

    const user = {
      id: generateId(),
      username,
      passwordHash,
      salt,
      roles: [Roles.ADMIN],
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
    await AuditService.log(user.id, AuditActions.USER_REGISTERED, 'user', user.id, { setupFlow: true });

    // Return sanitized user — never expose secrets
    const { passwordHash: _ph, salt: _s, securityQuestions: _sq, ...safeUser } = user;
    return safeUser;
  },

  /**
   * Create baseline categories using an established admin session.
   * Called in Step 2 of the first-run setup flow after login.
   *
   * @param {Object} session - Admin session from AuthService.login()
   * @param {Array<{name: string}>} categories - List of category names to create
   */
  async createBaselineCategories(session, categories) {
    const { AdminService } = await import('./AdminService.js');
    const created = [];
    for (let i = 0; i < categories.length; i++) {
      const name = (categories[i].name || '').trim();
      if (!name) continue;
      const result = await AdminService.createCategory(session, { name, sortOrder: i + 1 });
      created.push(result);
    }
    return created;
  },

  /**
   * Default starter category list shown during setup.
   * User can edit names or remove entries before confirming.
   */
  defaultCategories() {
    return [
      { name: 'Electronics' },
      { name: 'Clothing & Apparel' },
      { name: 'Furniture & Home' },
      { name: 'Books & Media' },
      { name: 'Sports & Outdoors' },
      { name: 'Toys & Games' },
      { name: 'Tools & Hardware' },
      { name: 'Other' },
    ];
  },
};
