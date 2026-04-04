/**
 * Tests for RBAC permission system.
 */

import { TestRunner, assert, assertThrowsAsync } from '../setup.js';
import { requirePermission, requireOwnership, requireAnyPermission, getSessionPermissions } from '../../src/domain/policies/permissionGuard.js';
import { Permissions, RolePermissions } from '../../src/domain/enums/permissions.js';
import { Roles } from '../../src/domain/enums/roles.js';

const suite = new TestRunner('Permission Guard');

const userSession = { userId: 'u1', roles: [Roles.USER] };
const modSession = { userId: 'm1', roles: [Roles.MODERATOR] };
const supportSession = { userId: 's1', roles: [Roles.SUPPORT_AGENT] };
const adminSession = { userId: 'a1', roles: [Roles.ADMIN] };

// ── requirePermission ──

suite.test('user can create listings', () => {
  requirePermission(userSession, Permissions.LISTING_CREATE);
});

suite.test('user cannot manage categories', async () => {
  await assertThrowsAsync(
    () => requirePermission(userSession, Permissions.ADMIN_MANAGE_CATEGORIES),
    'AuthorizationError'
  );
});

suite.test('moderator can review moderation queue', () => {
  requirePermission(modSession, Permissions.MODERATION_VIEW_QUEUE);
});

suite.test('moderator cannot manage complaints', async () => {
  await assertThrowsAsync(
    () => requirePermission(modSession, Permissions.COMPLAINT_MANAGE),
    'AuthorizationError'
  );
});

suite.test('support agent can manage complaints', () => {
  requirePermission(supportSession, Permissions.COMPLAINT_MANAGE);
});

suite.test('support agent cannot create listings', async () => {
  await assertThrowsAsync(
    () => requirePermission(supportSession, Permissions.LISTING_CREATE),
    'AuthorizationError'
  );
});

suite.test('admin has all permissions', () => {
  // Test a sampling of permissions
  requirePermission(adminSession, Permissions.LISTING_CREATE);
  requirePermission(adminSession, Permissions.MODERATION_DECIDE);
  requirePermission(adminSession, Permissions.COMPLAINT_MANAGE);
  requirePermission(adminSession, Permissions.ADMIN_EXPORT);
  requirePermission(adminSession, Permissions.ANALYTICS_VIEW);
});

suite.test('no session throws AuthenticationError', async () => {
  await assertThrowsAsync(
    () => requirePermission(null, Permissions.LISTING_VIEW),
    'AuthenticationError'
  );
});

suite.test('session without roles throws AuthorizationError', async () => {
  await assertThrowsAsync(
    () => requirePermission({ userId: 'u1', roles: [] }, Permissions.LISTING_VIEW),
    'AuthorizationError'
  );
});

// ── requireOwnership ──

suite.test('owner passes ownership check', () => {
  requireOwnership(userSession, 'u1');
});

suite.test('non-owner fails ownership check', async () => {
  await assertThrowsAsync(
    () => requireOwnership(userSession, 'u2'),
    'AuthorizationError'
  );
});

suite.test('admin can override ownership with permission', () => {
  requireOwnership(adminSession, 'u2', Permissions.CONTENT_DELETE);
});

// ── requireAnyPermission ──

suite.test('requireAnyPermission passes with at least one match', () => {
  requireAnyPermission(userSession, [Permissions.LISTING_CREATE, Permissions.ADMIN_EXPORT]);
});

suite.test('requireAnyPermission fails with no match', async () => {
  await assertThrowsAsync(
    () => requireAnyPermission(userSession, [Permissions.ADMIN_EXPORT, Permissions.MODERATION_DECIDE]),
    'AuthorizationError'
  );
});

// ── getSessionPermissions ──

suite.test('getSessionPermissions returns correct set for user', () => {
  const perms = getSessionPermissions(userSession);
  assert(perms.includes(Permissions.LISTING_CREATE), 'user should have LISTING_CREATE');
  assert(!perms.includes(Permissions.ADMIN_EXPORT), 'user should not have ADMIN_EXPORT');
});

suite.test('getSessionPermissions returns all for admin', () => {
  const perms = getSessionPermissions(adminSession);
  const allPerms = Object.values(Permissions);
  for (const p of allPerms) {
    assert(perms.includes(p), `admin should have ${p}`);
  }
});

// ── Role permission completeness checks ──

suite.test('every role has defined permissions', () => {
  for (const role of Object.values(Roles)) {
    const perms = RolePermissions[role];
    assert(Array.isArray(perms), `Role ${role} should have permissions array`);
    assert(perms.length > 0, `Role ${role} should have at least one permission`);
  }
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
