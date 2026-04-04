/**
 * Comment & Q&A Service — CRUD with moderation integration.
 */

import { commentRepository, listingRepository } from '../repositories/index.js';
import { requirePermission, requireOwnership } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { validateComment } from '../domain/validation/rules.js';
import { Permissions } from '../domain/enums/permissions.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { ModerationService } from './ModerationService.js';

export const CommentService = {
  /**
   * Create a comment or question on a listing.
   * @param {Object} session
   * @param {{ listingId, content, type, media }} data - type: 'comment' | 'question' | 'answer'
   */
  async create(session, data) {
    validateSession(session);
    requirePermission(session, Permissions.CONTENT_CREATE);
    validateComment(data);

    // Verify listing exists and load once for any answer check
    const listing = await listingRepository.getByIdOrFail(data.listingId);

    // For answers, verify the user is the listing seller
    if (data.type === 'answer') {
      if (listing.sellerId !== session.userId) {
        throw new ValidationError('Only the seller can answer questions');
      }
      if (!data.parentId) {
        throw new ValidationError('Answer must reference a parent question');
      }
    }

    // Pre-screen content
    const flagged = await ModerationService.preScreenContent(data.content);

    const comment = {
      id: generateId(),
      listingId: data.listingId,
      userId: session.userId,
      content: data.content.trim(),
      media: data.media || [],
      type: data.type || 'comment',
      parentId: data.parentId || null,
      isFlagged: flagged.length > 0,
      createdAt: now(),
      updatedAt: now(),
    };

    await commentRepository.create(comment);

    // Create moderation case if flagged
    if (flagged.length > 0) {
      await ModerationService.createCase(session, {
        contentId: comment.id,
        contentType: 'comment',
        reason: 'pre_screen_flagged',
        flaggedWords: flagged,
      });
    }

    return comment;
  },

  /**
   * Update a comment.
   */
  async update(session, commentId, updates) {
    validateSession(session);
    requirePermission(session, Permissions.CONTENT_EDIT);

    const comment = await commentRepository.getByIdOrFail(commentId);
    requireOwnership(session, comment.userId, Permissions.CONTENT_DELETE);

    if (updates.content) {
      const merged = { ...comment, ...updates };
      validateComment(merged);
      comment.content = updates.content.trim();
    }
    if (updates.media !== undefined) {
      comment.media = updates.media;
    }

    comment.updatedAt = now();
    await commentRepository.update(comment);
    return comment;
  },

  /**
   * Delete a comment (soft delete: mark as deleted).
   */
  async delete(session, commentId) {
    validateSession(session);
    requirePermission(session, Permissions.CONTENT_DELETE);

    const comment = await commentRepository.getByIdOrFail(commentId);
    requireOwnership(session, comment.userId, Permissions.CONTENT_DELETE);

    comment.isDeleted = true;
    comment.content = '[deleted]';
    comment.updatedAt = now();
    await commentRepository.update(comment);
  },

  /**
   * Get comments for a listing.
   */
  async getByListingId(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.CONTENT_VIEW);

    const comments = await commentRepository.getByListingId(listingId);
    return comments
      .filter(c => !c.isDeleted || c.type === 'question') // keep questions even if deleted for thread structure
      .sort((a, b) => a.createdAt - b.createdAt);
  },

  /**
   * Get Q&A for a listing (questions + answers).
   */
  async getQAByListingId(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.CONTENT_VIEW);

    const all = await commentRepository.getByListingId(listingId);
    const questions = all.filter(c => c.type === 'question');
    const answers = all.filter(c => c.type === 'answer');

    return questions.map(q => ({
      ...q,
      answers: answers.filter(a => a.parentId === q.id).sort((a, b) => a.createdAt - b.createdAt),
    }));
  },
};
