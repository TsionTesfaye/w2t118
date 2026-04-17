/**
 * SupportService — Unit Tests
 *
 * Covers: createComplaint, transitionComplaint, getComplaintById,
 * getMyComplaints, getAllComplaints, getOpenComplaints,
 * requestRefund, decideRefund, getRefundByComplaint, getAllRefunds.
 *
 * Stubs: complaintRepository, refundRepository, transactionRepository,
 *        AuditService, NotificationService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { SupportService } from '../../src/services/SupportService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import {
  ComplaintStatus, RefundStatus, TransactionStatus,
} from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('SupportService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const complaintRepo    = new InMemoryRepository();
const refundRepo       = new InMemoryRepository();
const transactionRepo  = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1')    { return createSession(id, [Roles.USER]); }
function supportSession(id = 'sup-1')  { return createSession(id, [Roles.SUPPORT_AGENT]); }
function adminSession(id = 'admin-1')  { return createSession(id, [Roles.ADMIN]); }

function stubRepos() {
  // complaintRepository
  repos.complaintRepository.create        = r  => complaintRepo.create(r);
  repos.complaintRepository.getById       = id => complaintRepo.getById(id);
  repos.complaintRepository.getByIdOrFail = async id => {
    const r = await complaintRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.complaintRepository.getAll     = () => complaintRepo.getAll();
  repos.complaintRepository.update     = r  => complaintRepo.update(r);
  repos.complaintRepository.getByIndex = (k, v) => complaintRepo.getByIndex(k, v);
  repos.complaintRepository.getByUserId = id  => complaintRepo.getByIndex('userId', id);
  repos.complaintRepository.getByStatus = s   => complaintRepo.getByIndex('status', s);

  // refundRepository
  repos.refundRepository.create           = r  => refundRepo.create(r);
  repos.refundRepository.getById          = id => refundRepo.getById(id);
  repos.refundRepository.getByIdOrFail    = async id => {
    const r = await refundRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.refundRepository.getAll           = () => refundRepo.getAll();
  repos.refundRepository.update           = r  => refundRepo.update(r);
  repos.refundRepository.getByComplaintId = id => refundRepo.getOneByIndex('complaintId', id);

  // transactionRepository
  repos.transactionRepository.getById      = id => transactionRepo.getById(id);
  repos.transactionRepository.getByIdOrFail = async id => {
    const r = await transactionRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };

  AuditService.log           = async () => {};
  NotificationService.create = async () => {};
}

function makeTransaction(overrides = {}) {
  return {
    id: uid(), buyerId: 'user-1', sellerId: 'seller-1',
    status: TransactionStatus.AGREED,
    createdAt: Date.now(), updatedAt: Date.now(), ...overrides,
  };
}

const validComplaintData = {
  issueType: 'item_not_received',
  description: 'I paid but never got the item.',
};

// ── createComplaint ───────────────────────────────────────────────────────────

suite.test('createComplaint: buyer can file on AGREED transaction', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), buyerId: 'user-1', status: TransactionStatus.AGREED });
  await transactionRepo.create(tx);

  const result = await SupportService.createComplaint(
    userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
  );
  assertEqual(result.status, ComplaintStatus.OPEN);
  assertEqual(result.userId, 'user-1');
  assertEqual(result.transactionId, tx.id);
  assert(result.id, 'id assigned');
});

suite.test('createComplaint: seller can file on AGREED transaction', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), sellerId: 'seller-1', status: TransactionStatus.AGREED });
  await transactionRepo.create(tx);

  const result = await SupportService.createComplaint(
    userSession('seller-1'), { ...validComplaintData, transactionId: tx.id },
  );
  assertEqual(result.userId, 'seller-1');
});

suite.test('createComplaint: can file on COMPLETED transaction', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), status: TransactionStatus.COMPLETED });
  await transactionRepo.create(tx);

  const result = await SupportService.createComplaint(
    userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
  );
  assertEqual(result.status, ComplaintStatus.OPEN);
});

suite.test('createComplaint: non-participant cannot file', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), buyerId: 'user-1', sellerId: 'seller-1' });
  await transactionRepo.create(tx);

  await assertThrowsAsync(
    () => SupportService.createComplaint(
      userSession('stranger'), { ...validComplaintData, transactionId: tx.id },
    ),
    'ValidationError',
  );
});

suite.test('createComplaint: cannot file on INQUIRY transaction', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), status: TransactionStatus.INQUIRY });
  await transactionRepo.create(tx);

  await assertThrowsAsync(
    () => SupportService.createComplaint(
      userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
    ),
    'ValidationError',
  );
});

suite.test('createComplaint: cannot file on CANCELED transaction', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid(), status: TransactionStatus.CANCELED });
  await transactionRepo.create(tx);

  await assertThrowsAsync(
    () => SupportService.createComplaint(
      userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
    ),
    'ValidationError',
  );
});

suite.test('createComplaint: duplicate complaint from same user throws ValidationError', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid() });
  await transactionRepo.create(tx);

  await SupportService.createComplaint(
    userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
  );
  await assertThrowsAsync(
    () => SupportService.createComplaint(
      userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
    ),
    'ValidationError',
  );
});

suite.test('createComplaint: second participant (seller) can still file', async () => {
  stubRepos();
  await complaintRepo.clear(); await transactionRepo.clear();
  const tx = makeTransaction({ id: uid() });
  await transactionRepo.create(tx);

  await SupportService.createComplaint(
    userSession('user-1'), { ...validComplaintData, transactionId: tx.id },
  );
  const sellerComplaint = await SupportService.createComplaint(
    userSession('seller-1'), { ...validComplaintData, transactionId: tx.id },
  );
  assertEqual(sellerComplaint.userId, 'seller-1');
});

// ── transitionComplaint ───────────────────────────────────────────────────────

suite.test('transitionComplaint: support agent moves OPEN → INVESTIGATING', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  const result = await SupportService.transitionComplaint(
    supportSession(), c.id, ComplaintStatus.INVESTIGATING,
  );
  assertEqual(result.status, ComplaintStatus.INVESTIGATING);
  assertEqual(result.assignedTo, 'sup-1');
});

suite.test('transitionComplaint: INVESTIGATING → RESOLVED requires resolution text', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.transitionComplaint(
      supportSession(), c.id, ComplaintStatus.RESOLVED, // no resolution
    ),
    'ValidationError',
  );
});

suite.test('transitionComplaint: INVESTIGATING → RESOLVED with resolution sets resolvedAt', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  const result = await SupportService.transitionComplaint(
    supportSession(), c.id, ComplaintStatus.RESOLVED, 'Item confirmed returned.',
  );
  assertEqual(result.status, ComplaintStatus.RESOLVED);
  assert(result.resolvedAt, 'resolvedAt set');
  assertEqual(result.resolution, 'Item confirmed returned.');
});

suite.test('transitionComplaint: regular USER cannot transition (no COMPLAINT_MANAGE)', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.transitionComplaint(userSession(), c.id, ComplaintStatus.INVESTIGATING),
    'AuthorizationError',
  );
});

suite.test('transitionComplaint: invalid state transition throws', async () => {
  stubRepos();
  await complaintRepo.clear();
  // OPEN → RESOLVED is not a valid direct transition (must go through INVESTIGATING)
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.transitionComplaint(
      supportSession(), c.id, ComplaintStatus.RESOLVED, 'skipping step',
    ),
    'StateTransitionError',
  );
});

// ── getComplaintById ──────────────────────────────────────────────────────────

suite.test('getComplaintById: owner can view own complaint', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  const result = await SupportService.getComplaintById(userSession('user-1'), c.id);
  assertEqual(result.id, c.id);
});

suite.test('getComplaintById: non-owner regular user cannot view', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.getComplaintById(userSession('other-user'), c.id),
    'ValidationError',
  );
});

suite.test('getComplaintById: support agent can view any complaint', async () => {
  stubRepos();
  await complaintRepo.clear();
  const c = { id: uid(), userId: 'user-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  const result = await SupportService.getComplaintById(supportSession(), c.id);
  assertEqual(result.id, c.id);
});

// ── getAllComplaints / getOpenComplaints ───────────────────────────────────────

suite.test('getAllComplaints: support agent can paginate all complaints', async () => {
  stubRepos();
  await complaintRepo.clear();
  await complaintRepo.create({ id: uid(), userId: 'u1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() });
  await complaintRepo.create({ id: uid(), userId: 'u2', status: ComplaintStatus.RESOLVED, createdAt: Date.now(), updatedAt: Date.now() });

  const result = await SupportService.getAllComplaints(supportSession());
  assertEqual(result.total, 2);
  assert(Array.isArray(result.items), 'items is array');
});

suite.test('getAllComplaints: regular user cannot access', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => SupportService.getAllComplaints(userSession()),
    'AuthorizationError',
  );
});

suite.test('getOpenComplaints: returns only OPEN and INVESTIGATING complaints', async () => {
  stubRepos();
  await complaintRepo.clear();
  await complaintRepo.create({ id: uid(), userId: 'u1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() });
  await complaintRepo.create({ id: uid(), userId: 'u2', status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now() });
  await complaintRepo.create({ id: uid(), userId: 'u3', status: ComplaintStatus.RESOLVED, createdAt: Date.now(), updatedAt: Date.now() });

  const result = await SupportService.getOpenComplaints(supportSession());
  assertEqual(result.total, 2);
  assert(result.items.every(c =>
    c.status === ComplaintStatus.OPEN || c.status === ComplaintStatus.INVESTIGATING
  ), 'only open/investigating returned');
});

// ── requestRefund ─────────────────────────────────────────────────────────────

suite.test('requestRefund: complaint creator can request refund in INVESTIGATING state', async () => {
  stubRepos();
  await complaintRepo.clear(); await refundRepo.clear();
  const c = {
    id: uid(), userId: 'user-1', transactionId: 'tx-1',
    status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await complaintRepo.create(c);

  const result = await SupportService.requestRefund(
    userSession('user-1'), { complaintId: c.id, reason: 'Item was damaged.' },
  );
  assertEqual(result.status, RefundStatus.REQUESTED);
  assertEqual(result.complaintId, c.id);
  assertEqual(result.userId, 'user-1');
});

suite.test('requestRefund: cannot request on OPEN complaint', async () => {
  stubRepos();
  await complaintRepo.clear(); await refundRepo.clear();
  const c = { id: uid(), userId: 'user-1', transactionId: 'tx-1', status: ComplaintStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.requestRefund(userSession('user-1'), { complaintId: c.id, reason: 'Too early.' }),
    'ValidationError',
  );
});

suite.test('requestRefund: non-creator cannot request', async () => {
  stubRepos();
  await complaintRepo.clear(); await refundRepo.clear();
  const c = {
    id: uid(), userId: 'user-1', transactionId: 'tx-1',
    status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.requestRefund(userSession('other-user'), { complaintId: c.id, reason: 'Nope.' }),
    'ValidationError',
  );
});

suite.test('requestRefund: empty reason throws ValidationError', async () => {
  stubRepos();
  await complaintRepo.clear(); await refundRepo.clear();
  const c = {
    id: uid(), userId: 'user-1', transactionId: 'tx-1',
    status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await complaintRepo.create(c);

  await assertThrowsAsync(
    () => SupportService.requestRefund(userSession('user-1'), { complaintId: c.id, reason: '' }),
    'ValidationError',
  );
});

suite.test('requestRefund: duplicate refund request throws ValidationError', async () => {
  stubRepos();
  await complaintRepo.clear(); await refundRepo.clear();
  const c = {
    id: uid(), userId: 'user-1', transactionId: 'tx-1',
    status: ComplaintStatus.INVESTIGATING, createdAt: Date.now(), updatedAt: Date.now(),
  };
  await complaintRepo.create(c);

  await SupportService.requestRefund(userSession('user-1'), { complaintId: c.id, reason: 'First.' });
  await assertThrowsAsync(
    () => SupportService.requestRefund(userSession('user-1'), { complaintId: c.id, reason: 'Second.' }),
    'ValidationError',
  );
});

// ── decideRefund ──────────────────────────────────────────────────────────────

suite.test('decideRefund: support agent can approve refund', async () => {
  stubRepos();
  await refundRepo.clear();
  const r = { id: uid(), complaintId: uid(), userId: 'user-1', status: RefundStatus.REQUESTED, createdAt: Date.now(), updatedAt: Date.now() };
  await refundRepo.create(r);

  const result = await SupportService.decideRefund(supportSession(), r.id, 'approved');
  assertEqual(result.status, RefundStatus.APPROVED);
  assertEqual(result.decidedBy, 'sup-1');
});

suite.test('decideRefund: support agent can reject refund', async () => {
  stubRepos();
  await refundRepo.clear();
  const r = { id: uid(), complaintId: uid(), userId: 'user-1', status: RefundStatus.REQUESTED, createdAt: Date.now(), updatedAt: Date.now() };
  await refundRepo.create(r);

  const result = await SupportService.decideRefund(supportSession(), r.id, 'rejected');
  assertEqual(result.status, RefundStatus.REJECTED);
});

suite.test('decideRefund: invalid decision string throws ValidationError', async () => {
  stubRepos();
  await refundRepo.clear();
  const r = { id: uid(), complaintId: uid(), userId: 'user-1', status: RefundStatus.REQUESTED, createdAt: Date.now(), updatedAt: Date.now() };
  await refundRepo.create(r);

  await assertThrowsAsync(
    () => SupportService.decideRefund(supportSession(), r.id, 'maybe'),
    'ValidationError',
  );
});

suite.test('decideRefund: regular user cannot decide (no REFUND_APPROVE)', async () => {
  stubRepos();
  await refundRepo.clear();
  const r = { id: uid(), complaintId: uid(), userId: 'user-1', status: RefundStatus.REQUESTED, createdAt: Date.now(), updatedAt: Date.now() };
  await refundRepo.create(r);

  await assertThrowsAsync(
    () => SupportService.decideRefund(userSession(), r.id, 'approved'),
    'AuthorizationError',
  );
});

// ── getRefundByComplaint / getAllRefunds ───────────────────────────────────────

suite.test('getAllRefunds: support agent can retrieve all refunds', async () => {
  stubRepos();
  await refundRepo.clear();
  await refundRepo.create({ id: uid(), complaintId: uid(), userId: 'u1', status: RefundStatus.REQUESTED, createdAt: Date.now(), updatedAt: Date.now() });
  await refundRepo.create({ id: uid(), complaintId: uid(), userId: 'u2', status: RefundStatus.APPROVED, createdAt: Date.now(), updatedAt: Date.now() });

  const result = await SupportService.getAllRefunds(supportSession());
  assertEqual(result.length, 2);
});

suite.test('getAllRefunds: regular user cannot access', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => SupportService.getAllRefunds(userSession()),
    'AuthorizationError',
  );
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(() => SupportService.getAllComplaints(null), 'AuthenticationError');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
