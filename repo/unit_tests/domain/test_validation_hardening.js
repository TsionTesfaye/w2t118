/**
 * Validation Hardening Tests — Phase 3
 * Covers every validation rule added or changed during hardening:
 *   - validateListing: delivery options required
 *   - validateCancellation: enum enforcement
 *   - validateComment: type field enforcement
 *   - validateMedia: url-format acceptance, data-missing rejection
 *   - listing lifecycle: terminal state blocks (SOLD, ARCHIVED)
 *   - listing lifecycle: moderation decision transitions
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../setup.js';
import {
  validateListing,
  validateCancellation,
  validateComment,
  validateMedia,
} from '../../src/domain/validation/rules.js';
import { validateTransition } from '../../src/domain/validation/stateMachine.js';
import {
  CancellationReasons,
  ListingStatus, LISTING_TRANSITIONS,
} from '../../src/domain/enums/statuses.js';

const suite = new TestRunner('Validation Hardening');

// ── validateListing: delivery options ──

suite.test('listing: rejects missing deliveryOptions entirely', async () => {
  await assertThrowsAsync(
    () => validateListing({ title: 'T', description: 'D', price: 10, categoryId: 'c1' }),
    'ValidationError'
  );
});

suite.test('listing: rejects deliveryOptions with both false', async () => {
  await assertThrowsAsync(
    () => validateListing({ title: 'T', description: 'D', price: 10, categoryId: 'c1', deliveryOptions: { pickup: false, delivery: false } }),
    'ValidationError'
  );
});

suite.test('listing: accepts pickup-only delivery options', () => {
  validateListing({ title: 'T', description: 'D', price: 10, categoryId: 'c1', deliveryOptions: { pickup: true, delivery: false } });
});

suite.test('listing: accepts delivery-only delivery options', () => {
  validateListing({ title: 'T', description: 'D', price: 10, categoryId: 'c1', deliveryOptions: { pickup: false, delivery: true } });
});

suite.test('listing: accepts both delivery options enabled', () => {
  validateListing({ title: 'T', description: 'D', price: 10, categoryId: 'c1', deliveryOptions: { pickup: true, delivery: true } });
});

// ── validateCancellation: enum enforcement ──

suite.test('cancellation: rejects arbitrary string reason', async () => {
  await assertThrowsAsync(
    () => validateCancellation('i_just_felt_like_it'),
    'ValidationError'
  );
});

suite.test('cancellation: rejects numeric string', async () => {
  await assertThrowsAsync(
    () => validateCancellation('123'),
    'ValidationError'
  );
});

suite.test('cancellation: accepts all valid CancellationReasons values', () => {
  for (const reason of Object.values(CancellationReasons)) {
    validateCancellation(reason); // must not throw
  }
});

suite.test('cancellation: rejects empty string', async () => {
  await assertThrowsAsync(() => validateCancellation(''), 'ValidationError');
});

suite.test('cancellation: rejects null', async () => {
  await assertThrowsAsync(() => validateCancellation(null), 'ValidationError');
});

// ── validateComment: type validation ──

suite.test('comment: rejects invalid type', async () => {
  await assertThrowsAsync(
    () => validateComment({ content: 'text', listingId: 'l1', type: 'upvote' }),
    'ValidationError'
  );
});

suite.test('comment: accepts type comment', () => {
  validateComment({ content: 'text', listingId: 'l1', type: 'comment' });
});

suite.test('comment: accepts type question', () => {
  validateComment({ content: 'text', listingId: 'l1', type: 'question' });
});

suite.test('comment: accepts type answer', () => {
  validateComment({ content: 'text', listingId: 'l1', type: 'answer' });
});

suite.test('comment: accepts missing type (defaults allowed at service layer)', () => {
  // type is optional — the service defaults it; validation only rejects invalid values
  validateComment({ content: 'text', listingId: 'l1' });
});

// ── validateMedia: url-format acceptance ──

suite.test('media: accepts url-format item (browser FileReader format)', () => {
  validateMedia([{ url: 'data:image/png;base64,abc', type: 'image', name: 'photo.png', size: 1024 }]);
});

suite.test('media: accepts data-format item (legacy format)', () => {
  validateMedia([{ data: 'base64stuff', type: 'image', name: 'photo.png' }]);
});

suite.test('media: rejects item with neither url nor data', async () => {
  await assertThrowsAsync(
    () => validateMedia([{ type: 'image', name: 'photo.png' }]),
    'ValidationError'
  );
});

suite.test('media: rejects invalid type', async () => {
  await assertThrowsAsync(
    () => validateMedia([{ url: 'data:audio/mp3;base64,abc', type: 'audio', name: 'track.mp3' }]),
    'ValidationError'
  );
});

suite.test('media: rejects image exceeding 2MB size limit', async () => {
  await assertThrowsAsync(
    () => validateMedia([{ url: 'data:image/png;base64,abc', type: 'image', name: 'huge.png', size: 3 * 1024 * 1024 }]),
    'ValidationError'
  );
});

suite.test('media: rejects video exceeding 10MB size limit', async () => {
  await assertThrowsAsync(
    () => validateMedia([{ url: 'data:video/mp4;base64,abc', type: 'video', name: 'huge.mp4', size: 11 * 1024 * 1024 }]),
    'ValidationError'
  );
});

suite.test('media: rejects more than 2 videos', async () => {
  const threeVideos = [
    { url: 'data:video/mp4;base64,1', type: 'video', name: 'v1.mp4' },
    { url: 'data:video/mp4;base64,2', type: 'video', name: 'v2.mp4' },
    { url: 'data:video/mp4;base64,3', type: 'video', name: 'v3.mp4' },
  ];
  await assertThrowsAsync(() => validateMedia(threeVideos), 'ValidationError');
});

suite.test('media: accepts exactly 2 videos', () => {
  validateMedia([
    { url: 'data:video/mp4;base64,1', type: 'video', name: 'v1.mp4' },
    { url: 'data:video/mp4;base64,2', type: 'video', name: 'v2.mp4' },
  ]);
});

suite.test('media: skips size check when size field absent', () => {
  // Existing records may not have size stored — must not error
  validateMedia([{ url: 'data:image/png;base64,abc', type: 'image', name: 'photo.png' }]);
});

// ── Listing lifecycle: terminal state transitions ──

suite.test('listing SM: ARCHIVED is terminal — no transitions allowed', async () => {
  const targets = [ListingStatus.DRAFT, ListingStatus.ACTIVE, ListingStatus.UNDER_REVIEW,
    ListingStatus.REJECTED, ListingStatus.SOLD];
  for (const target of targets) {
    await assertThrowsAsync(
      () => validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.ARCHIVED, target),
      'StateTransitionError'
    );
  }
});

suite.test('listing SM: SOLD can only transition to ARCHIVED', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.SOLD, ListingStatus.ARCHIVED);
});

suite.test('listing SM: SOLD cannot go to ACTIVE', async () => {
  await assertThrowsAsync(
    () => validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.SOLD, ListingStatus.ACTIVE),
    'StateTransitionError'
  );
});

suite.test('listing SM: UNDER_REVIEW → ACTIVE (moderation approves)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.UNDER_REVIEW, ListingStatus.ACTIVE);
});

suite.test('listing SM: UNDER_REVIEW → REJECTED (moderation rejects)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.UNDER_REVIEW, ListingStatus.REJECTED);
});

suite.test('listing SM: REJECTED → UNDER_REVIEW (seller resubmits after edit)', () => {
  validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.REJECTED, ListingStatus.UNDER_REVIEW);
});

suite.test('listing SM: REJECTED cannot go directly ACTIVE', async () => {
  await assertThrowsAsync(
    () => validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.REJECTED, ListingStatus.ACTIVE),
    'StateTransitionError'
  );
});

suite.test('listing SM: ACTIVE cannot be moved to DRAFT', async () => {
  await assertThrowsAsync(
    () => validateTransition('listing', LISTING_TRANSITIONS, ListingStatus.ACTIVE, ListingStatus.DRAFT),
    'StateTransitionError'
  );
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
