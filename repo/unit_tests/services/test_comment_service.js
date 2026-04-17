/**
 * CommentService — Unit Tests
 *
 * Covers: create (comment/question/answer), update, delete (soft),
 * getByListingId, getQAByListingId, permission checks, moderation pre-screen.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { CommentService } from '../../src/services/CommentService.js';
import { ModerationService } from '../../src/services/ModerationService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { Permissions } from '../../src/domain/enums/permissions.js';
import { ListingStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('CommentService');

const commentRepo = new InMemoryRepository();
const listingRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1')    { return createSession(id, [Roles.USER]); }
function sellerSession(id = 'seller-1') { return createSession(id, [Roles.USER]); }
function modSession(id = 'mod-1')     { return createSession(id, [Roles.MODERATOR]); }

function stubRepos() {
  repos.commentRepository.create       = r  => commentRepo.create(r);
  repos.commentRepository.getById      = id => commentRepo.getById(id);
  repos.commentRepository.getByIdOrFail = async id => {
    const r = await commentRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.commentRepository.getAll       = () => commentRepo.getAll();
  repos.commentRepository.update       = r  => commentRepo.update(r);
  repos.commentRepository.getByIndex   = (k, v) => commentRepo.getByIndex(k, v);

  repos.listingRepository.getById      = id => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = async id => {
    const r = await listingRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };

  AuditService.log                   = async () => {};
  ModerationService.preScreenContent = async () => [];
  ModerationService.createCase       = async () => {};
}

function makeListing(overrides = {}) {
  return {
    id: uid(), sellerId: 'seller-1', title: 'Item',
    status: ListingStatus.ACTIVE, createdAt: Date.now(), updatedAt: Date.now(), ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('create: user posts a comment on a listing', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const result = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Nice item!', type: 'comment',
  });
  assertEqual(result.type,      'comment');
  assertEqual(result.userId,    'buyer-1');
  assertEqual(result.listingId, listing.id);
  assert(!result.isDeleted, 'not deleted');
});

suite.test('create: user posts a question (type=question)', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const result = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Is this still available?', type: 'question',
  });
  assertEqual(result.type, 'question');
});

suite.test('create: seller can post an answer to a question', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  // Buyer posts a question
  const question = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'What is the condition?', type: 'question',
  });

  // Seller answers
  const answer = await CommentService.create(sellerSession('seller-1'), {
    listingId: listing.id, content: 'Excellent condition!', type: 'answer',
    parentId: question.id,
  });
  assertEqual(answer.type,     'answer');
  assertEqual(answer.parentId, question.id);
  assertEqual(answer.userId,   'seller-1');
});

suite.test('create: non-seller cannot post an answer', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  const question = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Question?', type: 'question',
  });

  await assertThrowsAsync(
    () => CommentService.create(userSession('other-buyer'), {
      listingId: listing.id, content: 'Not seller answer', type: 'answer', parentId: question.id,
    }),
    'ValidationError',
  );
});

suite.test('create: empty content throws ValidationError', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => CommentService.create(userSession(), { listingId: listing.id, content: '', type: 'comment' }),
    'ValidationError',
  );
});

suite.test('create: flagged content triggers moderation (returns comment)', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  ModerationService.preScreenContent = async () => ['badword'];
  const listing = makeListing();
  await listingRepo.create(listing);

  // Should not throw — returns flagged comment
  const result = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Some badword content', type: 'comment',
  });
  assert(result.id, 'comment created even when flagged');
});

suite.test('delete: soft deletes comment (sets isDeleted, clears content)', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const comment = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Will be deleted', type: 'comment',
  });

  // Moderators have CONTENT_DELETE permission; owners without that role cannot delete
  await CommentService.delete(modSession(), comment.id);
  const stored = await commentRepo.getById(comment.id);
  assertEqual(stored.isDeleted, true);
  assert(stored.content === '[deleted]' || stored.content === '', 'content cleared');
});

suite.test('delete: non-owner cannot delete comment', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const comment = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Protected', type: 'comment',
  });

  await assertThrowsAsync(
    () => CommentService.delete(userSession('other-user'), comment.id),
    'AuthorizationError',
  );
});

suite.test('getByListingId: filters out soft-deleted comments', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const c1 = await CommentService.create(userSession('buyer-1'), { listingId: listing.id, content: 'Visible', type: 'comment' });
  const c2 = await CommentService.create(userSession('buyer-1'), { listingId: listing.id, content: 'To delete', type: 'comment' });
  await CommentService.delete(modSession(), c2.id);

  const results = await CommentService.getByListingId(userSession('buyer-1'), listing.id);
  assert(results.some(c => c.id === c1.id), 'visible comment present');
  assert(!results.some(c => c.id === c2.id && c.isDeleted), 'deleted comment excluded');
});

suite.test('getQAByListingId: returns questions with nested answers', async () => {
  stubRepos(); await commentRepo.clear(); await listingRepo.clear();
  const listing = makeListing({ sellerId: 'seller-1' });
  await listingRepo.create(listing);

  const question = await CommentService.create(userSession('buyer-1'), {
    listingId: listing.id, content: 'Q1?', type: 'question',
  });
  await CommentService.create(sellerSession('seller-1'), {
    listingId: listing.id, content: 'A1!', type: 'answer', parentId: question.id,
  });

  const qa = await CommentService.getQAByListingId(userSession('buyer-1'), listing.id);
  assertEqual(qa.length, 1);
  assert(Array.isArray(qa[0].answers), 'answers array present');
  assertEqual(qa[0].answers.length, 1);
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
