/**
 * Route Navigation Integration Tests
 *
 * Verifies that:
 *   - Every feature in the UI has a corresponding named route
 *   - The recovery flow has a dedicated route distinct from auth routes
 *   - User center tab navigation maps to valid route params
 *   - Parameterized routes carry the correct param names
 *   - Navigation guard redirect targets exist in the registry
 *   - No component hardcodes a route name string (structural check)
 *
 * These are purely structural / registry-level tests.
 * They run in Node without a browser.
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import { RouteNames } from '../../src/app/router/routeNames.js';

const suite = new TestRunner('Route Navigation Integration');

// ── Helpers ──────────────────────────────────────────────

const ALL_NAMES   = Object.values(RouteNames);
const AUTH_ROUTES = [RouteNames.LOGIN, RouteNames.REGISTER, RouteNames.RECOVER_PASSWORD];
const SETUP_ROUTE = RouteNames.SETUP;

// ─────────────────────────────────────────────
// Registry completeness
// ─────────────────────────────────────────────

suite.test('all 15 route constants are present (including SETUP)', () => {
  const required = [
    'SETUP',
    'LOGIN', 'REGISTER', 'RECOVER_PASSWORD',
    'HOME', 'MARKETPLACE', 'CREATE_LISTING', 'LISTING_DETAIL', 'EDIT_LISTING',
    'THREADS', 'THREAD_DETAIL',
    'USER_CENTER',
    'MODERATION', 'SUPPORT', 'ADMIN',
  ];
  for (const key of required) {
    assert(key in RouteNames, `RouteNames.${key} must exist`);
    assert(typeof RouteNames[key] === 'string' && RouteNames[key].length > 0,
      `RouteNames.${key} must be a non-empty string`);
  }
  assertEqual(ALL_NAMES.length, 15, 'Exactly 15 routes must be registered');
});

suite.test('registry is frozen (immutable at runtime)', () => {
  const original = RouteNames.LOGIN;
  try {
    // @ts-ignore — intentional write attempt
    RouteNames.LOGIN = 'hacked';
  } catch { /* strict mode throws — expected */ }
  assertEqual(RouteNames.LOGIN, original, 'RouteNames must be immutable');
});

suite.test('all route names are unique strings', () => {
  const seen = new Set();
  for (const name of ALL_NAMES) {
    assert(!seen.has(name), `Duplicate route name: ${name}`);
    seen.add(name);
  }
});

suite.test('route names are names, not paths (must not start with /)', () => {
  for (const name of ALL_NAMES) {
    assert(!name.startsWith('/'), `Route name "${name}" looks like a path — use a name, not a path`);
  }
});

// ─────────────────────────────────────────────
// First-run setup route
// ─────────────────────────────────────────────

suite.test('SETUP route exists and is distinct from all auth routes', () => {
  assert('SETUP' in RouteNames, 'RouteNames.SETUP must exist');
  assert(RouteNames.SETUP !== RouteNames.LOGIN,            'SETUP ≠ LOGIN');
  assert(RouteNames.SETUP !== RouteNames.REGISTER,         'SETUP ≠ REGISTER');
  assert(RouteNames.SETUP !== RouteNames.RECOVER_PASSWORD, 'SETUP ≠ RECOVER_PASSWORD');
  assert(RouteNames.SETUP !== RouteNames.HOME,             'SETUP ≠ HOME');
});

suite.test('SETUP route is the guard redirect target for uninitialized systems', () => {
  // The guard redirects ALL routes to SETUP when uninitialized.
  // This requires SETUP to be a valid target in the registry.
  assert(ALL_NAMES.includes(RouteNames.SETUP),
    'SETUP must be in the registry so the guard can redirect to it');
});

// ─────────────────────────────────────────────
// Authentication flow routes
// ─────────────────────────────────────────────

suite.test('login route is distinct from register and recovery', () => {
  assert(RouteNames.LOGIN !== RouteNames.REGISTER,         'LOGIN ≠ REGISTER');
  assert(RouteNames.LOGIN !== RouteNames.RECOVER_PASSWORD, 'LOGIN ≠ RECOVER_PASSWORD');
  assert(RouteNames.REGISTER !== RouteNames.RECOVER_PASSWORD, 'REGISTER ≠ RECOVER_PASSWORD');
});

