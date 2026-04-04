/**
 * Delivery Service — coverage validation and capacity enforcement.
 */

import { deliveryBookingRepository, coverageZipRepository, transactionRepository, listingRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { LIMITS } from '../domain/validation/rules.js';
import { getZipPrefix } from '../utils/formatting.js';
import { getDeliveryWindowSlots } from '../utils/time.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';
import { ValidationError, CapacityError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';

export const DeliveryService = {
  /**
   * Check if a ZIP code is in the service area.
   */
  async isZipCovered(zipCode) {
    if (!zipCode || !/^\d{5}$/.test(zipCode)) {
      throw new ValidationError('Invalid ZIP code', { zipCode: 'Must be 5 digits' });
    }
    const prefix = getZipPrefix(zipCode);
    const coverage = await coverageZipRepository.getByPrefix(prefix);
    return !!coverage;
  },

  /**
   * Get available delivery windows for a date.
   */
  async getAvailableWindows(session, date) {
    validateSession(session);
    requirePermission(session, Permissions.DELIVERY_VIEW_COVERAGE);

    const slots = getDeliveryWindowSlots(date);
    const availability = [];

    for (const slot of slots) {
      const bookings = await deliveryBookingRepository.getByWindowKey(slot.windowKey);
      const bookedCount = bookings.length;
      availability.push({
        ...slot,
        bookedCount,
        availableSlots: LIMITS.MAX_DELIVERIES_PER_WINDOW - bookedCount,
        isFull: bookedCount >= LIMITS.MAX_DELIVERIES_PER_WINDOW,
      });
    }

    return availability;
  },

  /**
   * Book a delivery.
   */
  async bookDelivery(session, { transactionId, windowKey, zipCode }) {
    validateSession(session);
    requirePermission(session, Permissions.DELIVERY_BOOK);

    // Verify the caller is a participant of the transaction
    const transaction = await transactionRepository.getByIdOrFail(transactionId);
    if (transaction.buyerId !== session.userId && transaction.sellerId !== session.userId) {
      throw new ValidationError('You are not a participant of this transaction');
    }

    // Verify the listing actually offers delivery
    const listing = await listingRepository.getByIdOrFail(transaction.listingId);
    if (!listing.deliveryOptions?.delivery) {
      throw new ValidationError('This listing does not offer delivery');
    }

    // Validate ZIP coverage
    const isCovered = await this.isZipCovered(zipCode);
    if (!isCovered) {
      throw new ValidationError('ZIP code is not in the delivery service area', { zipCode: 'Not covered' });
    }

    // Check capacity
    const bookings = await deliveryBookingRepository.getByWindowKey(windowKey);
    if (bookings.length >= LIMITS.MAX_DELIVERIES_PER_WINDOW) {
      throw new CapacityError(`Delivery window ${windowKey} is full (max ${LIMITS.MAX_DELIVERIES_PER_WINDOW})`, {
        windowKey, current: bookings.length, max: LIMITS.MAX_DELIVERIES_PER_WINDOW,
      });
    }

    // Check for duplicate booking
    const existing = await deliveryBookingRepository.getByTransactionId(transactionId);
    if (existing) {
      throw new ValidationError('Delivery already booked for this transaction');
    }

    const booking = {
      id: generateId(),
      transactionId,
      windowKey,
      zipCode,
      userId: session.userId,
      createdAt: now(),
    };

    await deliveryBookingRepository.create(booking);
    await AuditService.log(session.userId, AuditActions.DELIVERY_BOOKED, 'delivery', booking.id, {
      transactionId, windowKey, zipCode,
    });

    return booking;
  },

  // ── Admin: Coverage Management ──

  /**
   * Add a ZIP prefix to coverage.
   */
  async addCoveragePrefix(session, prefix) {
    validateSession(session);
    requirePermission(session, Permissions.DELIVERY_MANAGE_COVERAGE);

    if (!prefix || !/^\d{3}$/.test(prefix)) {
      throw new ValidationError('ZIP prefix must be exactly 3 digits', { prefix: 'Must be 3 digits' });
    }

    const existing = await coverageZipRepository.getByPrefix(prefix);
    if (existing) {
      throw new ValidationError('Prefix already in coverage table');
    }

    const entry = {
      id: generateId(),
      prefix,
      createdAt: now(),
    };

    await coverageZipRepository.create(entry);
    await AuditService.log(session.userId, AuditActions.COVERAGE_UPDATED, 'coverage', entry.id, {
      action: 'added', prefix,
    });

    return entry;
  },

  /**
   * Remove a ZIP prefix from coverage.
   */
  async removeCoveragePrefix(session, prefix) {
    validateSession(session);
    requirePermission(session, Permissions.DELIVERY_MANAGE_COVERAGE);

    const existing = await coverageZipRepository.getByPrefix(prefix);
    if (!existing) {
      throw new ValidationError('Prefix not found in coverage table');
    }

    await coverageZipRepository.delete(existing.id);
    await AuditService.log(session.userId, AuditActions.COVERAGE_UPDATED, 'coverage', existing.id, {
      action: 'removed', prefix,
    });
  },

  /**
   * Get all coverage prefixes.
   */
  async getAllCoverage(session) {
    validateSession(session);
    requirePermission(session, Permissions.DELIVERY_VIEW_COVERAGE);
    return coverageZipRepository.getAll();
  },
};
