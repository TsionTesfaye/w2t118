/**
 * User Service — profile management, blocking, preferences.
 */

import { userRepository, blockRepository } from '../repositories/index.js';
import { requirePermission, requireOwnership } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { validateProfile } from '../domain/validation/rules.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ConflictError, ValidationError, NotFoundError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { sanitizeUser } from './AuthService.js';
import { ThreadService } from './ThreadService.js';

export const UserService = {
  /**
   * Get user profile (sanitized).
   */
  async getProfile(session, userId) {
    validateSession(session);
    requirePermission(session, Permissions.USER_VIEW_PROFILE);

    const user = await userRepository.getByIdOrFail(userId);
    return sanitizeUser(user);
  },

  /**
   * Update own profile.
   */
  async updateProfile(session, updates) {
    validateSession(session);
    requirePermission(session, Permissions.USER_EDIT_PROFILE);

    const user = await userRepository.getByIdOrFail(session.userId);

    // Only allow updating safe fields
    const allowedFields = ['displayName', 'avatar', 'bio'];
    const profileUpdate = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        profileUpdate[field] = updates[field];
      }
    }

    validateProfile(profileUpdate);

    Object.assign(user, profileUpdate);
    user.updatedAt = now();

    await userRepository.update(user);
    await AuditService.log(session.userId, AuditActions.PROFILE_UPDATED, 'user', user.id);

    return sanitizeUser(user);
  },

  /**
   * Update notification preferences.
   */
  async updateNotificationPreferences(session, prefs) {
    validateSession(session);
    requirePermission(session, Permissions.NOTIFICATION_MANAGE_PREFS);

    const user = await userRepository.getByIdOrFail(session.userId);

    const allowedKeys = ['messages', 'moderation', 'transactions', 'complaints'];
    for (const key of allowedKeys) {
      if (prefs[key] !== undefined) {
        if (typeof prefs[key] !== 'boolean') {
          throw new ValidationError(`Preference '${key}' must be a boolean`);
        }
        user.notificationPreferences[key] = prefs[key];
      }
    }

    user.updatedAt = now();
    await userRepository.update(user);
    return user.notificationPreferences;
  },

  /**
   * Block another user.
   */
  async blockUser(session, targetUserId) {
    validateSession(session);
    requirePermission(session, Permissions.USER_BLOCK);

    if (session.userId === targetUserId) {
      throw new ValidationError('Cannot block yourself');
    }

    // Verify target exists
    await userRepository.getByIdOrFail(targetUserId);

    // Check if already blocked
    const alreadyBlocked = await blockRepository.isBlocked(session.userId, targetUserId);
    if (alreadyBlocked) {
      throw new ConflictError('User is already blocked');
    }

    const block = {
      id: generateId(),
      blockerId: session.userId,
      blockedId: targetUserId,
      createdAt: now(),
    };

    await blockRepository.create(block);
    await AuditService.log(session.userId, AuditActions.USER_BLOCKED, 'user', targetUserId);

    // Immediately mark all shared threads read-only so neither party can send
    // further messages without waiting for the next sendMessage() call to detect the block.
    await ThreadService.markAllSharedThreadsReadOnly(session.userId, targetUserId);

    return block;
  },

  /**
   * Unblock a user.
   */
  async unblockUser(session, targetUserId) {
    validateSession(session);
    requirePermission(session, Permissions.USER_BLOCK);

    const blocks = await blockRepository.getByBlockerId(session.userId);
    const block = blocks.find(b => b.blockedId === targetUserId);
    if (!block) {
      throw new NotFoundError('block', targetUserId);
    }

    await blockRepository.delete(block.id);
    await AuditService.log(session.userId, AuditActions.USER_UNBLOCKED, 'user', targetUserId);
  },

  /**
   * Check if either user has blocked the other.
   */
  async isEitherBlocked(userId1, userId2) {
    return blockRepository.isEitherBlocked(userId1, userId2);
  },

  /**
   * Get all users (admin only).
   */
  async getAllUsers(session) {
    validateSession(session);
    requirePermission(session, Permissions.USER_VIEW_ALL);

    const users = await userRepository.getAll();
    return users.map(sanitizeUser);
  },

  /**
   * Assign a role to a user (admin only).
   */
  async assignRole(session, userId, role) {
    validateSession(session);
    requirePermission(session, Permissions.USER_MANAGE_ROLES);

    const user = await userRepository.getByIdOrFail(userId);

    if (user.roles.includes(role)) {
      throw new ConflictError(`User already has role: ${role}`);
    }

    user.roles.push(role);
    user.updatedAt = now();
    await userRepository.update(user);

    await AuditService.log(session.userId, AuditActions.ROLE_ASSIGNED, 'user', userId, { role });
    return sanitizeUser(user);
  },

  /**
   * Remove a role from a user (admin only).
   */
  async removeRole(session, userId, role) {
    validateSession(session);
    requirePermission(session, Permissions.USER_MANAGE_ROLES);

    const user = await userRepository.getByIdOrFail(userId);

    const idx = user.roles.indexOf(role);
    if (idx === -1) {
      throw new ValidationError(`User does not have role: ${role}`);
    }

    // Prevent removing last role
    if (user.roles.length <= 1) {
      throw new ValidationError('Cannot remove the last role from a user');
    }

    user.roles.splice(idx, 1);
    user.updatedAt = now();
    await userRepository.update(user);

    await AuditService.log(session.userId, AuditActions.ROLE_REMOVED, 'user', userId, { role });
    return sanitizeUser(user);
  },

  /**
   * Get blocked users list for current user.
   */
  async getBlockedUsers(session) {
    validateSession(session);
    requirePermission(session, Permissions.USER_BLOCK);
    const blocks = await blockRepository.getByBlockerId(session.userId);
    return blocks;
  },
};
