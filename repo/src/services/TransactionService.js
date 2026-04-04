/**
 * Transaction Service — state machine, reservation locks, expiry.
 * CRITICAL: This is the most complex state machine in the system.
 */

import { transactionRepository, listingRepository, threadRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { validateTransition } from '../domain/validation/stateMachine.js';
import { validateCancellation } from '../domain/validation/rules.js';
import { Permissions } from '../domain/enums/permissions.js';
import { Roles } from '../domain/enums/roles.js';
import {
  TransactionStatus, TRANSACTION_TRANSITIONS, TRANSACTION_TERMINAL_STATES,
  ListingStatus, LISTING_TRANSITIONS, CancellationReasons,
} from '../domain/enums/statuses.js';
import { generateId } from '../utils/id.js';
import { now, isExpired, THIRTY_MINUTES_MS } from '../utils/time.js';
import { ValidationError, ConflictError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { NotificationService } from './NotificationService.js';
import { ThreadService } from './ThreadService.js';

export const TransactionService = {
  /**
   * Create a transaction (starts at inquiry state).
   */
  async create(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_CREATE);

    const thread = await threadRepository.getByIdOrFail(threadId);

    // Only buyer can create transaction
    if (session.userId !== thread.buyerId) {
      throw new ValidationError('Only the buyer can initiate a transaction');
    }

    // Check no existing active transaction for this thread
    const existing = await transactionRepository.getByThreadId(threadId);
    if (existing && !TRANSACTION_TERMINAL_STATES.includes(existing.status)) {
      throw new ConflictError('Active transaction already exists for this thread');
    }

    const listing = await listingRepository.getByIdOrFail(thread.listingId);
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new ValidationError('Listing is not active');
    }

    const transaction = {
      id: generateId(),
      threadId,
      listingId: thread.listingId,
      buyerId: thread.buyerId,
      sellerId: thread.sellerId,
      status: TransactionStatus.INQUIRY,
      reservedAt: null,
      agreedAt: null,
      completedAt: null,
      canceledAt: null,
      cancellationReason: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await transactionRepository.create(transaction);
    await AuditService.log(session.userId, AuditActions.TRANSACTION_CREATED, 'transaction', transaction.id, {
      threadId, listingId: thread.listingId,
    });

    await NotificationService.create(thread.sellerId, 'transaction', transaction.id, 'New inquiry on your listing');

    return transaction;
  },

  /**
   * Advance transaction to a new state.
   */
  async transition(session, transactionId, targetStatus) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_UPDATE);

    const transaction = await transactionRepository.getByIdOrFail(transactionId);

    // Must be a participant
    this._requireParticipant(session, transaction);

    // Check for expired reservation before validating transition
    await this._checkReservationExpiry(transaction);

    // Validate the transition via state machine
    validateTransition('transaction', TRANSACTION_TRANSITIONS, transaction.status, targetStatus);

    // Enforce role-based step ownership:
    //   INQUIRY → RESERVED : seller accepts the inquiry
    //   RESERVED → AGREED  : buyer confirms they still want to proceed
    //   AGREED → COMPLETED : buyer confirms receipt / deal done
    this._requireRoleForTransition(session, transaction, targetStatus);

    const oldStatus = transaction.status;
    transaction.status = targetStatus;
    transaction.updatedAt = now();

    // Set state-specific timestamps
    switch (targetStatus) {
      case TransactionStatus.RESERVED:
        // Check no other active reservation on this listing
        await this._ensureNoActiveReservation(transaction.listingId, transaction.id);
        transaction.reservedAt = now();
        break;
      case TransactionStatus.AGREED:
        transaction.agreedAt = now();
        break;
      case TransactionStatus.COMPLETED:
        transaction.completedAt = now();
        // Mark listing as sold
        await this._markListingSold(transaction.listingId);
        // Mark thread as read-only
        await ThreadService.markReadOnly(transaction.threadId);
        break;
    }

    await transactionRepository.update(transaction);
    await AuditService.log(session.userId, AuditActions.TRANSACTION_STATUS_CHANGED, 'transaction', transactionId, {
      from: oldStatus, to: targetStatus,
    });

    // Notify other participant
    const recipientId = session.userId === transaction.buyerId ? transaction.sellerId : transaction.buyerId;
    await NotificationService.create(recipientId, 'transaction', transactionId,
      `Transaction moved to: ${targetStatus}`);

    return transaction;
  },

  /**
   * Cancel a transaction (requires reason code).
   */
  async cancel(session, transactionId, reasonCode) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_CANCEL);
    validateCancellation(reasonCode);

    const transaction = await transactionRepository.getByIdOrFail(transactionId);
    this._requireParticipant(session, transaction);

    // Check reservation expiry first
    await this._checkReservationExpiry(transaction);

    // Validate transition to canceled
    validateTransition('transaction', TRANSACTION_TRANSITIONS, transaction.status, TransactionStatus.CANCELED);

    const oldStatus = transaction.status;
    transaction.status = TransactionStatus.CANCELED;
    transaction.canceledAt = now();
    transaction.cancellationReason = reasonCode;
    transaction.updatedAt = now();

    await transactionRepository.update(transaction);

    // Mark thread read-only
    await ThreadService.markReadOnly(transaction.threadId);

    await AuditService.log(session.userId, AuditActions.TRANSACTION_CANCELED, 'transaction', transactionId, {
      from: oldStatus, reason: reasonCode,
    });

    // Notify other participant
    const recipientId = session.userId === transaction.buyerId ? transaction.sellerId : transaction.buyerId;
    await NotificationService.create(recipientId, 'transaction', transactionId,
      `Transaction canceled: ${reasonCode}`);

    return transaction;
  },

  /**
   * Get a transaction by ID.
   * Regular users: participant only. Support agents and admins: any transaction.
   */
  async getById(session, transactionId) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_VIEW);

    const transaction = await transactionRepository.getByIdOrFail(transactionId);

    // Check and update expired reservations on read
    await this._checkReservationExpiry(transaction);

    // Regular users can only view their own transactions
    const hasElevatedAccess = session.roles.some(r =>
      [Roles.SUPPORT_AGENT, Roles.ADMIN, Roles.MODERATOR].includes(r)
    );
    if (!hasElevatedAccess) {
      this._requireParticipant(session, transaction);
    }

    return transaction;
  },

  /**
   * Get a transaction by thread ID.
   * Used by the messaging UI to link a thread to its transaction.
   * Regular users: participant only. Elevated roles: any.
   */
  async getByThreadId(session, threadId) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_VIEW);

    const transaction = await transactionRepository.getByThreadId(threadId);
    if (!transaction) return null;

    await this._checkReservationExpiry(transaction);

    const hasElevatedAccess = session.roles.some(r =>
      [Roles.SUPPORT_AGENT, Roles.ADMIN, Roles.MODERATOR].includes(r)
    );
    if (!hasElevatedAccess) {
      this._requireParticipant(session, transaction);
    }

    return transaction;
  },

  /**
   * Get transactions for the current user.
   */
  async getMyTransactions(session) {
    validateSession(session);
    requirePermission(session, Permissions.TRANSACTION_VIEW);

    const [asBuyer, asSeller] = await Promise.all([
      transactionRepository.getByBuyerId(session.userId),
      transactionRepository.getBySellerId(session.userId),
    ]);

    const all = [...asBuyer, ...asSeller];

    // Check expiry on all reserved transactions in parallel (M-3 fix)
    await Promise.all(all.map(tx => this._checkReservationExpiry(tx)));

    return all;
  },

  /**
   * Check and expire any stale reservations globally (called periodically).
   */
  async expireStaleReservations() {
    const reserved = await transactionRepository.getByStatus(TransactionStatus.RESERVED);
    const expired = [];

    for (const tx of reserved) {
      if (tx.reservedAt && isExpired(tx.reservedAt, THIRTY_MINUTES_MS)) {
        tx.status = TransactionStatus.CANCELED;
        tx.canceledAt = now();
        tx.cancellationReason = CancellationReasons.RESERVATION_EXPIRED;
        tx.updatedAt = now();
        await transactionRepository.update(tx);
        await ThreadService.markReadOnly(tx.threadId);
        await AuditService.log('system', AuditActions.TRANSACTION_EXPIRED, 'transaction', tx.id);
        await NotificationService.create(tx.buyerId, 'transaction', tx.id, 'Reservation expired');
        await NotificationService.create(tx.sellerId, 'transaction', tx.id, 'Reservation expired');
        expired.push(tx);
      }
    }

    return expired;
  },

  // ── Private ──

  _requireParticipant(session, transaction) {
    if (session.userId !== transaction.buyerId && session.userId !== transaction.sellerId) {
      throw new ValidationError('Not a participant of this transaction');
    }
  },

  /**
   * Enforce who can trigger each transition step.
   *   INQUIRY → RESERVED  : seller only  (seller accepts the inquiry)
   *   RESERVED → AGREED   : buyer only   (buyer confirms they want to proceed)
   *   AGREED → COMPLETED  : buyer only   (buyer confirms receipt / deal done)
   */
  _requireRoleForTransition(session, transaction, targetStatus) {
    const isBuyer = session.userId === transaction.buyerId;
    const isSeller = session.userId === transaction.sellerId;

    if (targetStatus === TransactionStatus.RESERVED && !isSeller) {
      throw new ValidationError('Only the seller can accept an inquiry (move to reserved)');
    }
    if (targetStatus === TransactionStatus.AGREED && !isBuyer) {
      throw new ValidationError('Only the buyer can confirm a reservation (move to agreed)');
    }
    if (targetStatus === TransactionStatus.COMPLETED && !isBuyer) {
      throw new ValidationError('Only the buyer can confirm completion');
    }
    // CANCELED is allowed by either participant — no restriction here
  },

  async _checkReservationExpiry(transaction) {
    if (
      transaction.status === TransactionStatus.RESERVED &&
      transaction.reservedAt &&
      isExpired(transaction.reservedAt, THIRTY_MINUTES_MS)
    ) {
      transaction.status = TransactionStatus.CANCELED;
      transaction.canceledAt = now();
      transaction.cancellationReason = CancellationReasons.RESERVATION_EXPIRED;
      transaction.updatedAt = now();
      await transactionRepository.update(transaction);
      await ThreadService.markReadOnly(transaction.threadId);
      await AuditService.log('system', AuditActions.TRANSACTION_EXPIRED, 'transaction', transaction.id);
      // Notify both participants of expiry
      await NotificationService.create(transaction.buyerId, 'transaction', transaction.id, 'Your reservation has expired');
      await NotificationService.create(transaction.sellerId, 'transaction', transaction.id, 'A reservation on your listing has expired');
    }
  },

  async _ensureNoActiveReservation(listingId, excludeTransactionId) {
    const listingTransactions = await transactionRepository.getByListingId(listingId);
    for (const tx of listingTransactions) {
      if (tx.id === excludeTransactionId) continue;
      if (tx.status === TransactionStatus.RESERVED) {
        // Check if it's expired
        if (tx.reservedAt && isExpired(tx.reservedAt, THIRTY_MINUTES_MS)) {
          // Auto-expire it
          await this._checkReservationExpiry(tx);
        } else {
          throw new ConflictError('Another reservation is active on this listing');
        }
      }
    }
  },

  async _markListingSold(listingId) {
    const listing = await listingRepository.getByIdOrFail(listingId);
    validateTransition('listing', LISTING_TRANSITIONS, listing.status, ListingStatus.SOLD);
    listing.status = ListingStatus.SOLD;
    listing.updatedAt = now();
    await listingRepository.update(listing);
  },
};
