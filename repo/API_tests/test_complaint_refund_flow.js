/**
 * Integration Test: Complaint and Refund workflow.
 * Tests: open → investigating → resolved/rejected, refund lifecycle.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../unit_tests/setup.js';
import { validateTransition } from '../src/domain/validation/stateMachine.js';
import { validateComplaint } from '../src/domain/validation/rules.js';
import {
  ComplaintStatus, COMPLAINT_TRANSITIONS,
  RefundStatus, REFUND_TRANSITIONS,
} from '../src/domain/enums/statuses.js';

const suite = new TestRunner('Integration: Complaint & Refund Flow');

// ── Complaint Lifecycle ──

suite.test('complaint happy path: open → investigating → resolved', () => {
  let status = ComplaintStatus.OPEN;

  validateTransition('complaint', COMPLAINT_TRANSITIONS, status, ComplaintStatus.INVESTIGATING);
  status = ComplaintStatus.INVESTIGATING;

  validateTransition('complaint', COMPLAINT_TRANSITIONS, status, ComplaintStatus.RESOLVED);
  status = ComplaintStatus.RESOLVED;

  assertEqual(status, ComplaintStatus.RESOLVED);
});

suite.test('complaint can be rejected from open', () => {
  validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.OPEN, ComplaintStatus.REJECTED);
});

suite.test('complaint can be rejected from investigating', () => {
  validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.INVESTIGATING, ComplaintStatus.REJECTED);
});

suite.test('resolved complaint is terminal', async () => {
  await assertThrowsAsync(
    () => validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.RESOLVED, ComplaintStatus.OPEN),
    'StateTransitionError'
  );
});

suite.test('cannot skip to resolved from open', async () => {
  await assertThrowsAsync(
    () => validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.OPEN, ComplaintStatus.RESOLVED),
    'StateTransitionError'
  );
});

// ── Complaint Validation ──

suite.test('complaint requires transactionId', async () => {
  await assertThrowsAsync(
    () => validateComplaint({ issueType: 'damaged', description: 'broken' }),
    'ValidationError', 'Invalid complaint'
  );
});

suite.test('complaint requires issueType', async () => {
  await assertThrowsAsync(
    () => validateComplaint({ transactionId: 't1', description: 'broken' }),
    'ValidationError', 'Invalid complaint'
  );
});

suite.test('complaint requires description', async () => {
  await assertThrowsAsync(
    () => validateComplaint({ transactionId: 't1', issueType: 'damaged' }),
    'ValidationError', 'Invalid complaint'
  );
});

// ── Refund Lifecycle ──

suite.test('refund: requested → approved', () => {
  validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REQUESTED, RefundStatus.APPROVED);
});

suite.test('refund: requested → rejected', () => {
  validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REQUESTED, RefundStatus.REJECTED);
});

suite.test('refund: approved is terminal', async () => {
  await assertThrowsAsync(
    () => validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.APPROVED, RefundStatus.REQUESTED),
    'StateTransitionError'
  );
});

suite.test('refund: rejected is terminal', async () => {
  await assertThrowsAsync(
    () => validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REJECTED, RefundStatus.REQUESTED),
    'StateTransitionError'
  );
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
