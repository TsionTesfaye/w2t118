/**
 * RBAC Hardening Tests — Phase 3
 * Tests permission enforcement at the guard level for all role/permission combinations
 * that were audited during Phase 3 hardening.
 *
 * Covers:
 *   - requirePermission rejects sessions missing a specific permission
 *   - requireOwnership allows owner, blocks non-owner, allows admin override
 *   - Moderator-only permissions (MODERATION_DECIDE) not accessible by USER role
 *   - Support agent permissions not accessible by USER or MODERATOR
 *   - REFUND_APPROVE, COMPLAINT_MANAGE not accessible by plain USER
 *   - DELIVERY_MANAGE_COVERAGE only accessible by ADMIN
 *   - ADMIN_IMPORT / ADMIN_EXPORT only accessible by ADMIN
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../setup.js';
import { requirePermission, requireOwnership, getSessionPermissions } from '../../src/domain/policies/permissionGuard.js';
import { Permissions } from '../../src/domain/enums/permissions.js';
import { Roles } from '../../src/domain/enums/roles.js';

const suite = new TestRunner('RBAC Hardening');

// ── Session factories ──

function makeSession(roles, userId = 'user-1') {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

const userSession = makeSession([Roles.USER]);
const modSession = makeSession([Roles.MODERATOR]);
const supportSession = makeSession([Roles.SUPPORT_AGENT]);
const adminSession = makeSession([Roles.ADMIN]);

// ── Moderator-only permissions ──

suite.test('MODERATION_DECIDE: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.MODERATION_DECIDE), 'AuthorizationError');
});

suite.test('MODERATION_DECIDE: denied to SUPPORT_AGENT', async () => {
  await assertThrowsAsync(() => requirePermission(supportSession, Permissions.MODERATION_DECIDE), 'AuthorizationError');
});

suite.test('MODERATION_DECIDE: granted to MODERATOR', () => {
  requirePermission(modSession, Permissions.MODERATION_DECIDE); // must not throw
});

suite.test('MODERATION_DECIDE: granted to ADMIN', () => {
  requirePermission(adminSession, Permissions.MODERATION_DECIDE);
});

suite.test('LISTING_PIN: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.LISTING_PIN), 'AuthorizationError');
});

suite.test('LISTING_FEATURE: denied to SUPPORT_AGENT', async () => {
  await assertThrowsAsync(() => requirePermission(supportSession, Permissions.LISTING_FEATURE), 'AuthorizationError');
});

// ── Support agent-only permissions ──

suite.test('COMPLAINT_MANAGE: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.COMPLAINT_MANAGE), 'AuthorizationError');
});

suite.test('COMPLAINT_MANAGE: denied to MODERATOR', async () => {
  await assertThrowsAsync(() => requirePermission(modSession, Permissions.COMPLAINT_MANAGE), 'AuthorizationError');
});

suite.test('COMPLAINT_MANAGE: granted to SUPPORT_AGENT', () => {
  requirePermission(supportSession, Permissions.COMPLAINT_MANAGE);
});

suite.test('REFUND_APPROVE: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.REFUND_APPROVE), 'AuthorizationError');
});

suite.test('REFUND_APPROVE: denied to MODERATOR', async () => {
  await assertThrowsAsync(() => requirePermission(modSession, Permissions.REFUND_APPROVE), 'AuthorizationError');
});

suite.test('REFUND_APPROVE: granted to SUPPORT_AGENT', () => {
  requirePermission(supportSession, Permissions.REFUND_APPROVE);
});

// ── Admin-only permissions ──

suite.test('ADMIN_IMPORT: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.ADMIN_IMPORT), 'AuthorizationError');
});

suite.test('ADMIN_IMPORT: denied to MODERATOR', async () => {
  await assertThrowsAsync(() => requirePermission(modSession, Permissions.ADMIN_IMPORT), 'AuthorizationError');
});

suite.test('ADMIN_IMPORT: denied to SUPPORT_AGENT', async () => {
  await assertThrowsAsync(() => requirePermission(supportSession, Permissions.ADMIN_IMPORT), 'AuthorizationError');
});

suite.test('ADMIN_IMPORT: granted to ADMIN', () => {
  requirePermission(adminSession, Permissions.ADMIN_IMPORT);
});

suite.test('DELIVERY_MANAGE_COVERAGE: denied to USER', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.DELIVERY_MANAGE_COVERAGE), 'AuthorizationError');
});

suite.test('USER_MANAGE_ROLES: denied to MODERATOR', async () => {
  await assertThrowsAsync(() => requirePermission(modSession, Permissions.USER_MANAGE_ROLES), 'AuthorizationError');
});

suite.test('ADMIN_MANAGE_SENSITIVE_WORDS: denied to MODERATOR', async () => {
  await assertThrowsAsync(() => requirePermission(modSession, Permissions.ADMIN_MANAGE_SENSITIVE_WORDS), 'AuthorizationError');
});

// ── Ownership enforcement ──

suite.test('requireOwnership: owner passes', () => {
  const session = makeSession([Roles.USER], 'owner-123');
  requireOwnership(session, 'owner-123'); // must not throw
});

suite.test('requireOwnership: non-owner rejected', async () => {
  const session = makeSession([Roles.USER], 'user-abc');
  await assertThrowsAsync(() => requireOwnership(session, 'owner-123'), 'AuthorizationError');
});

suite.test('requireOwnership: admin bypasses with override permission', () => {
  requireOwnership(adminSession, 'some-other-user', Permissions.CONTENT_DELETE);
});

suite.test('requireOwnership: moderator bypasses with CONTENT_DELETE override', () => {
  requireOwnership(modSession, 'some-other-user', Permissions.CONTENT_DELETE);
});

suite.test('requireOwnership: USER cannot bypass ownership check', async () => {
  const session = makeSession([Roles.USER], 'user-abc');
  await assertThrowsAsync(
    () => requireOwnership(session, 'owner-xyz', Permissions.CONTENT_DELETE),
    'AuthorizationError'
  );
});

// ── User role: refund request allowed, refund approve denied ──

suite.test('REFUND_REQUEST: granted to USER', () => {
  requirePermission(userSession, Permissions.REFUND_REQUEST);
});

suite.test('REFUND_APPROVE: denied to USER even if they can REQUEST', async () => {
  await assertThrowsAsync(() => requirePermission(userSession, Permissions.REFUND_APPROVE), 'AuthorizationError');
});

// ── Unauthenticated session ──

suite.test('no session: throws AuthenticationError', async () => {
  await assertThrowsAsync(() => requirePermission(null, Permissions.LISTING_CREATE), 'AuthenticationError');
});

suite.test('session with no userId: throws AuthenticationError', async () => {
  await assertThrowsAsync(() => requirePermission({ roles: [Roles.USER] }, Permissions.LISTING_CREATE), 'AuthenticationError');
});

suite.test('session with no roles: throws AuthorizationError', async () => {
  await assertThrowsAsync(() => requirePermission({ userId: 'u1', roles: [] }, Permissions.LISTING_CREATE), 'AuthorizationError');
});

// ── Permission set completeness ──

suite.test('ADMIN has every defined permission', () => {
  const adminPerms = getSessionPermissions(adminSession);
  const allPerms = Object.values(Permissions);
  for (const perm of allPerms) {
    assert(adminPerms.includes(perm), `ADMIN missing permission: ${perm}`);
  }
});

suite.test('USER does not have any admin-only permissions', () => {
  const userPerms = getSessionPermissions(userSession);
  const adminOnly = [
    Permissions.ADMIN_IMPORT,
    Permissions.ADMIN_EXPORT,
    Permissions.ADMIN_VIEW_AUDIT,
    Permissions.ADMIN_MANAGE_CATEGORIES,
    Permissions.ADMIN_MANAGE_SENSITIVE_WORDS,
    Permissions.USER_MANAGE_ROLES,
    Permissions.MODERATION_DECIDE,
    Permissions.REFUND_APPROVE,
  ];
  for (const perm of adminOnly) {
    assert(!userPerms.includes(perm), `USER should not have: ${perm}`);
  }
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
