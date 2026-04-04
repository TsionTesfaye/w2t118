/**
 * Moderation Service — pre-screening, review queue, decisions.
 * Pipeline: report → pre-screen → review → decision → penalty
 */

import { moderationCaseRepository, sensitiveWordRepository, reportRepository, listingRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { validateTransition } from '../domain/validation/stateMachine.js';
import { Permissions } from '../domain/enums/permissions.js';
import {
  ModerationStatus, MODERATION_TRANSITIONS,
  ReportStatus, REPORT_TRANSITIONS,
  ListingStatus, LISTING_TRANSITIONS,
} from '../domain/enums/statuses.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { NotificationService } from './NotificationService.js';

export const ModerationService = {
  /**
   * Pre-screen content against sensitive word list.
   * Returns array of flagged words. Empty = clean.
   */
  async preScreenContent(text) {
    if (!text || typeof text !== 'string') return [];

    const words = await sensitiveWordRepository.getAll();
    const lowerText = text.toLowerCase();
    const flagged = [];

    for (const entry of words) {
      const word = entry.word.toLowerCase();
      if (entry.matchType === 'exact') {
        const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
        if (regex.test(lowerText)) {
          flagged.push(entry.word);
        }
      } else {
        // substring match (default)
        if (lowerText.includes(word)) {
          flagged.push(entry.word);
        }
      }
    }

    return flagged;
  },

  /**
   * Create a moderation case (from pre-screen or report).
   */
  async createCase(session, { contentId, contentType, reason, flaggedWords = [], reportId = null }) {
    // Validate reportId referential integrity before creating the case
    if (reportId) {
      const report = await reportRepository.getById(reportId);
      if (!report) {
        throw new ValidationError('Linked report does not exist', { reportId: 'Report not found' });
      }
    }

    const moderationCase = {
      id: generateId(),
      contentId,
      contentType, // 'listing', 'comment', 'user'
      reason,
      flaggedWords,
      reportId,
      status: ModerationStatus.PENDING,
      reviewerId: null,
      decision: null,
      violationTags: [],
      penalty: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await moderationCaseRepository.create(moderationCase);
    await AuditService.log(
      session ? session.userId : 'system',
      AuditActions.MODERATION_CASE_CREATED,
      'moderation_case',
      moderationCase.id,
      { contentId, contentType, reason }
    );

    return moderationCase;
  },

  /**
   * Pick up a case for review (moderator).
   */
  async pickUpCase(session, caseId) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_REVIEW);

    const modCase = await moderationCaseRepository.getByIdOrFail(caseId);
    validateTransition('moderation_case', MODERATION_TRANSITIONS, modCase.status, ModerationStatus.IN_REVIEW);

    modCase.status = ModerationStatus.IN_REVIEW;
    modCase.reviewerId = session.userId;
    modCase.updatedAt = now();

    await moderationCaseRepository.update(modCase);

    // Advance linked report from OPEN → UNDER_REVIEW (if applicable)
    if (modCase.reportId) {
      const report = await reportRepository.getById(modCase.reportId);
      if (report && report.status === ReportStatus.OPEN) {
        validateTransition('report', REPORT_TRANSITIONS, report.status, ReportStatus.UNDER_REVIEW);
        report.status = ReportStatus.UNDER_REVIEW;
        report.updatedAt = now();
        await reportRepository.update(report);
      }
    }

    return modCase;
  },

  /**
   * Make a decision on a moderation case.
   */
  async decide(session, caseId, { decision, violationTags = [], penalty = null }) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_DECIDE);

    if (!['approved', 'rejected'].includes(decision)) {
      throw new ValidationError('Decision must be "approved" or "rejected"');
    }

    const modCase = await moderationCaseRepository.getByIdOrFail(caseId);

    const targetStatus = decision === 'approved' ? ModerationStatus.APPROVED : ModerationStatus.REJECTED;
    validateTransition('moderation_case', MODERATION_TRANSITIONS, modCase.status, targetStatus);

    if (decision === 'rejected' && violationTags.length === 0) {
      throw new ValidationError('Rejection requires at least one violation tag');
    }

    modCase.status = targetStatus;
    modCase.decision = decision;
    modCase.violationTags = violationTags;
    modCase.penalty = penalty;
    modCase.reviewerId = session.userId;
    modCase.updatedAt = now();

    await moderationCaseRepository.update(modCase);
    await AuditService.log(session.userId, AuditActions.MODERATION_DECISION, 'moderation_case', caseId, {
      decision, violationTags, penalty,
    });

    // Close the linked report lifecycle (decision is single source of truth)
    if (modCase.reportId) {
      const report = await reportRepository.getById(modCase.reportId);
      if (report && report.status !== ReportStatus.RESOLVED && report.status !== ReportStatus.DISMISSED) {
        // Advance to UNDER_REVIEW first if still OPEN
        if (report.status === ReportStatus.OPEN) {
          validateTransition('report', REPORT_TRANSITIONS, report.status, ReportStatus.UNDER_REVIEW);
          report.status = ReportStatus.UNDER_REVIEW;
        }
        const finalReportStatus = decision === 'rejected' ? ReportStatus.RESOLVED : ReportStatus.DISMISSED;
        validateTransition('report', REPORT_TRANSITIONS, report.status, finalReportStatus);
        report.status = finalReportStatus;
        report.decision = decision;
        report.violationTags = violationTags;
        report.penalty = penalty;
        report.updatedAt = now();
        await reportRepository.update(report);
        await AuditService.log(session.userId, AuditActions.REPORT_STATUS_CHANGED, 'report', modCase.reportId, {
          from: ReportStatus.UNDER_REVIEW, to: finalReportStatus, reason: 'moderation_decision',
        });
      }
    }

    // If the case is for a listing under review, update the listing status
    if (modCase.contentType === 'listing') {
      const listing = await listingRepository.getById(modCase.contentId);
      if (listing && listing.status === ListingStatus.UNDER_REVIEW) {
        const newListingStatus = decision === 'approved' ? ListingStatus.ACTIVE : ListingStatus.REJECTED;
        validateTransition('listing', LISTING_TRANSITIONS, listing.status, newListingStatus);
        listing.status = newListingStatus;
        listing.updatedAt = now();
        await listingRepository.update(listing);
        await AuditService.log(session.userId, AuditActions.LISTING_STATUS_CHANGED, 'listing', modCase.contentId, {
          from: ListingStatus.UNDER_REVIEW, to: newListingStatus, reason: 'moderation_decision',
        });
        // Notify the listing seller
        await NotificationService.create(listing.sellerId, 'moderation', caseId,
          `Your listing has been ${decision === 'approved' ? 'approved and published' : 'rejected by moderation'}`
        );
      }
    }

    return modCase;
  },

  /**
   * Get the review queue (pending and in-review cases).
   */
  async getReviewQueue(session) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_VIEW_QUEUE);

    const [pending, inReview] = await Promise.all([
      moderationCaseRepository.getByStatus(ModerationStatus.PENDING),
      moderationCaseRepository.getByStatus(ModerationStatus.IN_REVIEW),
    ]);

    return [...pending, ...inReview].sort((a, b) => a.createdAt - b.createdAt);
  },

  /**
   * Get case by ID.
   */
  async getCaseById(session, caseId) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_REVIEW);
    return moderationCaseRepository.getByIdOrFail(caseId);
  },

  // ── Reports ──

  /**
   * Create a report (user reports another user or content).
   */
  async createReport(session, { targetId, targetType, reason, description }) {
    validateSession(session);
    requirePermission(session, Permissions.REPORT_CREATE);

    if (!targetId || !targetType || !reason) {
      throw new ValidationError('Target, type, and reason are required for a report');
    }

    const report = {
      id: generateId(),
      reporterId: session.userId,
      targetId,
      targetType, // 'user', 'listing', 'comment'
      reason,
      description: description || '',
      status: ReportStatus.OPEN,
      decision: null,
      createdAt: now(),
      updatedAt: now(),
    };

    await reportRepository.create(report);
    await AuditService.log(session.userId, AuditActions.REPORT_CREATED, 'report', report.id, {
      targetId, targetType, reason,
    });

    // Auto-create moderation case from report
    await this.createCase(session, {
      contentId: targetId,
      contentType: targetType,
      reason: `report: ${reason}`,
      reportId: report.id,
    });

    return report;
  },

  /**
   * Update report status.
   */
  async updateReportStatus(session, reportId, newStatus) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_DECIDE);

    const report = await reportRepository.getByIdOrFail(reportId);
    validateTransition('report', REPORT_TRANSITIONS, report.status, newStatus);

    const oldStatus = report.status;
    report.status = newStatus;
    report.updatedAt = now();

    await reportRepository.update(report);
    await AuditService.log(session.userId, AuditActions.REPORT_STATUS_CHANGED, 'report', reportId, {
      from: oldStatus, to: newStatus,
    });

    return report;
  },

  /**
   * Get all reports (moderator view).
   */
  async getAllReports(session) {
    validateSession(session);
    requirePermission(session, Permissions.REPORT_VIEW);
    return reportRepository.getAll();
  },

  // ── Sensitive Word Management (Admin) ──

  /**
   * Add a sensitive word.
   */
  async addSensitiveWord(session, word, matchType = 'substring') {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_MANAGE_SENSITIVE_WORDS);

    if (!word || word.trim().length === 0) {
      throw new ValidationError('Word is required');
    }
    if (!['exact', 'substring'].includes(matchType)) {
      throw new ValidationError('matchType must be "exact" or "substring"');
    }

    const existing = await sensitiveWordRepository.getByWord(word.toLowerCase().trim());
    if (existing) {
      throw new ValidationError('Word already exists in the sensitive word list');
    }

    const entry = {
      id: generateId(),
      word: word.toLowerCase().trim(),
      matchType,
      createdAt: now(),
    };

    await sensitiveWordRepository.create(entry);
    await AuditService.log(session.userId, AuditActions.SENSITIVE_WORD_ADDED, 'sensitive_word', entry.id, {
      word: entry.word, matchType,
    });

    return entry;
  },

  /**
   * Remove a sensitive word.
   */
  async removeSensitiveWord(session, wordId) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_MANAGE_SENSITIVE_WORDS);

    const entry = await sensitiveWordRepository.getByIdOrFail(wordId);
    await sensitiveWordRepository.delete(wordId);
    await AuditService.log(session.userId, AuditActions.SENSITIVE_WORD_REMOVED, 'sensitive_word', wordId, {
      word: entry.word,
    });
  },

  /**
   * Get all sensitive words.
   */
  async getAllSensitiveWords(session) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_MANAGE_SENSITIVE_WORDS);
    return sensitiveWordRepository.getAll();
  },
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
