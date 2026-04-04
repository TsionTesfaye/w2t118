/**
 * Permission Guard — RBAC enforcement point.
 * Every service method MUST call this before executing.
 */

import { AuthorizationError, AuthenticationError } from '../../utils/errors.js';
import { RolePermissions } from '../enums/permissions.js';

/**
 * Check if a session has a specific permission.
 * @param {Object} session - Current session { userId, roles }
 * @param {string} permission - Required permission string
 * @throws {AuthenticationError} if no session
 * @throws {AuthorizationError} if permission not granted
 */
export function requirePermission(session, permission) {
  if (!session || !session.userId) {
    throw new AuthenticationError('Authentication required');
  }
  if (!session.roles || !Array.isArray(session.roles)) {
    throw new AuthorizationError('No roles assigned', permission);
  }

  const hasPermission = session.roles.some(role => {
    const perms = RolePermissions[role];
    return perms && perms.includes(permission);
  });

  if (!hasPermission) {
    throw new AuthorizationError(`Permission denied: ${permission}`, permission);
  }
}

/**
 * Check if session user is the owner of a resource.
 * @param {Object} session - Current session
 * @param {string} ownerId - Owner ID of the resource
 * @param {string} [adminOverridePermission] - Optional permission that bypasses ownership check
 * @throws {AuthorizationError} if not owner and no admin override
 */
export function requireOwnership(session, ownerId, adminOverridePermission = null) {
  if (!session || !session.userId) {
    throw new AuthenticationError('Authentication required');
  }

  if (session.userId === ownerId) return;

  // Check if the session has an admin-level override permission
  if (adminOverridePermission) {
    const hasOverride = session.roles.some(role => {
      const perms = RolePermissions[role];
      return perms && perms.includes(adminOverridePermission);
    });
    if (hasOverride) return;
  }

  throw new AuthorizationError('You do not own this resource');
}

/**
 * Check if user has ANY of the specified permissions.
 */
export function requireAnyPermission(session, permissions) {
  if (!session || !session.userId) {
    throw new AuthenticationError('Authentication required');
  }

  const hasAny = permissions.some(perm =>
    session.roles.some(role => {
      const perms = RolePermissions[role];
      return perms && perms.includes(perm);
    })
  );

  if (!hasAny) {
    throw new AuthorizationError(`Permission denied: requires one of [${permissions.join(', ')}]`);
  }
}

/**
 * Get all permissions for a session's roles.
 */
export function getSessionPermissions(session) {
  if (!session || !session.roles) return [];
  const permSet = new Set();
  for (const role of session.roles) {
    const perms = RolePermissions[role] || [];
    perms.forEach(p => permSet.add(p));
  }
  return Array.from(permSet);
}
