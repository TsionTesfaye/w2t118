/**
 * Admin Service — categories, config, import/export.
 */

import { categoryRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';

export const AdminService = {
  // ── Category Management ──

  async createCategory(session, { name, parentId = null, sortOrder = 0 }) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_MANAGE_CATEGORIES);

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Category name is required');
    }

    // Verify parent exists if specified
    if (parentId) {
      await categoryRepository.getByIdOrFail(parentId);
    }

    const category = {
      id: generateId(),
      name: name.trim(),
      parentId,
      sortOrder,
      createdAt: now(),
      updatedAt: now(),
    };

    await categoryRepository.create(category);
    await AuditService.log(session.userId, AuditActions.CATEGORY_CREATED, 'category', category.id, { name, parentId });

    return category;
  },

  async updateCategory(session, categoryId, updates) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_MANAGE_CATEGORIES);

    const category = await categoryRepository.getByIdOrFail(categoryId);

    if (updates.name !== undefined) {
      if (!updates.name || updates.name.trim().length === 0) {
        throw new ValidationError('Category name cannot be empty');
      }
      category.name = updates.name.trim();
    }
    if (updates.parentId !== undefined) {
      if (updates.parentId === categoryId) {
        throw new ValidationError('Category cannot be its own parent');
      }
      if (updates.parentId) {
        await categoryRepository.getByIdOrFail(updates.parentId);
      }
      category.parentId = updates.parentId;
    }
    if (updates.sortOrder !== undefined) {
      category.sortOrder = updates.sortOrder;
    }

    category.updatedAt = now();
    await categoryRepository.update(category);
    await AuditService.log(session.userId, AuditActions.CATEGORY_UPDATED, 'category', categoryId);

    return category;
  },

  async getAllCategories(session) {
    validateSession(session);
    return categoryRepository.getAll();
  },

  async getCategoryTree(session) {
    validateSession(session);
    const all = await categoryRepository.getAll();
    const roots = all.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);

    function buildTree(parent) {
      const children = all
        .filter(c => c.parentId === parent.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        ...parent,
        children: children.map(buildTree),
      };
    }

    return roots.map(buildTree);
  },
};
