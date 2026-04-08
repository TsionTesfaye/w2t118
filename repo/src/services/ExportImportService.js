/**
 * Export/Import Service — admin data management.
 *
 * Two snapshot modes:
 *   • Redacted  — default safe export; credential fields stripped from users.
 *   • Restorable — passphrase-encrypted backup; user credentials preserved
 *                  inside an AES-GCM encrypted bundle for disaster recovery.
 *
 * Plus: filtered store exports, report CSV/JSON exports, analytics, import.
 */

import {
  userRepository, listingRepository, transactionRepository, threadRepository,
  messageRepository, addressRepository, complaintRepository, refundRepository,
  reportRepository, auditLogRepository, notificationRepository, categoryRepository,
  coverageZipRepository, sensitiveWordRepository, blockRepository,
  commentRepository, moderationCaseRepository, deliveryBookingRepository,
  listingVersionRepository,
} from '../repositories/index.js';
import { requirePermission } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { ValidationError } from '../utils/errors.js';
import { AuditService, AuditActions } from './AuditService.js';
import { AnalyticsService } from './AnalyticsService.js';

// ── Passphrase encryption helpers (AES-256-GCM via Web Crypto) ──────────────

const ENC_ALGO = 'AES-GCM';
const PBKDF2_ITERATIONS = 100000;

function _bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _base64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function _deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ENC_ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a JSON-serializable value with a passphrase.
 * Returns { ciphertext, iv, salt } — all base64-encoded strings.
 */
async function encryptWithPassphrase(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _deriveKey(passphrase, salt);
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt(
    { name: ENC_ALGO, iv },
    key,
    enc.encode(JSON.stringify(data)),
  );
  return {
    ciphertext: _bufToBase64(ct),
    iv:         _bufToBase64(iv),
    salt:       _bufToBase64(salt),
  };
}

/**
 * Decrypt a bundle produced by encryptWithPassphrase.
 * Returns the original JSON-parsed value. Throws on wrong passphrase.
 */
async function decryptWithPassphrase(bundle, passphrase) {
  const salt = _base64ToBuf(bundle.salt);
  const iv   = _base64ToBuf(bundle.iv);
  const ct   = _base64ToBuf(bundle.ciphertext);
  const key  = await _deriveKey(passphrase, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: ENC_ALGO, iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new ValidationError('Decryption failed — wrong passphrase or corrupted data');
  }
}

const ALL_STORES = {
  users: userRepository,
  listings: listingRepository,
  listingVersions: listingVersionRepository,
  transactions: transactionRepository,
  threads: threadRepository,
  messages: messageRepository,
  addresses: addressRepository,
  complaints: complaintRepository,
  refunds: refundRepository,
  reports: reportRepository,
  auditLogs: auditLogRepository,
  notifications: notificationRepository,
  categories: categoryRepository,
  coverageZips: coverageZipRepository,
  sensitiveWords: sensitiveWordRepository,
  blocks: blockRepository,
  comments: commentRepository,
  moderationCases: moderationCaseRepository,
  deliveryBookings: deliveryBookingRepository,
};

/**
 * Redact credential-bearing fields from a user record.
 *
 * Removed fields: passwordHash, salt, securityQuestions[].answerHash,
 * securityQuestions[].answerSalt.
 *
 * Preserved: every other field including id, username, displayName, roles,
 * securityQuestions[].question, timestamps, etc.
 *
 * The returned record carries _credentialsRedacted: true so callers and the
 * importer can distinguish safe exports from raw ones.
 */
function redactUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, salt, ...safe } = user;
  safe._credentialsRedacted = true;
  if (Array.isArray(safe.securityQuestions)) {
    safe.securityQuestions = safe.securityQuestions.map(sq => {
      // eslint-disable-next-line no-unused-vars
      const { answerHash, answerSalt, ...safeSq } = sq;
      return safeSq;
    });
  }
  return safe;
}

/**
 * Apply report filters to an array of report records.
 * Shared by exportReports (JSON) and exportReportsCSV.
 */
function applyReportFilters(rows, filters) {
  if (filters.status)     rows = rows.filter(r => r.status === filters.status);
  if (filters.targetType) rows = rows.filter(r => r.targetType === filters.targetType);
  if (filters.reason)     rows = rows.filter(r => r.reason === filters.reason);
  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    rows = rows.filter(r => r.createdAt >= from);
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo).getTime() + 86400000 - 1; // inclusive end day
    rows = rows.filter(r => r.createdAt <= to);
  }
  return rows;
}

