/**
 * Thread Service — messaging tied to listings.
 * Enforces: block checks, read-only rules, no deletion.
 */

import { threadRepository, messageRepository, listingRepository } from '../repositories/index.js';
import { blockRepository } from '../repositories/BlockRepository.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { ListingStatus } from '../domain/enums/statuses.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError, AuthorizationError, ConflictError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { NotificationService } from './NotificationService.js';

export const ThreadService = {
  /**
   * Create a new thread (buyer initiates on a listing).
   */
  async create(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_CREATE);

    const listing = await listingRepository.getByIdOrFail(listingId);

    // Cannot message your own listing
    if (listing.sellerId === session.userId) {
      throw new ValidationError('Cannot create a thread on your own listing');
    }

    // Listing must be active
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new ValidationError('Cannot create a thread on an inactive listing');
    }

    // Check block status
    const blocked = await blockRepository.isEitherBlocked(session.userId, listing.sellerId);
    if (blocked) {
      throw new AuthorizationError('Cannot create thread: blocked');
    }

    // Check if thread already exists between this buyer and listing
    const existingThreads = await threadRepository.getByListingId(listingId);
    const duplicate = existingThreads.find(t => t.buyerId === session.userId);
    if (duplicate) {
      throw new ConflictError('Thread already exists for this listing');
    }

    const thread = {
      id: generateId(),
      listingId,
      buyerId: session.userId,
      sellerId: listing.sellerId,
      isReadOnly: false,
      archivedBy: [], // user IDs who archived this thread
      createdAt: now(),
      updatedAt: now(),
    };

    await threadRepository.create(thread);
    await AuditService.log(session.userId, AuditActions.THREAD_CREATED, 'thread', thread.id, { listingId });

    return thread;
  },

  /**
   * Send a message in a thread.
   */
  async sendMessage(session, threadId, content) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_SEND_MESSAGE);

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Message content is required');
    }

    const thread = await threadRepository.getByIdOrFail(threadId);

    // Must be participant
    this._requireParticipant(session, thread);

    // Check read-only
    if (thread.isReadOnly) {
      throw new ValidationError('Thread is read-only');
    }

    // Check block status
    const blocked = await blockRepository.isEitherBlocked(thread.buyerId, thread.sellerId);
    if (blocked) {
      // Mark thread read-only and reject
      thread.isReadOnly = true;
      await threadRepository.update(thread);
      throw new AuthorizationError('Cannot send message: blocked');
    }

    const message = {
      id: generateId(),
      threadId,
      senderId: session.userId,
      content: content.trim(),
      createdAt: now(),
    };

    await messageRepository.create(message);

    thread.updatedAt = now();
    await threadRepository.update(thread);

    await AuditService.log(session.userId, AuditActions.MESSAGE_SENT, 'message', message.id, { threadId });

    // Notify the other participant
    const recipientId = session.userId === thread.buyerId ? thread.sellerId : thread.buyerId;
    await NotificationService.create(recipientId, 'message', thread.id, 'New message in thread');

    return message;
  },

  /**
   * Get messages for a thread.
   */
  async getMessages(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_VIEW);

    const thread = await threadRepository.getByIdOrFail(threadId);
    this._requireParticipantOrModerator(session, thread);

    const messages = await messageRepository.getByThreadId(threadId);
    return messages.sort((a, b) => a.createdAt - b.createdAt);
  },

  /**
   * Get threads for the current user.
   */
  async getMyThreads(session) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_VIEW);

    const [asBuyer, asSeller] = await Promise.all([
      threadRepository.getByBuyerId(session.userId),
      threadRepository.getBySellerId(session.userId),
    ]);

    const all = [...asBuyer, ...asSeller];
    // Filter out archived threads for this user
    return all.filter(t => !t.archivedBy.includes(session.userId));
  },

  /**
   * Archive a thread (per-user soft archive).
   */
  async archive(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_VIEW);

    const thread = await threadRepository.getByIdOrFail(threadId);
    this._requireParticipant(session, thread);

    if (!thread.archivedBy.includes(session.userId)) {
      thread.archivedBy.push(session.userId);
      await threadRepository.update(thread);
    }

    return thread;
  },

  /**
   * Unarchive a thread (per-user).
   */
  async unarchive(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_VIEW);

    const thread = await threadRepository.getByIdOrFail(threadId);
    this._requireParticipant(session, thread);

    thread.archivedBy = thread.archivedBy.filter(id => id !== session.userId);
    await threadRepository.update(thread);
    return thread;
  },

  /**
   * Mark thread as read-only (called by transaction service on terminal state).
   */
  async markReadOnly(threadId) {
    const thread = await threadRepository.getByIdOrFail(threadId);
    thread.isReadOnly = true;
    thread.updatedAt = now();
    await threadRepository.update(thread);
    return thread;
  },

  /**
   * Find all threads shared between two users (in either buyer/seller direction).
   * Used internally when a block is created to immediately lock shared threads.
   */
  async markAllSharedThreadsReadOnly(userId1, userId2) {
    const [asBuyer1, asSeller1] = await Promise.all([
      threadRepository.getByBuyerId(userId1),
      threadRepository.getBySellerId(userId1),
    ]);
    const allForUser1 = [...asBuyer1, ...asSeller1];
    const shared = allForUser1.filter(t =>
      t.buyerId === userId2 || t.sellerId === userId2
    );

    await Promise.all(
      shared
        .filter(t => !t.isReadOnly)
        .map(t => this.markReadOnly(t.id))
    );
  },

  /**
   * Get thread by ID.
   */
  async getById(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.THREAD_VIEW);

    const thread = await threadRepository.getByIdOrFail(threadId);
    this._requireParticipantOrModerator(session, thread);
    return thread;
  },

  // ── Private ──

  _requireParticipant(session, thread) {
    if (session.userId !== thread.buyerId && session.userId !== thread.sellerId) {
      throw new AuthorizationError('Not a participant of this thread');
    }
  },

  _requireParticipantOrModerator(session, thread) {
    if (session.userId === thread.buyerId || session.userId === thread.sellerId) return;
    // Moderators and support agents can view threads
    try {
      requirePermission(session, Permissions.MODERATION_VIEW_QUEUE);
    } catch {
      try {
        requirePermission(session, Permissions.COMPLAINT_MANAGE);
      } catch {
        throw new AuthorizationError('Not authorized to view this thread');
      }
    }
  },
};
