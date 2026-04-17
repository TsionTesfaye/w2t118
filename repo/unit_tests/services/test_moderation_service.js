/**
 * ModerationService — Unit Tests
 *
 * Covers: preScreenContent (word matching, exact vs substring, empty list),
 * createCase, pickUpCase, decide (approve/reject, listing side-effect),
 * getReviewQueue, getCaseById, createReport (auto-creates case),
 * addSensitiveWord, removeSensitiveWord, getAllSensitiveWords.
 *
 * Stubs: moderationCaseRepository, sensitiveWordRepository, reportRepository,
 *        listingRepository, AuditService, NotificationService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { ModerationService } from '../../src/services/ModerationService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { NotificationService } from '../../src/services/NotificationService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import {
  ModerationStatus, ReportStatus, ListingStatus,
} from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('ModerationService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const modCaseRepo    = new InMemoryRepository();
const sensitiveRepo  = new InMemoryRepository();
const reportRepo     = new InMemoryRepository();
const listingRepo    = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function modSession(id  = 'mod-1')   { return createSession(id, [Roles.MODERATOR]); }
function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function userSession(id  = 'user-1')  { return createSession(id, [Roles.USER]); }

function stubRepos() {
  // moderationCaseRepository
  repos.moderationCaseRepository.create        = r  => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById       = id => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = async id => {
    const r = await modCaseRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.moderationCaseRepository.getAll      = () => modCaseRepo.getAll();
  repos.moderationCaseRepository.update      = r  => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus = s  => modCaseRepo.getByIndex('status', s);

  // sensitiveWordRepository
  repos.sensitiveWordRepository.create        = r  => sensitiveRepo.create(r);
  repos.sensitiveWordRepository.getById       = id => sensitiveRepo.getById(id);
  repos.sensitiveWordRepository.getByIdOrFail = async id => {
    const r = await sensitiveRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.sensitiveWordRepository.getAll    = () => sensitiveRepo.getAll();
  repos.sensitiveWordRepository.delete    = id => sensitiveRepo.delete(id);
  repos.sensitiveWordRepository.getByWord = word => sensitiveRepo.getOneByIndex('word', word);

  // reportRepository
  repos.reportRepository.create        = r  => reportRepo.create(r);
  repos.reportRepository.getById       = id => reportRepo.getById(id);
  repos.reportRepository.getByIdOrFail = async id => {
    const r = await reportRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.reportRepository.getAll  = () => reportRepo.getAll();
  repos.reportRepository.update  = r  => reportRepo.update(r);

  // listingRepository
  repos.listingRepository.getById = id => listingRepo.getById(id);
  repos.listingRepository.update  = r  => listingRepo.update(r);

  AuditService.log           = async () => {};
  NotificationService.create = async () => {};
}

// ── preScreenContent ──────────────────────────────────────────────────────────

suite.test('preScreenContent: returns empty array when word list is empty', async () => {
  stubRepos(); await sensitiveRepo.clear();
  const result = await ModerationService.preScreenContent('This is totally fine text.');
  assertEqual(result.length, 0);
});

suite.test('preScreenContent: returns empty array for non-string input', async () => {
  stubRepos(); await sensitiveRepo.clear();
  const result = await ModerationService.preScreenContent(null);
  assertEqual(result.length, 0);
});

suite.test('preScreenContent: substring match detects word inside sentence', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'badword', matchType: 'substring', createdAt: Date.now() });

  const result = await ModerationService.preScreenContent('This contains badword inside.');
  assertEqual(result.length, 1);
  assertEqual(result[0], 'badword');
});

suite.test('preScreenContent: substring match is case-insensitive', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'badword', matchType: 'substring', createdAt: Date.now() });

  const result = await ModerationService.preScreenContent('This contains BADWORD in caps.');
  assertEqual(result.length, 1);
});

suite.test('preScreenContent: exact match only flags whole word', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'bad', matchType: 'exact', createdAt: Date.now() });

  // "badge" should NOT match exact "bad"
  const result = await ModerationService.preScreenContent('This badge is great.');
  assertEqual(result.length, 0);
});

suite.test('preScreenContent: exact match flags isolated word', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'bad', matchType: 'exact', createdAt: Date.now() });

  const result = await ModerationService.preScreenContent('This is really bad.');
  assertEqual(result.length, 1);
});

suite.test('preScreenContent: multiple words flagged', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'spam', matchType: 'substring', createdAt: Date.now() });
  await sensitiveRepo.create({ id: uid(), word: 'scam', matchType: 'substring', createdAt: Date.now() });

  const result = await ModerationService.preScreenContent('This is spam and a scam!');
  assertEqual(result.length, 2);
});

suite.test('preScreenContent: clean text returns empty array', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await sensitiveRepo.create({ id: uid(), word: 'badword', matchType: 'substring', createdAt: Date.now() });

  const result = await ModerationService.preScreenContent('This is perfectly clean content.');
  assertEqual(result.length, 0);
});

// ── createCase ────────────────────────────────────────────────────────────────

suite.test('createCase: creates a PENDING case without a session', async () => {
  stubRepos(); await modCaseRepo.clear();

  const result = await ModerationService.createCase(null, {
    contentId: uid(), contentType: 'listing', reason: 'flagged words',
  });
  assertEqual(result.status, ModerationStatus.PENDING);
  assert(result.id, 'id assigned');
});

suite.test('createCase: with valid reportId links the report', async () => {
  stubRepos(); await modCaseRepo.clear(); await reportRepo.clear();
  const report = { id: uid(), status: ReportStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await reportRepo.create(report);

  const result = await ModerationService.createCase(modSession(), {
    contentId: uid(), contentType: 'listing', reason: 'reported', reportId: report.id,
  });
  assertEqual(result.reportId, report.id);
});

suite.test('createCase: invalid reportId throws ValidationError', async () => {
  stubRepos(); await modCaseRepo.clear(); await reportRepo.clear();

  await assertThrowsAsync(
    () => ModerationService.createCase(modSession(), {
      contentId: uid(), contentType: 'listing', reason: 'bad', reportId: 'nonexistent',
    }),
    'ValidationError',
  );
});

// ── pickUpCase ────────────────────────────────────────────────────────────────

suite.test('pickUpCase: moderator can pick up a PENDING case', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'listing', status: ModerationStatus.PENDING, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  const result = await ModerationService.pickUpCase(modSession(), c.id);
  assertEqual(result.status, ModerationStatus.IN_REVIEW);
  assertEqual(result.reviewerId, 'mod-1');
});

suite.test('pickUpCase: regular user cannot pick up case', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'listing', status: ModerationStatus.PENDING, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await assertThrowsAsync(
    () => ModerationService.pickUpCase(userSession(), c.id),
    'AuthorizationError',
  );
});

suite.test('pickUpCase: advances linked report OPEN → UNDER_REVIEW', async () => {
  stubRepos(); await modCaseRepo.clear(); await reportRepo.clear();
  const report = { id: uid(), status: ReportStatus.OPEN, createdAt: Date.now(), updatedAt: Date.now() };
  await reportRepo.create(report);

  const c = { id: uid(), contentId: uid(), contentType: 'listing', status: ModerationStatus.PENDING, reportId: report.id, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await ModerationService.pickUpCase(modSession(), c.id);
  const updatedReport = await reportRepo.getById(report.id);
  assertEqual(updatedReport.status, ReportStatus.UNDER_REVIEW);
});

// ── decide ────────────────────────────────────────────────────────────────────

suite.test('decide: approve moves case to APPROVED', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'comment', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  const result = await ModerationService.decide(modSession(), c.id, { decision: 'approved' });
  assertEqual(result.status, ModerationStatus.APPROVED);
  assertEqual(result.decision, 'approved');
});

suite.test('decide: reject requires at least one violation tag', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'comment', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await assertThrowsAsync(
    () => ModerationService.decide(modSession(), c.id, { decision: 'rejected', violationTags: [] }),
    'ValidationError',
  );
});

suite.test('decide: reject with violation tag moves case to REJECTED', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'comment', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  const result = await ModerationService.decide(
    modSession(), c.id, { decision: 'rejected', violationTags: ['spam'] },
  );
  assertEqual(result.status, ModerationStatus.REJECTED);
  assert(result.violationTags.includes('spam'), 'violation tags stored');
});

suite.test('decide: invalid decision string throws ValidationError', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'comment', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await assertThrowsAsync(
    () => ModerationService.decide(modSession(), c.id, { decision: 'maybe' }),
    'ValidationError',
  );
});

suite.test('decide: regular user cannot decide', async () => {
  stubRepos(); await modCaseRepo.clear();
  const c = { id: uid(), contentId: uid(), contentType: 'comment', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await assertThrowsAsync(
    () => ModerationService.decide(userSession(), c.id, { decision: 'approved' }),
    'AuthorizationError',
  );
});

suite.test('decide: approve on listing UNDER_REVIEW moves listing to ACTIVE', async () => {
  stubRepos(); await modCaseRepo.clear(); await listingRepo.clear();
  const listing = { id: uid(), sellerId: 'seller-1', status: ListingStatus.UNDER_REVIEW, createdAt: Date.now(), updatedAt: Date.now() };
  await listingRepo.create(listing);

  const c = { id: uid(), contentId: listing.id, contentType: 'listing', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await ModerationService.decide(modSession(), c.id, { decision: 'approved' });
  const updatedListing = await listingRepo.getById(listing.id);
  assertEqual(updatedListing.status, ListingStatus.ACTIVE);
});

suite.test('decide: reject on listing UNDER_REVIEW moves listing to REJECTED', async () => {
  stubRepos(); await modCaseRepo.clear(); await listingRepo.clear();
  const listing = { id: uid(), sellerId: 'seller-1', status: ListingStatus.UNDER_REVIEW, createdAt: Date.now(), updatedAt: Date.now() };
  await listingRepo.create(listing);

  const c = { id: uid(), contentId: listing.id, contentType: 'listing', status: ModerationStatus.IN_REVIEW, reportId: null, createdAt: Date.now(), updatedAt: Date.now() };
  await modCaseRepo.create(c);

  await ModerationService.decide(modSession(), c.id, { decision: 'rejected', violationTags: ['prohibited_item'] });
  const updatedListing = await listingRepo.getById(listing.id);
  assertEqual(updatedListing.status, ListingStatus.REJECTED);
});

// ── getReviewQueue ────────────────────────────────────────────────────────────

suite.test('getReviewQueue: returns PENDING and IN_REVIEW cases', async () => {
  stubRepos(); await modCaseRepo.clear();
  await modCaseRepo.create({ id: uid(), status: ModerationStatus.PENDING, createdAt: Date.now(), updatedAt: Date.now() });
  await modCaseRepo.create({ id: uid(), status: ModerationStatus.IN_REVIEW, createdAt: Date.now(), updatedAt: Date.now() });
  await modCaseRepo.create({ id: uid(), status: ModerationStatus.APPROVED, createdAt: Date.now(), updatedAt: Date.now() });

  const queue = await ModerationService.getReviewQueue(modSession());
  assertEqual(queue.length, 2);
  assert(queue.every(c =>
    c.status === ModerationStatus.PENDING || c.status === ModerationStatus.IN_REVIEW
  ), 'only pending/in_review returned');
});

suite.test('getReviewQueue: regular user cannot access queue', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ModerationService.getReviewQueue(userSession()),
    'AuthorizationError',
  );
});

// ── createReport ──────────────────────────────────────────────────────────────

suite.test('createReport: user creates report and auto-creates moderation case', async () => {
  stubRepos(); await reportRepo.clear(); await modCaseRepo.clear();

  const report = await ModerationService.createReport(userSession('user-1'), {
    targetId: uid(), targetType: 'listing', reason: 'spam', description: 'Spam listing.',
  });
  assertEqual(report.status, ReportStatus.OPEN);
  assertEqual(report.reporterId, 'user-1');

  // auto-created moderation case
  const cases = await modCaseRepo.getAll();
  assertEqual(cases.length, 1);
  assertEqual(cases[0].reportId, report.id);
});

suite.test('createReport: missing required fields throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ModerationService.createReport(userSession(), { targetId: uid() }), // missing targetType and reason
    'ValidationError',
  );
});

// ── Sensitive word management ─────────────────────────────────────────────────

suite.test('addSensitiveWord: admin can add a word', async () => {
  stubRepos(); await sensitiveRepo.clear();
  const result = await ModerationService.addSensitiveWord(adminSession(), 'badslur', 'substring');
  assertEqual(result.word, 'badslur');
  assertEqual(result.matchType, 'substring');
});

suite.test('addSensitiveWord: duplicate word throws ValidationError', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await ModerationService.addSensitiveWord(adminSession(), 'spam', 'substring');
  await assertThrowsAsync(
    () => ModerationService.addSensitiveWord(adminSession(), 'spam', 'exact'),
    'ValidationError',
  );
});

suite.test('addSensitiveWord: invalid matchType throws ValidationError', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await assertThrowsAsync(
    () => ModerationService.addSensitiveWord(adminSession(), 'word', 'fuzzy'),
    'ValidationError',
  );
});

suite.test('addSensitiveWord: non-admin cannot add', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ModerationService.addSensitiveWord(userSession(), 'word', 'substring'),
    'AuthorizationError',
  );
});

suite.test('removeSensitiveWord: admin can remove a word', async () => {
  stubRepos(); await sensitiveRepo.clear();
  const entry = await ModerationService.addSensitiveWord(adminSession(), 'removeMe', 'substring');
  await ModerationService.removeSensitiveWord(adminSession(), entry.id);
  const all = await ModerationService.getAllSensitiveWords(adminSession());
  assertEqual(all.length, 0);
});

suite.test('getAllSensitiveWords: returns all words', async () => {
  stubRepos(); await sensitiveRepo.clear();
  await ModerationService.addSensitiveWord(adminSession(), 'alpha', 'exact');
  await ModerationService.addSensitiveWord(adminSession(), 'beta', 'substring');
  const all = await ModerationService.getAllSensitiveWords(adminSession());
  assertEqual(all.length, 2);
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ModerationService.getReviewQueue(null),
    'AuthenticationError',
  );
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
