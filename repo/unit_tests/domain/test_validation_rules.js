/**
 * Tests for domain validation rules.
 * Validates: passwords, addresses, listings, state machines.
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../setup.js';
import {
  validatePassword, validateUsername, validateAddress,
  validateListing, validateCancellation, validateSecurityQuestions,
  LIMITS,
} from '../../src/domain/validation/rules.js';
import { validateTransition, isTerminalState, getAllowedTransitions } from '../../src/domain/validation/stateMachine.js';
import {
  TransactionStatus, TRANSACTION_TRANSITIONS,
  ListingStatus, LISTING_TRANSITIONS,
  ComplaintStatus, COMPLAINT_TRANSITIONS,
  RefundStatus, REFUND_TRANSITIONS,
} from '../../src/domain/enums/statuses.js';

const suite = new TestRunner('Validation Rules');

// ── Password Validation ──

suite.test('password: rejects empty password', async () => {
  await assertThrowsAsync(() => validatePassword(''), 'ValidationError');
});

suite.test('password: rejects short password', async () => {
  await assertThrowsAsync(() => validatePassword('Short1!'), 'ValidationError', 'requirements');
});

suite.test('password: rejects missing uppercase', async () => {
  await assertThrowsAsync(() => validatePassword('alllowercase1!'), 'ValidationError', 'requirements');
});

suite.test('password: rejects missing lowercase', async () => {
  await assertThrowsAsync(() => validatePassword('ALLUPPERCASE1!'), 'ValidationError', 'requirements');
});

suite.test('password: rejects missing number', async () => {
  await assertThrowsAsync(() => validatePassword('NoNumberHere!!'), 'ValidationError', 'requirements');
});

suite.test('password: rejects missing symbol', async () => {
  await assertThrowsAsync(() => validatePassword('NoSymbolHere12'), 'ValidationError', 'requirements');
});

suite.test('password: accepts valid password', () => {
  // Should not throw
  validatePassword('ValidPass123!');
});

// ── Username Validation ──

suite.test('username: rejects empty', async () => {
  await assertThrowsAsync(() => validateUsername(''), 'ValidationError');
});

suite.test('username: rejects too short', async () => {
  await assertThrowsAsync(() => validateUsername('ab'), 'ValidationError', 'Invalid username');
});

suite.test('username: rejects special characters', async () => {
  await assertThrowsAsync(() => validateUsername('user@name'), 'ValidationError');
});

suite.test('username: accepts valid username', () => {
  validateUsername('valid_user123');
});

// ── Address Validation ──

suite.test('address: rejects missing street', async () => {
  await assertThrowsAsync(() => validateAddress({ city: 'NYC', state: 'NY', zipCode: '10001' }), 'ValidationError');
});

suite.test('address: rejects invalid ZIP', async () => {
  await assertThrowsAsync(
    () => validateAddress({ street: '123 Main', city: 'NYC', state: 'NY', zipCode: '1234' }),
    'ValidationError', 'Invalid address'
  );
});

suite.test('address: rejects invalid state', async () => {
  await assertThrowsAsync(
    () => validateAddress({ street: '123 Main', city: 'NYC', state: 'XX', zipCode: '10001' }),
    'ValidationError', 'Invalid address'
  );
});

suite.test('address: accepts valid US address', () => {
  validateAddress({ street: '123 Main St', city: 'New York', state: 'NY', zipCode: '10001' });
});

// ── Listing Validation ──

suite.test('listing: rejects missing title', async () => {
  await assertThrowsAsync(
    () => validateListing({ description: 'desc', price: 10, categoryId: 'cat1' }),
    'ValidationError'
  );
});

suite.test('listing: rejects negative price', async () => {
  await assertThrowsAsync(
    () => validateListing({ title: 'Item', description: 'desc', price: -5, categoryId: 'cat1' }),
    'ValidationError', 'Invalid listing'
  );
});

suite.test('listing: accepts valid listing', () => {
  validateListing({ title: 'Item', description: 'A description', price: 25.99, categoryId: 'cat1', deliveryOptions: { pickup: true, delivery: false } });
});

// ── Transaction State Machine ──

suite.test('transaction SM: allows inquiry → reserved', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.RESERVED);
});

suite.test('transaction SM: allows reserved → agreed', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.RESERVED, TransactionStatus.AGREED);
});

suite.test('transaction SM: allows agreed → completed', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.AGREED, TransactionStatus.COMPLETED);
});

suite.test('transaction SM: allows inquiry → canceled', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.CANCELED);
});

suite.test('transaction SM: allows reserved → canceled', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.RESERVED, TransactionStatus.CANCELED);
});

suite.test('transaction SM: allows agreed → canceled', () => {
  validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.AGREED, TransactionStatus.CANCELED);
});

suite.test('transaction SM: rejects inquiry → completed', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY, TransactionStatus.COMPLETED),
    'StateTransitionError'
  );
});

suite.test('transaction SM: rejects completed → anything', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.COMPLETED, TransactionStatus.INQUIRY),
    'StateTransitionError'
  );
});

suite.test('transaction SM: rejects canceled → anything', async () => {
  await assertThrowsAsync(
    () => validateTransition('transaction', TRANSACTION_TRANSITIONS, TransactionStatus.CANCELED, TransactionStatus.INQUIRY),
    'StateTransitionError'
  );
});

suite.test('transaction SM: completed is terminal', () => {
  assert(isTerminalState(TRANSACTION_TRANSITIONS, TransactionStatus.COMPLETED), 'completed should be terminal');
});

suite.test('transaction SM: canceled is terminal', () => {
  assert(isTerminalState(TRANSACTION_TRANSITIONS, TransactionStatus.CANCELED), 'canceled should be terminal');
});

// ── Listing State Machine ──

suite.test('listing SM: draft → active allowed', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.DRAFT, ListingStatus.ACTIVE);
});

suite.test('listing SM: draft → under_review allowed', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.DRAFT, ListingStatus.UNDER_REVIEW);
});

suite.test('listing SM: rejected → under_review allowed (resubmit)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.REJECTED, ListingStatus.UNDER_REVIEW);
});

suite.test('listing SM: archived is terminal', () => {
  assert(isTerminalState(LISTING_TRANSITIONS, ListingStatus.ARCHIVED), 'archived should be terminal');
});

suite.test('listing SM: draft → sold rejected', async () => {
  await assertThrowsAsync(
    () => validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.DRAFT, ListingStatus.SOLD),
    'StateTransitionError'
  );
});

// ── Complaint State Machine ──

suite.test('complaint SM: open → investigating allowed', () => {
  validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.OPEN, ComplaintStatus.INVESTIGATING);
});

suite.test('complaint SM: investigating → resolved allowed', () => {
  validateTransition('complaint', COMPLAINT_TRANSITIONS, ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED);
});

suite.test('complaint SM: resolved is terminal', () => {
  assert(isTerminalState(COMPLAINT_TRANSITIONS, ComplaintStatus.RESOLVED), 'resolved should be terminal');
});

// ── Refund State Machine ──

suite.test('refund SM: requested → approved allowed', () => {
  validateTransition('refund', REFUND_TRANSITIONS, RefundStatus.REQUESTED, RefundStatus.APPROVED);
});

suite.test('refund SM: approved is terminal', () => {
  assert(isTerminalState(REFUND_TRANSITIONS, RefundStatus.APPROVED), 'approved should be terminal');
});

// ── Cancellation Validation ──

suite.test('cancellation: rejects empty reason', async () => {
  await assertThrowsAsync(() => validateCancellation(''), 'ValidationError');
});

suite.test('cancellation: accepts valid reason', () => {
  validateCancellation('buyer_changed_mind');
});

// ── Security Questions ──

suite.test('security questions: rejects fewer than 2', async () => {
  await assertThrowsAsync(
    () => validateSecurityQuestions([{ question: 'Q?', answer: 'A' }]),
    'ValidationError', '2 security questions'
  );
});

suite.test('security questions: accepts valid set', () => {
  validateSecurityQuestions([
    { question: 'Q1?', answer: 'A1' },
    { question: 'Q2?', answer: 'A2' },
  ]);
});

// ── getAllowedTransitions ──

suite.test('getAllowedTransitions returns correct values', () => {
  const allowed = getAllowedTransitions(TRANSACTION_TRANSITIONS, TransactionStatus.INQUIRY);
  assert(allowed.includes(TransactionStatus.RESERVED), 'should include reserved');
  assert(allowed.includes(TransactionStatus.CANCELED), 'should include canceled');
  assertEqual(allowed.length, 2, 'should have exactly 2 transitions');
});

// Run
const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