export const ExportImportService = {
  /**
   * Redacted snapshot — safe/compliance export.
   * All stores exported; user credential fields are stripped.
   * Cannot restore login capability on import.
   */
  async exportRedactedSnapshot(session) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_EXPORT);

    const snapshot = {};
    for (const [name, repo] of Object.entries(ALL_STORES)) {
      const records = await repo.getAll();
      snapshot[name] = name === 'users' ? records.map(redactUser) : records;
    }

    snapshot._meta = {
      exportedAt: Date.now(),
      exportedBy: session.userId,
      version: 1,
      mode: 'redacted',
      redacted: true,
    };

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'full_snapshot', {
      type: 'full',
      mode: 'redacted',
    });

    return snapshot;
  },

  /** @deprecated Use exportRedactedSnapshot instead. */
  async exportFullSnapshot(session) {
    return this.exportRedactedSnapshot(session);
  },

  /**
   * Restorable snapshot — disaster recovery export.
   * All stores exported; user credentials are AES-256-GCM encrypted with the
   * admin-provided passphrase. The encrypted bundle is stored in
   * `_encryptedUsers`; the `users` array in the snapshot is still redacted
   * (so casual inspection never reveals credential material).
   */
  async exportRestorableSnapshot(session, passphrase) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_EXPORT);

    if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
      throw new ValidationError('Passphrase must be at least 8 characters');
    }

    const snapshot = {};
    let rawUsers = [];
    for (const [name, repo] of Object.entries(ALL_STORES)) {
      const records = await repo.getAll();
      if (name === 'users') {
        rawUsers = records;
        snapshot[name] = records.map(redactUser); // visible copy is still redacted
      } else {
        snapshot[name] = records;
      }
    }

    // Encrypt the full user records (with credentials) using the passphrase
    snapshot._encryptedUsers = await encryptWithPassphrase(rawUsers, passphrase);

    snapshot._meta = {
      exportedAt: Date.now(),
      exportedBy: session.userId,
      version: 1,
      mode: 'restorable',
      redacted: false, // full credential restore is possible with passphrase
    };

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'full_snapshot', {
      type: 'full',
      mode: 'restorable',
    });

    return snapshot;
  },

  /**
   * Export a filtered dataset.
   */
  async exportFiltered(session, storeNames) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_EXPORT);

    if (!Array.isArray(storeNames) || storeNames.length === 0) {
      throw new ValidationError('At least one store name is required');
    }

    const snapshot = {};
    const includesUsers = storeNames.includes('users');
    for (const name of storeNames) {
      const repo = ALL_STORES[name];
      if (!repo) {
        throw new ValidationError(`Unknown store: ${name}`);
      }
      const records = await repo.getAll();
      snapshot[name] = name === 'users' ? records.map(redactUser) : records;
    }

    snapshot._meta = {
      exportedAt: Date.now(),
      exportedBy: session.userId,
      version: 1,
      stores: storeNames,
      ...(includesUsers && { redacted: true }),
    };

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'filtered', {
      type: 'filtered', stores: storeNames, ...(includesUsers && { redacted: true }),
    });

    return snapshot;
  },

  /**
   * Export reports with optional row-level filtering.
   * Requires REPORT_EXPORT permission.
   */
  async exportReports(session, filters = {}) {
    validateSession(session);
    requirePermission(session, Permissions.REPORT_EXPORT);

    const rows = applyReportFilters(await reportRepository.getAll(), filters);

    const result = {
      reports: rows,
      _meta: {
        exportedAt: Date.now(),
        exportedBy: session.userId,
        version: 1,
        filters,
        totalRecords: rows.length,
      },
    };

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'reports', {
      type: 'reports',
      filters,
      totalRecords: rows.length,
    });

    return result;
  },

  /**
   * Export filtered reports as CSV (spreadsheet-friendly).
   * Same filter semantics as exportReports; returns a CSV string.
   * Requires REPORT_EXPORT permission.
   */
  async exportReportsCSV(session, filters = {}) {
    validateSession(session);
    requirePermission(session, Permissions.REPORT_EXPORT);

    const rows = applyReportFilters(await reportRepository.getAll(), filters);

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'reports_csv', {
      type: 'reports_csv',
      filters,
      totalRecords: rows.length,
    });

    return this.toCSV(rows);
  },

  /**
   * Export analytics KPI snapshot.
   * Requires ANALYTICS_EXPORT permission.
   */
  async exportAnalytics(session) {
    validateSession(session);
    requirePermission(session, Permissions.ANALYTICS_EXPORT);

    const kpis = await AnalyticsService.computeKPIs(session);

    const result = {
      analytics: { kpis },
      _meta: {
        exportedAt: Date.now(),
        exportedBy: session.userId,
        version: 1,
      },
    };

    await AuditService.log(session.userId, AuditActions.DATA_EXPORTED, 'system', 'analytics', {
      type: 'analytics',
    });

    return result;
  },

  /**
   * Convert data to CSV format.
   */
  toCSV(data) {
    if (!Array.isArray(data) || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const rows = data.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Neutralize CSV formula injection (CWE-1236): prefix dangerous lead chars with a tab
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `\t${str}`;
        }
        // Escape CSV special characters
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  },

  /**
   * Import a snapshot (overwrite mode).
   *
   * Behaviour depends on snapshot mode:
   *   • redacted  (or legacy with _meta.redacted: true) — users store is
   *     skipped; all other stores are imported normally.
   *   • restorable — if `passphrase` is provided, user records are decrypted
   *     from `_encryptedUsers` and imported, restoring login capability.
   *     Without passphrase, users are skipped (same as redacted).
   *
   * @param {object} session
   * @param {object} snapshot
   * @param {{ passphrase?: string }} [options]
   */
  async importSnapshot(session, snapshot, options = {}) {
    validateSession(session);
    requirePermission(session, Permissions.ADMIN_IMPORT);

    if (!snapshot || !snapshot._meta) {
      throw new ValidationError('Invalid snapshot format: missing _meta');
    }

    if (snapshot._meta.version !== 1) {
      throw new ValidationError(`Unsupported snapshot version: ${snapshot._meta.version}`);
    }

    // Always-protected stores
    const PROTECTED_STORES = new Set(['auditLogs', 'sessions']);

    // Determine whether we can restore users
    const isRestorable = snapshot._meta.mode === 'restorable' && snapshot._encryptedUsers;
    const hasPassphrase = options.passphrase && typeof options.passphrase === 'string';
    let decryptedUsers = null;

    const isRedacted = snapshot._meta.redacted === true;

    if (isRestorable && hasPassphrase) {
      // Decrypt the credential-bearing user records
      decryptedUsers = await decryptWithPassphrase(snapshot._encryptedUsers, options.passphrase);
    } else if (isRedacted || isRestorable) {
      // Redacted snapshot, or restorable without passphrase — skip users
      // to prevent importing credential-stripped records that break login.
      // (Restorable snapshots have a redacted visible users array.)
      PROTECTED_STORES.add('users');
    }
    // Legacy snapshots (no mode, no redacted flag) fall through — users
    // are imported as-is from snapshot.users (backward compatible)

    // Import each store (overwrite)
    for (const [name, repo] of Object.entries(ALL_STORES)) {
      if (PROTECTED_STORES.has(name)) continue;
      if (name === 'users' && decryptedUsers) {
        // Use decrypted users instead of the redacted array in snapshot.users
        await repo.clear();
        await repo.bulkPut(decryptedUsers);
        continue;
      }
      if (snapshot[name] && Array.isArray(snapshot[name])) {
        await repo.clear();
        await repo.bulkPut(snapshot[name]);
      }
    }

    const importedStores = Object.keys(snapshot)
      .filter(k => k !== '_meta' && k !== '_encryptedUsers');

    await AuditService.log(session.userId, AuditActions.DATA_IMPORTED, 'system', 'full_snapshot', {
      importedStores,
      mode: isRestorable && hasPassphrase ? 'restorable' : 'redacted',
      usersRestored: !!decryptedUsers,
      originalExportedAt: snapshot._meta.exportedAt,
    });

    return {
      success: true,
      importedStores,
      usersRestored: !!decryptedUsers,
    };
  },

  /**
   * Get list of available store names for export.
   */
  getAvailableStores() {
    return Object.keys(ALL_STORES);
  },
};
