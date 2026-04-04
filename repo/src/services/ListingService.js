/**
 * Listing Service — CRUD, versioning, lifecycle, pre-screening.
 */

import { listingRepository, listingVersionRepository } from '../repositories/index.js';
import { requirePermission, requireOwnership } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { validateTransition } from '../domain/validation/stateMachine.js';
import { validateListing, validateMedia, LIMITS } from '../domain/validation/rules.js';
import { Permissions } from '../domain/enums/permissions.js';
import { ListingStatus, LISTING_TRANSITIONS } from '../domain/enums/statuses.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { ModerationService } from './ModerationService.js';

export const ListingService = {
  /**
   * Create a listing (draft or auto-submit).
   */
  async create(session, listingData) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_CREATE);
    validateListing(listingData);

    if (listingData.media && listingData.media.length > 0) {
      validateMedia(listingData.media);
    }

    const listing = {
      id: generateId(),
      sellerId: session.userId,
      title: listingData.title.trim(),
      description: listingData.description.trim(),
      categoryId: listingData.categoryId,
      tagIds: listingData.tagIds || [],
      media: listingData.media || [],
      price: listingData.price,
      deliveryOptions: listingData.deliveryOptions || { pickup: true, delivery: false },
      isPinned: false,
      isFeatured: false,
      status: ListingStatus.DRAFT,
      createdAt: now(),
      updatedAt: now(),
    };

    await listingRepository.create(listing);
    await AuditService.log(session.userId, AuditActions.LISTING_CREATED, 'listing', listing.id);

    return listing;
  },

  /**
   * Update a listing (creates a new version snapshot).
   */
  async update(session, listingId, updates) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_EDIT);

    const listing = await listingRepository.getByIdOrFail(listingId);
    requireOwnership(session, listing.sellerId, Permissions.CONTENT_DELETE);

    // Cannot edit listings in terminal states
    if (listing.status === ListingStatus.SOLD || listing.status === ListingStatus.ARCHIVED) {
      throw new ValidationError('Cannot edit a listing in this state', { status: listing.status });
    }

    // Validate updates
    const merged = { ...listing, ...updates };
    validateListing(merged);
    if (updates.media) {
      validateMedia(updates.media);
    }

    // Save version snapshot before update
    await this._saveVersion(listing);

    // Apply updates
    const allowedFields = ['title', 'description', 'categoryId', 'tagIds', 'media', 'price', 'deliveryOptions'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        listing[field] = updates[field];
      }
    }
    listing.updatedAt = now();

    // If listing was rejected, resubmit for review on edit
    if (listing.status === ListingStatus.REJECTED) {
      validateTransition('listing', LISTING_TRANSITIONS, listing.status, ListingStatus.UNDER_REVIEW);
      listing.status = ListingStatus.UNDER_REVIEW;
    }

    await listingRepository.update(listing);
    await AuditService.log(session.userId, AuditActions.LISTING_UPDATED, 'listing', listingId);

    return listing;
  },

  /**
   * Publish a draft listing (draft → active, with pre-screening).
   */
  async publish(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_EDIT);

    const listing = await listingRepository.getByIdOrFail(listingId);
    requireOwnership(session, listing.sellerId);

    // Pre-screen for sensitive words
    const flagged = await ModerationService.preScreenContent(
      `${listing.title} ${listing.description}`
    );

    if (flagged.length > 0) {
      // Move to under_review instead of active
      validateTransition('listing', LISTING_TRANSITIONS, listing.status, ListingStatus.UNDER_REVIEW);
      listing.status = ListingStatus.UNDER_REVIEW;
      listing.updatedAt = now();
      await listingRepository.update(listing);

      // Create moderation case
      await ModerationService.createCase(session, {
        contentId: listing.id,
        contentType: 'listing',
        reason: 'pre_screen_flagged',
        flaggedWords: flagged,
      });

      await AuditService.log(session.userId, AuditActions.LISTING_STATUS_CHANGED, 'listing', listingId, {
        from: 'draft', to: 'under_review', reason: 'pre_screen_flagged',
      });

      return { listing, flagged: true, flaggedWords: flagged };
    }

    // No flags — publish directly
    validateTransition('listing', LISTING_TRANSITIONS, listing.status, ListingStatus.ACTIVE);
    listing.status = ListingStatus.ACTIVE;
    listing.updatedAt = now();
    await listingRepository.update(listing);

    await AuditService.log(session.userId, AuditActions.LISTING_STATUS_CHANGED, 'listing', listingId, {
      from: 'draft', to: 'active',
    });

    return { listing, flagged: false };
  },

  /**
   * Change listing status (moderator/admin only).
   */
  async changeStatus(session, listingId, newStatus) {
    validateSession(session);
    requirePermission(session, Permissions.MODERATION_DECIDE);

    const listing = await listingRepository.getByIdOrFail(listingId);
    validateTransition('listing', LISTING_TRANSITIONS, listing.status, newStatus);

    const oldStatus = listing.status;
    listing.status = newStatus;
    listing.updatedAt = now();

    await listingRepository.update(listing);
    await AuditService.log(session.userId, AuditActions.LISTING_STATUS_CHANGED, 'listing', listingId, {
      from: oldStatus, to: newStatus,
    });

    return listing;
  },

  /**
   * Rollback a listing to a previous version.
   */
  async rollback(session, listingId, versionId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_ROLLBACK);

    const listing = await listingRepository.getByIdOrFail(listingId);
    requireOwnership(session, listing.sellerId, Permissions.CONTENT_DELETE);

    // Cannot rollback listings in terminal states
    if (listing.status === ListingStatus.SOLD || listing.status === ListingStatus.ARCHIVED) {
      throw new ValidationError('Cannot rollback a listing in this state', { status: listing.status });
    }

    const version = await listingVersionRepository.getByIdOrFail(versionId);
    if (version.listingId !== listingId) {
      throw new ValidationError('Version does not belong to this listing');
    }

    // Save current state as a version before rollback
    await this._saveVersion(listing);

    // Restore versioned fields
    listing.title = version.snapshot.title;
    listing.description = version.snapshot.description;
    listing.categoryId = version.snapshot.categoryId;
    listing.tagIds = version.snapshot.tagIds;
    listing.media = version.snapshot.media;
    listing.price = version.snapshot.price;
    listing.deliveryOptions = version.snapshot.deliveryOptions;
    listing.updatedAt = now();

    await listingRepository.update(listing);
    await AuditService.log(session.userId, AuditActions.LISTING_ROLLED_BACK, 'listing', listingId, {
      versionId,
    });

    return listing;
  },

  /**
   * Get listing versions (owner or admin/moderator only).
   */
  async getVersions(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_VIEW);
    const listing = await listingRepository.getByIdOrFail(listingId);
    requireOwnership(session, listing.sellerId, Permissions.CONTENT_DELETE);
    return listingVersionRepository.getByListingId(listingId);
  },

  /**
   * Get a single listing.
   */
  async getById(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_VIEW);
    return listingRepository.getByIdOrFail(listingId);
  },

  /**
   * Get active listings (marketplace browsing).
   */
  async getActiveListings(session) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_VIEW);
    return listingRepository.getByStatus(ListingStatus.ACTIVE);
  },

  /**
   * Get my listings (seller view).
   */
  async getMyListings(session) {
    validateSession(session);
    return listingRepository.getBySellerId(session.userId);
  },

  /**
   * Pin/unpin a listing (moderator/admin only).
   */
  async togglePin(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_PIN);

    const listing = await listingRepository.getByIdOrFail(listingId);
    listing.isPinned = !listing.isPinned;
    listing.updatedAt = now();
    await listingRepository.update(listing);
    return listing;
  },

  /**
   * Feature/unfeature a listing (moderator/admin only).
   */
  async toggleFeature(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_FEATURE);

    const listing = await listingRepository.getByIdOrFail(listingId);
    listing.isFeatured = !listing.isFeatured;
    listing.updatedAt = now();
    await listingRepository.update(listing);
    return listing;
  },

  /**
   * Archive a listing.
   */
  async archive(session, listingId) {
    validateSession(session);
    requirePermission(session, Permissions.LISTING_DELETE);

    const listing = await listingRepository.getByIdOrFail(listingId);
    requireOwnership(session, listing.sellerId, Permissions.CONTENT_DELETE);

    validateTransition('listing', LISTING_TRANSITIONS, listing.status, ListingStatus.ARCHIVED);
    listing.status = ListingStatus.ARCHIVED;
    listing.updatedAt = now();
    await listingRepository.update(listing);

    await AuditService.log(session.userId, AuditActions.LISTING_STATUS_CHANGED, 'listing', listingId, {
      to: 'archived',
    });

    return listing;
  },

  // ── Private ──

  async _saveVersion(listing) {
    const versions = await listingVersionRepository.getByListingId(listing.id);

    // Enforce max 10 versions
    if (versions.length >= LIMITS.MAX_LISTING_VERSIONS) {
      // Remove oldest
      const sorted = versions.sort((a, b) => a.createdAt - b.createdAt);
      await listingVersionRepository.delete(sorted[0].id);
    }

    const version = {
      id: generateId(),
      listingId: listing.id,
      snapshot: {
        title: listing.title,
        description: listing.description,
        categoryId: listing.categoryId,
        tagIds: [...listing.tagIds],
        media: [...listing.media],
        price: listing.price,
        deliveryOptions: { ...listing.deliveryOptions },
      },
      createdAt: now(),
    };

    await listingVersionRepository.create(version);
    return version;
  },
};
