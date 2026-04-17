/**
 * Demo Account Seeder
 *
 * Creates ready-to-use accounts for every role so testers can skip the
 * Setup Wizard and go straight to login.
 *
 * Called once, at startup, when the database is empty (no admin exists).
 * After this runs, the system is marked initialized and /setup is bypassed.
 *
 * Timing: first browser load of a fresh instance takes ~5 s while PBKDF2
 * runs for each account. Subsequent loads are instant — seeding never
 * repeats once an admin user exists.
 */

import { userRepository } from '../repositories/index.js';
import { InitService } from '../services/InitService.js';
import { generateSalt, hashValue } from '../utils/crypto.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { Roles } from '../domain/enums/roles.js';

// ── Demo account definitions ──────────────────────────────────────────────────

/**
 * Security questions used for all seeded accounts.
 * Answers are intentionally simple for demo/test use.
 */
const SEED_QUESTIONS = [
  { question: 'What is the name of this demo app?',  answer: 'tradeloop' },
  { question: 'What is the test environment called?', answer: 'demo' },
];

/**
 * Non-admin accounts created after the admin is seeded.
 * Each account receives the listed roles in addition to the base USER role
 * — matching the real permission model so role-gated features work.
 */
const EXTRA_ACCOUNTS = [
  {
    username:    'moderator',
    password:    'Mod@TradeLoop1!',
    displayName: 'Demo Moderator',
    extraRoles:  [Roles.MODERATOR],
  },
  {
    username:    'support',
    password:    'Support@TradeLoop1!',
    displayName: 'Demo Support',
    extraRoles:  [Roles.SUPPORT_AGENT],
  },
  {
    username:    'alice',
    password:    'Alice@TradeLoop1!',
    displayName: 'Alice (Buyer)',
    extraRoles:  [],
  },
  {
    username:    'bob',
    password:    'Bob@TradeLoop1!',
    displayName: 'Bob (Seller)',
    extraRoles:  [],
  },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Create a single user record in the repository.
 * Mirrors AuthService.register but lets us set arbitrary roles,
 * which is intentional for a dev-seed flow.
 */
async function _createUser({ username, password, displayName, roles }) {
  const salt = await generateSalt();
  const passwordHash = await hashValue(password, salt);

  const hashedQuestions = [];
  for (const sq of SEED_QUESTIONS) {
    const answerSalt = await generateSalt();
    const answerHash = await hashValue(sq.answer.toLowerCase().trim(), answerSalt);
    hashedQuestions.push({ question: sq.question, answerHash, answerSalt });
  }

  const user = {
    id:          generateId(),
    username,
    passwordHash,
    salt,
    roles,
    displayName,
    avatar:      null,
    bio:         '',
    securityQuestions: hashedQuestions,
    notificationPreferences: {
      messages:     true,
      moderation:   true,
      transactions: true,
      complaints:   true,
    },
    failedAttempts:          0,
    failedAttemptWindowStart: null,
    lockoutUntil:            null,
    recoveryAttempts:        0,
    recoveryLockoutUntil:    null,
    createdAt:  now(),
    updatedAt:  now(),
  };

  await userRepository.create(user);
  return user;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Seed all demo accounts and baseline categories.
 *
 * Safe to call only when isInitialized() returned false — InitService
 * enforces this with its own guard and will throw if called twice.
 */
export async function seedDemoAccounts() {
  console.info('[TradeLoop] Seeding demo accounts — first-run setup…');

  // 1. Admin account via InitService (validates inputs, hashes, audits)
  const admin = await InitService.createInitialAdmin({
    username:          'admin',
    password:          'Admin@TradeLoop1!',
    displayName:       'System Admin',
    securityQuestions: SEED_QUESTIONS,
  });

  // 2. Synthetic admin session for category creation
  //    (a real session is not required here — we just need a validated object
  //     that satisfies requirePermission(session, ADMIN_MANAGE_CATEGORIES))
  const adminSession = {
    userId:         admin.id,
    roles:          [Roles.ADMIN],
    createdAt:      now(),
    lastActivityAt: now(),
  };

  // 3. Baseline categories (mirrors the Setup Wizard's Step 2)
  await InitService.createBaselineCategories(
    adminSession,
    InitService.defaultCategories(),
  );

  // 4. Role accounts — created directly so we can assign the correct roles
  //    without going through the admin UI
  for (const def of EXTRA_ACCOUNTS) {
    await _createUser({
      username:    def.username,
      password:    def.password,
      displayName: def.displayName,
      roles:       [Roles.USER, ...def.extraRoles],
    });
  }

  console.info('[TradeLoop] Demo accounts ready. Go to /login to sign in.');
}
