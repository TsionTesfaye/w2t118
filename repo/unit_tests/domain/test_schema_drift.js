/**
 * Schema Drift Detection — FULL FIELD-LEVEL AUDIT
 *
 * Every entity's dictionary entry is compared against its authoritative
 * runtime field list derived from the service/policy that creates it.
 *
 * Two classes of assertion per entity:
 *   1. dictFields ⊇ runtimeFields (no missing runtime field in dictionary)
 *   2. dictFields ⊆ runtimeFields (no extra stale field in dictionary)
 *
 * If this test fails, the DATA_DICTIONARY in dataDictionary.js must be
 * updated to match the actual stored object shape.
 */

import { TestRunner, assert } from '../setup.js';
import { DATA_DICTIONARY } from '../../src/domain/dataDictionary.js';

const suite = new TestRunner('Schema Drift — Dictionary vs Runtime');

// ── helpers ────────────────────────────────────────────────────────────────

function dictFieldNames(store) {
  const entry = DATA_DICTIONARY.find(e => e.store === store);
  if (!entry) throw new Error(`Entity "${store}" not found in DATA_DICTIONARY`);
  return new Set(entry.fields.map(f => f.name));
}

/**
 * Assert that the dictionary fields for `store` are EXACTLY the given set.
 * Reports both missing and extra fields in a single error message.
 */
