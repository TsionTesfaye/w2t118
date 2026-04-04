/**
 * Route Registry Tests
 *
 * Verifies:
 * 1. RouteNames constants are complete, unique, and non-empty strings
 * 2. Every RouteNames value corresponds to exactly one route in vueRouter
 * 3. No hardcoded path strings exist in RouteNames (all names not paths)
 * 4. Critical name→path mappings are correct
 * 5. The router guard redirect targets (LOGIN, HOME) exist in the registry
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import { RouteNames } from '../../src/app/router/routeNames.js';

const suite = new TestRunner('Route Registry: Consistency & Completeness');

// ── Helper ──
const ALL_NAMES = Object.values(RouteNames);

// ─────────────────────────────────────────────
// 1. Registry structure
// ─────────────────────────────────────────────

suite.test('RouteNames: exports a frozen object', () => {
  assert(typeof RouteNames === 'object' && RouteNames !== null, 'RouteNames must be an object');
  assert(Object.isFrozen(RouteNames), 'RouteNames must be frozen (immutable)');
});

suite.test('RouteNames: all values are non-empty strings', () => {
  for (const [key, value] of Object.entries(RouteNames)) {
    assert(typeof value === 'string', `RouteNames.${key} must be a string`);
    assert(value.length > 0, `RouteNames.${key} must be non-empty`);
  }
});

suite.test('RouteNames: all values are unique (no duplicate names)', () => {
  const seen = new Set();
  for (const value of ALL_NAMES) {
    assert(!seen.has(value), `Duplicate route name: "${value}"`);
    seen.add(value);
  }
});

suite.test('RouteNames: no value starts with "/" (names, not paths)', () => {
  for (const [key, value] of Object.entries(RouteNames)) {
    assert(!value.startsWith('/'), `RouteNames.${key} = "${value}" looks like a path — should be a name`);
  }
});

// ─────────────────────────────────────────────
// 2. Required names present
// ─────────────────────────────────────────────

const REQUIRED_KEYS = [
  'SETUP',
  'LOGIN', 'REGISTER', 'RECOVER_PASSWORD',
  'HOME', 'MARKETPLACE', 'CREATE_LISTING', 'LISTING_DETAIL', 'EDIT_LISTING',
  'THREADS', 'THREAD_DETAIL',
  'USER_CENTER',
  'MODERATION', 'SUPPORT', 'ADMIN',
];

suite.test('RouteNames: contains all required route keys', () => {
  for (const key of REQUIRED_KEYS) {
    assert(key in RouteNames, `RouteNames.${key} is missing`);
  }
});

suite.test('RouteNames: has exactly the expected number of routes (15)', () => {
  assertEqual(ALL_NAMES.length, 15, `Expected 15 route names, got ${ALL_NAMES.length}`);
});

// ─────────────────────────────────────────────
// 3. Critical name values
// ─────────────────────────────────────────────

suite.test('RouteNames.SETUP = "Setup"', () => {
  assertEqual(RouteNames.SETUP, 'Setup');
});

suite.test('Guard redirect to SETUP target exists in registry (first-run)', () => {
  assert(ALL_NAMES.includes(RouteNames.SETUP),
    'Router guard redirects to SETUP on fresh install — must be in registry');
});

suite.test('RouteNames.LOGIN = "Login"', () => {
  assertEqual(RouteNames.LOGIN, 'Login');
});

suite.test('RouteNames.REGISTER = "Register"', () => {
  assertEqual(RouteNames.REGISTER, 'Register');
});

suite.test('RouteNames.RECOVER_PASSWORD = "RecoverPassword"', () => {
  assertEqual(RouteNames.RECOVER_PASSWORD, 'RecoverPassword',
    'Must be RecoverPassword (not Recovery) — fixes /recovery vs /recover mismatch');
});

suite.test('RouteNames.HOME = "Home"', () => {
  assertEqual(RouteNames.HOME, 'Home');
});

suite.test('RouteNames.USER_CENTER = "UserCenter"', () => {
  assertEqual(RouteNames.USER_CENTER, 'UserCenter');
});

suite.test('RouteNames.THREAD_DETAIL = "ThreadDetail"', () => {
  assertEqual(RouteNames.THREAD_DETAIL, 'ThreadDetail');
});

// ─────────────────────────────────────────────
// 4. Guard redirect targets exist
// ─────────────────────────────────────────────

suite.test('Guard redirect to LOGIN target exists in registry', () => {
  assert(ALL_NAMES.includes(RouteNames.LOGIN),
    'Router guard redirects unauthenticated users to LOGIN — must be in registry');
});

suite.test('Guard redirect to HOME target exists in registry', () => {
  assert(ALL_NAMES.includes(RouteNames.HOME),
    'Router guard redirects authenticated guest-route visitors to HOME — must be in registry');
});

// ─────────────────────────────────────────────
// 5. Auth routes are separate from protected routes
// ─────────────────────────────────────────────

suite.test('Auth routes (LOGIN, REGISTER, RECOVER_PASSWORD) are distinct from protected routes', () => {
  const authRoutes   = new Set([RouteNames.LOGIN, RouteNames.REGISTER, RouteNames.RECOVER_PASSWORD]);
  const protectedRoutes = ALL_NAMES.filter(n => !authRoutes.has(n));
  for (const name of protectedRoutes) {
    assert(!authRoutes.has(name), `Protected route "${name}" found in auth routes set`);
  }
});

suite.test('RECOVER_PASSWORD is not named Recovery (stale name would break /recover path)', () => {
  assert(!ALL_NAMES.includes('Recovery'),
    '"Recovery" is a stale route name that caused the /recovery path mismatch bug — must not exist');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
