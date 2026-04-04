/**
 * Integration Test: Transaction lifecycle flow.
 * Tests the complete flow: inquiry → reserved → agreed → completed
 * Also tests: cancellation, expiry, and invalid transitions.
 *
 * NOTE: This test validates service-layer logic using direct service calls.
 * It does NOT require a browser. In a full implementation with IndexedDB,
 * these would run in a browser context or with fake-indexeddb.
 *
 * For Phase 1, this file validates the state machine and validation logic
 * that CAN be tested without IndexedDB (domain layer tests).
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../unit_tests/setup.js';
import { validateTransition } from '../src/domain/validation/stateMachine.js';
import { TransactionStatus, TRANSACTION_TRANSITIONS, CancellationReasons } from '../src/domain/enums/statuses.js';
import { validateCancellation } from '../src/domain/validation/rules.js';

const suite = new TestRunner('Integration: Transaction Flow');

// ── Full Lifecycle ──

suite.test('full happy path: inquiry → reserved → agreed → completed', () => {
  let status = TransactionStatus.INQUIRY;

  // Step 1: Reserve
  validateTransition('transaction', TRANSACTION_TRANSITIONS, status, TransactionStatus.RESERVED);
  status = TransactionStatus.RESERVED;
  assertEqual(status, TransactionStatus.RESERVED);

  // Step 2: Agree
  validateTransition('transaction', TRANSACTION_TRANSITIONS, status, TransactionStatus.AGREED);
  status = TransactionStatus.AGREED;
  assertEqual(status, TransactionStatus.AGREED);

  // Step 3: Complete
  validateTransition('transaction', TRANSACTION_TRANSITIONS, status, TransactionStatus.COMPLETED);
  status = TransactionStatus.COMPLETED;
  assertEqual(status, TransactionStatus.COMPLETED);
});

// ── Cancellation at Each Stage ──

suite.test('cancel from inquiry with valid reason', () => {
  validateCancellation(CancellationReasons.BUYER_CHANGED_MIND);
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.CANCELED);
});

suite.test('cancel from reserved with valid reason', () => {
  validateCancellation(CancellationReasons.SELLER_UNAVAILABLE);
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.RESERVED, TransactionStatus.CANCELED);
});

suite.test('cancel from agreed with valid reason', () => {
  validateCancellation(CancellationReasons.PRICE_DISAGREEMENT);
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.AGREED, TransactionStatus.CANCELED);
});

suite.test('cannot cancel from completed', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.COMPLETED, TransactionStatus.CANCELED),
    'StateTransitionError'
  );
});

// ── Invalid Transitions ──

suite.test('cannot skip from inquiry to agreed', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.AGREED),
    'StateTransitionError'
  );
});

suite.test('cannot skip from inquiry to completed', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.COMPLETED),
    'StateTransitionError'
  );
});

suite.test('cannot go backward from reserved to inquiry', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.RESERVED, TransactionStatus.INQUIRY),
    'StateTransitionError'
  );
});

suite.test('cannot go backward from completed', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.COMPLETED, TransactionStatus.AGREED),
    'StateTransitionError'
  );
});

suite.test('cannot resume from canceled', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.CANCELED, TransactionStatus.INQUIRY),
    'StateTransitionError'
  );
});

// ── Cancellation Validation ──

suite.test('cancellation requires reason', async () => {
  await assertThrowsAsync(() => validateCancellation(''), 'ValidationError');
});

suite.test('cancellation rejects null reason', async () => {
  await assertThrowsAsync(() => validateCancellation(null), 'ValidationError');
});

suite.test('cancellation accepts all valid reason codes', () => {
  for (const reason of Object.values(CancellationReasons)) {
    validateCancellation(reason);
  }
});

// ── Expiry scenario (state machine level) ──

suite.test('expired reservation treated as cancelation', () => {
  // At the state machine level, expiry is a transition from reserved → canceled
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.RESERVED, TransactionStatus.CANCELED);
  // The reason code for expiry
  validateCancellation(CancellationReasons.RESERVATION_EXPIRED);
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
