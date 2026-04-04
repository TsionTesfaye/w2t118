/**
 * Support Service — complaints and refund workflows.
 * State machines: Complaint (open → investigating → resolved/rejected)
 *                 Refund (requested → approved/rejected)
 */

import { complaintRepository, refundRepository, transactionRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { validateTransition } from '../domain/validation/stateMachine.js';
import { validateComplaint } from '../domain/validation/rules.js';
import { Permissions } from '../domain/enums/permissions.js';
import { Roles } from '../domain/enums/roles.js';
import {
  ComplaintStatus, COMPLAINT_TRANSITIONS,
  RefundStatus, REFUND_TRANSITIONS,
  TransactionStatus,
} from '../domain/enums/statuses.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { NotificationService } from './NotificationService.js';

export const SupportService = {
  // ── Complaints ──

  /**
   * Create a complaint (user).
   */
  async createComplaint(session, data) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_CREATE);
    validateComplaint(data);

    // Verify transaction exists and user is a participant
    const transaction = await transactionRepository.getByIdOrFail(data.transactionId);
    if (transaction.buyerId !== session.userId && transaction.sellerId !== session.userId) {
      throw new ValidationError('You are not a participant of this transaction');
    }

    // Complaints are only valid on transactions where an exchange was agreed or completed
    const complaintableStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
    if (!complaintableStates.includes(transaction.status)) {
      throw new ValidationError('Complaints can only be filed on agreed or completed transactions');
    }

    // Prevent duplicate complaints from the same user on the same transaction
    const existing = await complaintRepository.getByIndex('transactionId', data.transactionId);
    const duplicate = existing.find(c => c.userId === session.userId);
    if (duplicate) {
      throw new ValidationError('You have already filed a complaint for this transaction');
    }

    const complaint = {
      id: generateId(),
      userId: session.userId,
      transactionId: data.transactionId,
      issueType: data.issueType,
      description: data.description.trim(),
      status: ComplaintStatus.OPEN,
      resolution: null,
      resolvedAt: null,
      assignedTo: null,
      slaDeadline: now() + (24 * 60 * 60 * 1000), // 24-hour SLA
      createdAt: now(),
      updatedAt: now(),
    };

    await complaintRepository.create(complaint);
    await AuditService.log(session.userId, AuditActions.COMPLAINT_CREATED, 'complaint', complaint.id, {
      transactionId: data.transactionId, issueType: data.issueType,
    });

    return complaint;
  },

  /**
   * Transition complaint status (support agent).
   */
  async transitionComplaint(session, complaintId, newStatus, resolution = null) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_MANAGE);

    const complaint = await complaintRepository.getByIdOrFail(complaintId);
    validateTransition('complaint', COMPLAINT_TRANSITIONS, complaint.status, newStatus);

    // Resolution required when resolving or rejecting
    if ((newStatus === ComplaintStatus.RESOLVED || newStatus === ComplaintStatus.REJECTED) && !resolution) {
      throw new ValidationError('Resolution description is required for final states');
    }

    const oldStatus = complaint.status;
    complaint.status = newStatus;
    complaint.updatedAt = now();

    if (newStatus === ComplaintStatus.INVESTIGATING) {
      complaint.assignedTo = session.userId;
    }
    if (resolution) {
      complaint.resolution = resolution;
    }
    if (newStatus === ComplaintStatus.RESOLVED || newStatus === ComplaintStatus.REJECTED) {
      complaint.resolvedAt = now();
    }

    await complaintRepository.update(complaint);
    await AuditService.log(session.userId, AuditActions.COMPLAINT_STATUS_CHANGED, 'complaint', complaintId, {
      from: oldStatus, to: newStatus, resolution,
    });

    // Notify complaint creator
    await NotificationService.create(complaint.userId, 'complaint', complaintId,
      `Complaint status updated to: ${newStatus}`);

    return complaint;
  },

  /**
   * Get complaint by ID.
   */
  async getComplaintById(session, complaintId) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_VIEW);

    const complaint = await complaintRepository.getByIdOrFail(complaintId);

    // Regular users can only see their own complaints
    const isElevated = session.roles.includes(Roles.SUPPORT_AGENT) || session.roles.includes(Roles.ADMIN);
    if (!isElevated && complaint.userId !== session.userId) {
      throw new ValidationError('Not authorized to view this complaint');
    }

    return complaint;
  },

  /**
   * Get complaints for current user.
   */
  async getMyComplaints(session) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_VIEW);
    return complaintRepository.getByUserId(session.userId);
  },

  /**
   * Get all complaints (support agent queue) with optional pagination.
   * @param {Object} [opts] - { page: 1, pageSize: 50 }
   */
  async getAllComplaints(session, { page = 1, pageSize = 50 } = {}) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_MANAGE);
    const all = await complaintRepository.getAll();
    const start = (page - 1) * pageSize;
    return {
      items: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
    };
  },

  /**
   * Get open/investigating complaints (support agent queue) with optional pagination.
   * @param {Object} [opts] - { page: 1, pageSize: 50 }
   */
  async getOpenComplaints(session, { page = 1, pageSize = 50 } = {}) {
    validateSession(session);
    requirePermission(session, Permissions.COMPLAINT_MANAGE);

    const [open, investigating] = await Promise.all([
      complaintRepository.getByStatus(ComplaintStatus.OPEN),
      complaintRepository.getByStatus(ComplaintStatus.INVESTIGATING),
    ]);

    const sorted = [...open, ...investigating].sort((a, b) => a.createdAt - b.createdAt);
    const start = (page - 1) * pageSize;
    return {
      items: sorted.slice(start, start + pageSize),
      total: sorted.length,
      page,
      pageSize,
    };
  },

  // ── Refunds ──

  /**
   * Request a refund (tied to a complaint).
   */
  async requestRefund(session, { complaintId, reason }) {
    validateSession(session);
    requirePermission(session, Permissions.REFUND_REQUEST);

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Refund reason is required');
    }

    const complaint = await complaintRepository.getByIdOrFail(complaintId);

    // Only the complaint creator can request a refund
    if (complaint.userId !== session.userId) {
      throw new ValidationError('Only the complaint creator can request a refund');
    }

    // Refund only makes sense once the complaint is being investigated or resolved
    const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
    if (!refundableStates.includes(complaint.status)) {
      throw new ValidationError('Refunds can only be requested on complaints that are under investigation or resolved');
    }

    // Check for existing refund
    const existingRefund = await refundRepository.getByComplaintId(complaintId);
    if (existingRefund) {
      throw new ValidationError('Refund already requested for this complaint');
    }

    const refund = {
      id: generateId(),
      complaintId,
      transactionId: complaint.transactionId,
      userId: session.userId,
      reason: reason.trim(),
      status: RefundStatus.REQUESTED,
      decidedBy: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await refundRepository.create(refund);
    await AuditService.log(session.userId, AuditActions.REFUND_REQUESTED, 'refund', refund.id, {
      complaintId, transactionId: complaint.transactionId,
    });

    return refund;
  },

  /**
   * Approve or reject a refund (support agent).
   */
  async decideRefund(session, refundId, decision) {
    validateSession(session);
    requirePermission(session, Permissions.REFUND_APPROVE);

    if (!['approved', 'rejected'].includes(decision)) {
      throw new ValidationError('Decision must be "approved" or "rejected"');
    }

    const refund = await refundRepository.getByIdOrFail(refundId);
    const targetStatus = decision === 'approved' ? RefundStatus.APPROVED : RefundStatus.REJECTED;
    validateTransition('refund', REFUND_TRANSITIONS, refund.status, targetStatus);

    refund.status = targetStatus;
    refund.decidedBy = session.userId;
    refund.updatedAt = now();

    await refundRepository.update(refund);
    await AuditService.log(session.userId, AuditActions.REFUND_DECISION, 'refund', refundId, {
      decision, complaintId: refund.complaintId,
    });

    // Notify refund requester
    await NotificationService.create(refund.userId, 'refund', refundId,
      `Refund ${decision}`);

    return refund;
  },

  /**
   * Get refund by complaint.
   * Regular users: own complaints only. Support agents and admins: any.
   */
  async getRefundByComplaint(session, complaintId) {
    validateSession(session);
    requirePermission(session, Permissions.REFUND_VIEW);

    // Regular users can only view refunds on their own complaints
    const hasElevatedAccess = session.roles.some(r =>
      [Roles.SUPPORT_AGENT, Roles.ADMIN].includes(r)
    );
    if (!hasElevatedAccess) {
      const complaint = await complaintRepository.getByIdOrFail(complaintId);
      if (complaint.userId !== session.userId) {
        throw new ValidationError('Not authorized to view this refund');
      }
    }

    return refundRepository.getByComplaintId(complaintId);
  },

  /**
   * Get all refunds (support agent).
   */
  async getAllRefunds(session) {
    validateSession(session);
    requirePermission(session, Permissions.REFUND_APPROVE);
    return refundRepository.getAll();
  },
};