function assertExactFields(store, expectedFields) {
  const dictFields = dictFieldNames(store);
  const expected = new Set(expectedFields);

  const missing = [];
  const extra = [];

  for (const field of expected) {
    if (!dictFields.has(field)) missing.push(field);
  }
  for (const field of dictFields) {
    if (!expected.has(field)) extra.push(field);
  }

  const errors = [];
  if (missing.length > 0) errors.push(`missing from dictionary: [${missing.join(', ')}]`);
  if (extra.length > 0) errors.push(`extra in dictionary (stale?): [${extra.join(', ')}]`);

  assert(
    errors.length === 0,
    `${store}: field mismatch — ${errors.join('; ')}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Authoritative runtime field lists per entity.
// Derived from service/policy code that creates the stored object.
// ═══════════════════════════════════════════════════════════════════════════

// AuthService.register() + _recordFailedAttempt / _recordRecoveryFailure
const USER_FIELDS = [
  'id', 'username', 'displayName', 'passwordHash', 'salt', 'roles',
  'securityQuestions', 'notificationPreferences',
  'avatar', 'bio',
  'failedAttempts', 'failedAttemptWindowStart', 'lockoutUntil',
  'recoveryAttempts', 'recoveryLockoutUntil',
  'createdAt', 'updatedAt',
];

// sessionPolicy.createSession()
const SESSION_FIELDS = [
  'userId', 'roles', 'createdAt', 'lastActivityAt', 'tokenId',
];

// ListingService.create() + pin/feature/status transitions
const LISTING_FIELDS = [
  'id', 'sellerId', 'title', 'description', 'price', 'categoryId',
  'tagIds', 'media', 'deliveryOptions',
  'status', 'isPinned', 'isFeatured',
  'createdAt', 'updatedAt',
];

// ListingService._saveVersion()
const LISTING_VERSION_FIELDS = [
  'id', 'listingId', 'snapshot', 'createdAt',
];

// ThreadService.create()
const THREAD_FIELDS = [
  'id', 'listingId', 'buyerId', 'sellerId',
  'isReadOnly', 'archivedBy',
  'createdAt', 'updatedAt',
];

// ThreadService.sendMessage()
const MESSAGE_FIELDS = [
  'id', 'threadId', 'senderId', 'content', 'createdAt',
];

// TransactionService.create() + reserve/agree/complete/cancel
const TRANSACTION_FIELDS = [
  'id', 'threadId', 'listingId', 'buyerId', 'sellerId',
  'status', 'reservedAt', 'agreedAt', 'completedAt',
  'canceledAt', 'cancellationReason',
  'createdAt', 'updatedAt',
];

// DeliveryService.bookDelivery()
const DELIVERY_BOOKING_FIELDS = [
  'id', 'transactionId', 'windowKey', 'zipCode', 'userId', 'createdAt',
];

// DeliveryService.addCoveragePrefix()
const COVERAGE_ZIP_FIELDS = [
  'id', 'prefix', 'createdAt',
];

// AddressService.create()
const ADDRESS_FIELDS = [
  'id', 'userId', 'street', 'street2', 'city', 'state', 'zipCode',
  'phone', 'isDefault', 'createdAt', 'updatedAt',
];

// CommentService.create() + soft delete
const COMMENT_FIELDS = [
  'id', 'listingId', 'userId', 'content', 'type', 'parentId',
  'media', 'isFlagged', 'isDeleted',
  'createdAt', 'updatedAt',
];

// SupportService.createComplaint() + investigate/resolve/reject
const COMPLAINT_FIELDS = [
  'id', 'userId', 'transactionId', 'issueType', 'description',
  'status', 'resolution', 'resolvedAt', 'assignedTo', 'slaDeadline',
  'createdAt', 'updatedAt',
];

// SupportService.requestRefund() + approve/reject
const REFUND_FIELDS = [
  'id', 'complaintId', 'transactionId', 'userId', 'reason',
  'status', 'decidedBy',
  'createdAt', 'updatedAt',
];

// ModerationService.createReport() + linked-case decision writes (decision, violationTags, penalty)
const REPORT_FIELDS = [
  'id', 'reporterId', 'targetId', 'targetType', 'reason', 'description',
  'status', 'decision', 'violationTags', 'penalty',
  'createdAt', 'updatedAt',
];

// ModerationService.createCase() + decide
const MODERATION_CASE_FIELDS = [
  'id', 'contentId', 'contentType', 'reason', 'flaggedWords', 'reportId',
  'status', 'reviewerId', 'decision', 'violationTags', 'penalty',
  'createdAt', 'updatedAt',
];

// NotificationService.create()
const NOTIFICATION_FIELDS = [
  'id', 'userId', 'type', 'referenceId', 'message', 'isRead', 'createdAt',
];

// AuditService.log()
const AUDIT_LOG_FIELDS = [
  'id', 'actorId', 'action', 'entityType', 'entityId', 'metadata', 'timestamp',
];

// ModerationService.addSensitiveWord()
const SENSITIVE_WORD_FIELDS = [
  'id', 'word', 'matchType', 'createdAt',
];

// UserService.blockUser()
const BLOCK_FIELDS = [
  'id', 'blockerId', 'blockedId', 'createdAt',
];

// AdminService.createCategory()
const CATEGORY_FIELDS = [
  'id', 'name', 'parentId', 'sortOrder', 'createdAt', 'updatedAt',
];

// ═══════════════════════════════════════════════════════════════════════════
// Tests — one per entity, exact field-set comparison
// ═══════════════════════════════════════════════════════════════════════════

suite.test('users: exact field match', () => assertExactFields('users', USER_FIELDS));
suite.test('sessions: exact field match', () => assertExactFields('sessions', SESSION_FIELDS));
suite.test('listings: exact field match', () => assertExactFields('listings', LISTING_FIELDS));
suite.test('listingVersions: exact field match', () => assertExactFields('listingVersions', LISTING_VERSION_FIELDS));
suite.test('threads: exact field match', () => assertExactFields('threads', THREAD_FIELDS));
suite.test('messages: exact field match', () => assertExactFields('messages', MESSAGE_FIELDS));
suite.test('transactions: exact field match', () => assertExactFields('transactions', TRANSACTION_FIELDS));
suite.test('deliveryBookings: exact field match', () => assertExactFields('deliveryBookings', DELIVERY_BOOKING_FIELDS));
suite.test('coverageZips: exact field match', () => assertExactFields('coverageZips', COVERAGE_ZIP_FIELDS));
suite.test('addresses: exact field match', () => assertExactFields('addresses', ADDRESS_FIELDS));
suite.test('comments: exact field match', () => assertExactFields('comments', COMMENT_FIELDS));
suite.test('complaints: exact field match', () => assertExactFields('complaints', COMPLAINT_FIELDS));
suite.test('refunds: exact field match', () => assertExactFields('refunds', REFUND_FIELDS));
suite.test('reports: exact field match', () => assertExactFields('reports', REPORT_FIELDS));
suite.test('moderationCases: exact field match', () => assertExactFields('moderationCases', MODERATION_CASE_FIELDS));
suite.test('notifications: exact field match', () => assertExactFields('notifications', NOTIFICATION_FIELDS));
suite.test('auditLogs: exact field match', () => assertExactFields('auditLogs', AUDIT_LOG_FIELDS));
suite.test('sensitiveWords: exact field match', () => assertExactFields('sensitiveWords', SENSITIVE_WORD_FIELDS));
suite.test('blocks: exact field match', () => assertExactFields('blocks', BLOCK_FIELDS));
suite.test('categories: exact field match', () => assertExactFields('categories', CATEGORY_FIELDS));

// ── Regression guard: all stores in runtime are in dictionary ────────────

suite.test('every ALL_STORES key has a dictionary entry', async () => {
  // Dynamic import to avoid coupling test setup to repository internals
  const repoIndex = await import('../../src/repositories/index.js');
  const repoNames = Object.keys(repoIndex).map(k => k.replace('Repository', ''));

  // Map repo export names to store names used in the dictionary
  const repoToStore = {
    user: 'users',
    listing: 'listings',
    listingVersion: 'listingVersions',
    transaction: 'transactions',
    thread: 'threads',
    message: 'messages',
    address: 'addresses',
    complaint: 'complaints',
    refund: 'refunds',
    report: 'reports',
    auditLog: 'auditLogs',
    notification: 'notifications',
    category: 'categories',
    coverageZip: 'coverageZips',
    sensitiveWord: 'sensitiveWords',
    block: 'blocks',
    comment: 'comments',
    moderationCase: 'moderationCases',
    deliveryBooking: 'deliveryBookings',
    session: 'sessions',
  };

  const dictStores = new Set(DATA_DICTIONARY.map(e => e.store));

  for (const repoName of repoNames) {
    const storeName = repoToStore[repoName];
    if (!storeName) continue; // non-entity exports (e.g. LocalStorageAdapter)
    assert(
      dictStores.has(storeName),
      `Repository "${repoName}Repository" maps to store "${storeName}" which is missing from DATA_DICTIONARY`
    );
  }
});

// ── run ───────────────────────────────────────────────────────────────────────

const results = await suite.run();
if (results.failed > 0) process.exit(1);