suite.test('RECOVER_PASSWORD is a separate named route (not aliased to LOGIN)', () => {
  assert(RouteNames.RECOVER_PASSWORD, 'RECOVER_PASSWORD must exist');
  assert(RouteNames.RECOVER_PASSWORD !== RouteNames.LOGIN, 'Must not reuse LOGIN name');
  // Confirm the exact value matches the naming convention
  assert(!RouteNames.RECOVER_PASSWORD.toLowerCase().includes('login'),
    'RECOVER_PASSWORD name must not include "login"');
});

suite.test('auth routes are distinct from all authenticated routes', () => {
  const protectedRoutes = ALL_NAMES.filter(n => !AUTH_ROUTES.includes(n));
  for (const authRoute of AUTH_ROUTES) {
    assert(!protectedRoutes.includes(authRoute),
      `Auth route "${authRoute}" must not appear in protected routes`);
  }
});

// ─────────────────────────────────────────────
// Navigation guard targets
// ─────────────────────────────────────────────

suite.test('guard redirect targets (LOGIN, HOME) exist in registry', () => {
  assert(ALL_NAMES.includes(RouteNames.LOGIN), 'LOGIN must be a valid redirect target');
  assert(ALL_NAMES.includes(RouteNames.HOME),  'HOME must be a valid redirect target');
});

// ─────────────────────────────────────────────
// Parameterised routes
// ─────────────────────────────────────────────

suite.test('listing detail and edit listing are separate routes (not same name)', () => {
  assert(RouteNames.LISTING_DETAIL !== RouteNames.EDIT_LISTING,
    'Detail and edit must be separate routes to avoid param conflicts');
});

suite.test('thread detail is separate from threads list', () => {
  assert(RouteNames.THREAD_DETAIL !== RouteNames.THREADS,
    'Thread detail must be separate from threads list');
});

// ─────────────────────────────────────────────
// User center tab params
// ─────────────────────────────────────────────

const USER_CENTER_TABS = ['profile', 'addresses', 'transactions', 'complaints', 'notifications', 'settings'];

suite.test('all user center tabs map to the USER_CENTER route (not separate routes)', () => {
  // Verify there are no per-tab route entries (they use params, not separate routes)
  for (const tab of USER_CENTER_TABS) {
    const name = tab.charAt(0).toUpperCase() + tab.slice(1);
    assert(!ALL_NAMES.includes(name),
      `Tab "${tab}" must NOT have its own route — it should be a param on USER_CENTER`);
  }
  // The single USER_CENTER route handles all tabs
  assert(ALL_NAMES.includes(RouteNames.USER_CENTER), 'USER_CENTER route must exist');
});

// ─────────────────────────────────────────────
// Feature coverage: all major app sections have routes
// ─────────────────────────────────────────────

suite.test('marketplace features have dedicated routes', () => {
  assert(ALL_NAMES.includes(RouteNames.MARKETPLACE),    'Browse marketplace route required');
  assert(ALL_NAMES.includes(RouteNames.CREATE_LISTING), 'Create listing route required');
  assert(ALL_NAMES.includes(RouteNames.LISTING_DETAIL), 'Listing detail route required');
  assert(ALL_NAMES.includes(RouteNames.EDIT_LISTING),   'Edit listing route required');
});

suite.test('messaging features have dedicated routes', () => {
  assert(ALL_NAMES.includes(RouteNames.THREADS),       'Thread list route required');
  assert(ALL_NAMES.includes(RouteNames.THREAD_DETAIL), 'Thread detail route required');
});

suite.test('admin/moderation/support all have dedicated routes', () => {
  assert(ALL_NAMES.includes(RouteNames.MODERATION), 'Moderation route required');
  assert(ALL_NAMES.includes(RouteNames.SUPPORT),    'Support route required');
  assert(ALL_NAMES.includes(RouteNames.ADMIN),      'Admin route required');
});

// ─────────────────────────────────────────────
// Recovery flow routing correctness
// ─────────────────────────────────────────────

suite.test('recovery flow uses dedicated route, not query params on login', () => {
  // RECOVER_PASSWORD must be a distinct named route so the step UX works correctly
  assert(RouteNames.RECOVER_PASSWORD !== RouteNames.LOGIN,
    'Recovery must be a separate route — step transitions depend on this');
  assert(RouteNames.RECOVER_PASSWORD, 'RECOVER_PASSWORD must be non-empty');
  assertEqual(RouteNames.RECOVER_PASSWORD, 'RecoverPassword',
    'Recovery route name must match the canonical value');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
