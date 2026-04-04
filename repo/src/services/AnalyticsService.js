/**
 * Analytics Service — KPI computation from event data.
 * All calculations happen locally from IndexedDB timestamps.
 */

import { transactionRepository, complaintRepository, listingRepository, auditLogRepository } from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { ComplaintStatus, TransactionStatus } from '../domain/enums/statuses.js';
import { ValidationError } from '../utils/errors.js';

export const AnalyticsService = {
  /**
   * Compute all KPIs.
   */
  async computeKPIs(session) {
    validateSession(session);
    requirePermission(session, Permissions.ANALYTICS_VIEW);

    const [postVolume, claimRate, avgHandlingTime] = await Promise.all([
      this._computePostVolume(),
      this._computeClaimRate(),
      this._computeAvgHandlingTime(),
    ]);

    return {
      postVolume,
      claimRate,
      avgHandlingTime,
      computedAt: Date.now(),
    };
  },

  /**
   * Compute trend data (time-series aggregates).
   */
  async computeTrends(session, { metric, periodDays = 30, bucketSize = 'day' }) {
    validateSession(session);
    requirePermission(session, Permissions.ANALYTICS_VIEW);

    const cutoff = Date.now() - (periodDays * 24 * 60 * 60 * 1000);

    switch (metric) {
      case 'listings':
        return this._computeListingTrend(cutoff, bucketSize);
      case 'transactions':
        return this._computeTransactionTrend(cutoff, bucketSize);
      case 'complaints':
        return this._computeComplaintTrend(cutoff, bucketSize);
      default:
        throw new ValidationError(`Unknown trend metric: "${metric}". Supported: listings, transactions, complaints`);
    }
  },

  // ── Private KPI Calculations ──

  async _computePostVolume() {
    const listings = await listingRepository.getAll();
    const now = Date.now();
    const last24h = listings.filter(l => now - l.createdAt <= 24 * 60 * 60 * 1000).length;
    const last7d = listings.filter(l => now - l.createdAt <= 7 * 24 * 60 * 60 * 1000).length;
    const last30d = listings.filter(l => now - l.createdAt <= 30 * 24 * 60 * 60 * 1000).length;

    return {
      total: listings.length,
      last24h,
      last7d,
      last30d,
    };
  },

  async _computeClaimRate() {
    const [transactions, complaints] = await Promise.all([
      transactionRepository.getAll(),
      complaintRepository.getAll(),
    ]);

    const totalTransactions = transactions.length;
    const totalComplaints = complaints.length;
    const rate = totalTransactions > 0 ? totalComplaints / totalTransactions : 0;

    return {
      totalTransactions,
      totalComplaints,
      rate: Math.round(rate * 10000) / 10000, // 4 decimal places
      percentage: Math.round(rate * 10000) / 100, // percentage with 2 decimals
    };
  },

  async _computeAvgHandlingTime() {
    const complaints = await complaintRepository.getAll();
    // Only include complaints that have been resolved/rejected AND have a resolvedAt timestamp
    const resolved = complaints.filter(c =>
      (c.status === ComplaintStatus.RESOLVED || c.status === ComplaintStatus.REJECTED) &&
      c.resolvedAt && c.createdAt
    );

    if (resolved.length === 0) {
      return { averageMs: 0, averageHours: 0, resolvedCount: 0 };
    }

    // Use resolvedAt - createdAt: actual time from creation to resolution
    const totalMs = resolved.reduce((sum, c) => sum + (c.resolvedAt - c.createdAt), 0);

    const averageMs = totalMs / resolved.length;
    return {
      averageMs: Math.round(averageMs),
      averageHours: Math.round(averageMs / (60 * 60 * 1000) * 100) / 100,
      resolvedCount: resolved.length,
    };
  },

  // ── Trend Calculations ──

  _bucketTimestamp(timestamp, bucketSize) {
    const date = new Date(timestamp);
    if (bucketSize === 'day') {
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    }
    if (bucketSize === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `${weekStart.getFullYear()}-${(weekStart.getMonth() + 1).toString().padStart(2, '0')}-${weekStart.getDate().toString().padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  },

  async _computeListingTrend(cutoff, bucketSize) {
    const listings = await listingRepository.getAll();
    return this._aggregate(listings.filter(l => l.createdAt >= cutoff), bucketSize);
  },

  async _computeTransactionTrend(cutoff, bucketSize) {
    const transactions = await transactionRepository.getAll();
    return this._aggregate(transactions.filter(t => t.createdAt >= cutoff), bucketSize);
  },

  async _computeComplaintTrend(cutoff, bucketSize) {
    const complaints = await complaintRepository.getAll();
    return this._aggregate(complaints.filter(c => c.createdAt >= cutoff), bucketSize);
  },

  _aggregate(items, bucketSize) {
    const buckets = {};
    for (const item of items) {
      const key = this._bucketTimestamp(item.createdAt, bucketSize);
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return Object.entries(buckets)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
};
