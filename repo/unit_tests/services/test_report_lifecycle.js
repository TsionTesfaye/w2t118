/**
 * Report → Decision → Penalty Loop Tests
 *
 * Verifies that moderation decisions automatically close the linked report:
 *   - approved decision → report DISMISSED
 *   - rejected decision → report RESOLVED with violation tags + penalty
 *   - report advances OPEN → UNDER_REVIEW when moderator picks up case
 *   - report already in UNDER_REVIEW when decided → closes correctly
 *   - no linked report → decide works normally (no side effects)
 *   - invalid reportId in createCase → rejected
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { ModerationService } from '../../src/services/ModerationService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import {
  ModerationStatus, ReportStatus, ListingStatus,
} from '../../src/domain/enums/statuses.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('Report → Decision → Penalty Loop');

// ── Repo stubs ──
function stubRepos() {
  const modCaseRepo  = new InMemoryRepository();
  const reportRepo   = new InMemoryRepository();
  const listingRepo  = new InMemoryRepository();
  const auditRepo    = new InMemoryRepository();
  const notifRepo    = new InMemoryRepository();
  const userRepo     = new InMemoryRepository();
  const sensitiveRepo = new InMemoryRepository();

  repos.moderationCaseRepository.create        = (r) => modCaseRepo.create(r);
  repos.moderationCaseRepository.getById       = (id) => modCaseRepo.getById(id);
  repos.moderationCaseRepository.getByIdOrFail = (id) => modCaseRepo.getByIdOrFail(id);
  repos.moderationCaseRepository.update        = (r) => modCaseRepo.update(r);
  repos.moderationCaseRepository.getByStatus   = (s) => modCaseRepo.getByIndex('status', s);

  repos.reportRepository.create        = (r) => reportRepo.create(r);
  repos.reportRepository.getAll        = () => reportRepo.getAll();
  repos.reportRepository.getById       = (id) => reportRepo.getById(id);
  repos.reportRepository.getByIdOrFail = (id) => reportRepo.getByIdOrFail(id);
  repos.reportRepository.update        = (r) => reportRepo.update(r);

  repos.listingRepository.create        = (r) => listingRepo.create(r);
  repos.listingRepository.getById       = (id) => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail = (id) => listingRepo.getByIdOrFail(id);
  repos.listingRepository.update        = (r) => listingRepo.update(r);
  repos.listingRepository.getAll        = () => listingRepo.getAll();
  repos.listingRepository.getByIndex    = (i, v) => listingRepo.getByIndex(i, v);
  repos.listingRepository.countByIndex  = (i, v) => listingRepo.countByIndex(i, v);

  repos.auditLogRepository.create       = (r) => auditRepo.create(r);
  repos.auditLogRepository.getAll       = () => auditRepo.getAll();
  repos.auditLogRepository.getByIndex   = (i, v) => auditRepo.getByIndex(i, v);

  repos.userRepository.getById          = (id) => userRepo.getById(id);
  repos.userRepository.getByIdOrFail    = (id) => userRepo.getByIdOrFail(id);
  repos.userRepository.getAll           = () => userRepo.getAll();
  repos.userRepository.getByUsername    = (u) => userRepo.getOneByIndex('username', u);
  repos.userRepository.getOneByIndex    = (i, v) => userRepo.getOneByIndex(i, v);
  repos.userRepository.create           = (r) => userRepo.create(r);
  repos.userRepository.update           = (r) => userRepo.update(r);

  repos.sensitiveWordRepository.getAll  = () => Promise.resolve([]);
  repos.sensitiveWordRepository.create  = (r) => sensitiveRepo.create(r);
  repos.sensitiveWordRepository.getById = () => Promise.resolve(null);
  repos.sensitiveWordRepository.getByIdOrFail = (id) => Promise.reject(new Error(`Not found: ${id}`));
  repos.sensitiveWordRepository.delete  = () => Promise.resolve();

  repos.notificationRepository.create        = (r) => notifRepo.create(r);
  repos.notificationRepository.getAll        = () => notifRepo.getAll();
  repos.notificationRepository.getById       = (id) => notifRepo.getById(id);
  repos.notificationRepository.getByIdOrFail = (id) => notifRepo.getByIdOrFail(id);
  repos.notificationRepository.update        = (r) => notifRepo.update(r);
  repos.notificationRepository.getByIndex    = (i, v) => notifRepo.getByIndex(i, v);
  repos.notificationRepository.getByUserId   = (uid) => notifRepo.getByIndex('userId', uid);
  repos.notificationRepository.getUnreadByUserId = async (uid) => {
    const all = await notifRepo.getByIndex('userId', uid);
    return all.filter(n => !n.isRead);
  };
  repos.notificationRepository.findUnread = async (uid, type, refId) => {
    const all = await notifRepo.getByIndex('userId', uid);
    return all.find(n => !n.isRead && n.type === type && n.referenceId === refId) || null;
  };
  repos.notificationRepository.countUnreadByUserId = async (uid) => {
    const all = await notifRepo.getByIndex('userId', uid);
    return all.filter(n => !n.isRead).length;
  };

  return { modCaseRepo, reportRepo, listingRepo };
}

function makeModSession(userId = 'mod-1') {
  return { userId, roles: [Roles.MODERATOR], lastActivityAt: Date.now(), createdAt: Date.now() };
}

async function seedReport(reportRepo, overrides = {}) {
  const report = {
    id: 'report-1',
    reporterId: 'reporter-user',
    targetId: 'listing-1',
    targetType: 'listing',
    reason: 'spam',
    description: 'This is spam',
    status: ReportStatus.OPEN,
    decision: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
  await reportRepo.create(report);
  return report;
}

async function seedCase(modCaseRepo, reportId = null, overrides = {}) {
  const modCase = {
    id: 'case-1',
    contentId: 'listing-1',
    contentType: 'listing',
    reason: 'report: spam',
    flaggedWords: [],
    reportId,
    status: ModerationStatus.IN_REVIEW,
    reviewerId: 'mod-1',
    decision: null,
    violationTags: [],
    penalty: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
  await modCaseRepo.create(modCase);
  return modCase;
}

// ══════════════════════════════════════════════════════════
//  PICK UP CASE → ADVANCES REPORT TO UNDER_REVIEW
// ══════════════════════════════════════════════════════════

suite.test('pickUpCase advances linked report from OPEN to UNDER_REVIEW', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  await seedReport(reportRepo, { status: ReportStatus.OPEN });
  const pendingCase = await modCaseRepo.create({
    id: 'case-pickup', contentId: 'listing-1', contentType: 'listing',
    reason: 'test', flaggedWords: [], reportId: 'report-1',
    status: ModerationStatus.PENDING, reviewerId: null,
    decision: null, violationTags: [], penalty: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  const modSession = makeModSession();
  await ModerationService.pickUpCase(modSession, 'case-pickup');

  const updatedReport = await reportRepo.getById('report-1');
  assertEqual(updatedReport.status, ReportStatus.UNDER_REVIEW,
    'Report must be UNDER_REVIEW after moderator picks up linked case');
});

suite.test('pickUpCase with no linked report does not throw', async () => {
  const { modCaseRepo } = stubRepos();
  await modCaseRepo.create({
    id: 'case-no-report', contentId: 'x', contentType: 'listing',
    reason: 'test', flaggedWords: [], reportId: null,
    status: ModerationStatus.PENDING, reviewerId: null,
    decision: null, violationTags: [], penalty: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  });

  const modSession = makeModSession();
  const result = await ModerationService.pickUpCase(modSession, 'case-no-report');
  assertEqual(result.status, ModerationStatus.IN_REVIEW, 'Case must be picked up normally');
});

// ══════════════════════════════════════════════════════════
//  DECISION: APPROVED → REPORT DISMISSED
// ══════════════════════════════════════════════════════════

suite.test('approved decision dismisses the linked report', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  await seedReport(reportRepo, { status: ReportStatus.UNDER_REVIEW });
  await seedCase(modCaseRepo, 'report-1');

  const modSession = makeModSession();
  await ModerationService.decide(modSession, 'case-1', { decision: 'approved', violationTags: [] });

  const updatedReport = await reportRepo.getById('report-1');
  assertEqual(updatedReport.status, ReportStatus.DISMISSED,
    'Report must be DISMISSED when moderation decision is "approved" (no violation)');
});

// ══════════════════════════════════════════════════════════
//  DECISION: REJECTED → REPORT RESOLVED + TAGS + PENALTY
// ══════════════════════════════════════════════════════════

suite.test('rejected decision resolves the linked report', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  await seedReport(reportRepo, { status: ReportStatus.UNDER_REVIEW });
  await seedCase(modCaseRepo, 'report-1');

  const modSession = makeModSession();
  await ModerationService.decide(modSession, 'case-1', {
    decision: 'rejected',
    violationTags: ['spam', 'misleading'],
    penalty: 'warning',
  });

  const updatedReport = await reportRepo.getById('report-1');
  assertEqual(updatedReport.status, ReportStatus.RESOLVED,
    'Report must be RESOLVED when moderation decision is "rejected" (violation found)');
});

suite.test('rejected decision attaches violation tags to report', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  await seedReport(reportRepo, { id: 'report-tags', status: ReportStatus.UNDER_REVIEW });
  await seedCase(modCaseRepo, 'report-tags', { id: 'case-tags' });

  const modSession = makeModSession();
  await ModerationService.decide(modSession, 'case-tags', {
    decision: 'rejected',
    violationTags: ['counterfeit', 'prohibited'],
    penalty: 'ban',
  });

  const updatedReport = await reportRepo.getById('report-tags');
  assert(Array.isArray(updatedReport.violationTags), 'Report must have violationTags');
  assert(updatedReport.violationTags.includes('counterfeit'), 'Tag "counterfeit" must be attached');
  assert(updatedReport.violationTags.includes('prohibited'), 'Tag "prohibited" must be attached');
  assertEqual(updatedReport.penalty, 'ban', 'Penalty must be recorded on the report');
});

suite.test('approved decision sets decision field on report', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  await seedReport(reportRepo, { id: 'report-dec', status: ReportStatus.UNDER_REVIEW });
  await seedCase(modCaseRepo, 'report-dec', { id: 'case-dec' });

  await ModerationService.decide(makeModSession(), 'case-dec', {
    decision: 'approved', violationTags: [],
  });

  const updatedReport = await reportRepo.getById('report-dec');
  assertEqual(updatedReport.decision, 'approved', 'Decision must be recorded on the report');
});

// ══════════════════════════════════════════════════════════
//  REPORT STILL IN OPEN AT DECISION TIME (EDGE CASE)
// ══════════════════════════════════════════════════════════

suite.test('report in OPEN state at decision time is auto-advanced and closed', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  // Report never advanced to UNDER_REVIEW (e.g. pickUpCase was skipped)
  await seedReport(reportRepo, { id: 'report-open', status: ReportStatus.OPEN });
  await seedCase(modCaseRepo, 'report-open', { id: 'case-open' });

  await ModerationService.decide(makeModSession(), 'case-open', {
    decision: 'rejected', violationTags: ['spam'],
  });

  const updatedReport = await reportRepo.getById('report-open');
  assertEqual(updatedReport.status, ReportStatus.RESOLVED,
    'OPEN report must be auto-advanced and resolved by the decision');
});

// ══════════════════════════════════════════════════════════
//  NO LINKED REPORT — NO SIDE EFFECTS
// ══════════════════════════════════════════════════════════

suite.test('decide without linked report works normally', async () => {
  const { modCaseRepo } = stubRepos();

  await seedCase(modCaseRepo, null); // no reportId

  const result = await ModerationService.decide(makeModSession(), 'case-1', {
    decision: 'rejected', violationTags: ['test'],
  });

  assertEqual(result.status, ModerationStatus.REJECTED, 'Case must be rejected normally');
  assertEqual(result.decision, 'rejected', 'Decision must be recorded on case');
});

// ══════════════════════════════════════════════════════════
//  ALREADY TERMINAL REPORT — IDEMPOTENT
// ══════════════════════════════════════════════════════════

suite.test('already resolved report is not re-updated', async () => {
  const { modCaseRepo, reportRepo } = stubRepos();

  // Report already resolved (terminal)
  await seedReport(reportRepo, { id: 'report-done', status: ReportStatus.RESOLVED });
  await seedCase(modCaseRepo, 'report-done', { id: 'case-done' });

  // Should not throw — just skip the report update
  const result = await ModerationService.decide(makeModSession(), 'case-done', {
    decision: 'approved', violationTags: [],
  });
  assertEqual(result.status, ModerationStatus.APPROVED, 'Case must still be decided');

  // Report status unchanged
  const report = await reportRepo.getById('report-done');
  assertEqual(report.status, ReportStatus.RESOLVED, 'Already-terminal report must not be changed');
});

// ══════════════════════════════════════════════════════════
//  DATA CONSISTENCY: INVALID REPORT ID
// ══════════════════════════════════════════════════════════

suite.test('createCase with non-existent reportId is rejected', async () => {
  stubRepos(); // report repo is empty

  await assertThrowsAsync(
    () => ModerationService.createCase(null, {
      contentId: 'listing-x',
      contentType: 'listing',
      reason: 'test',
      reportId: 'nonexistent-report-id',
    }),
    'ValidationError'
  );
});

suite.test('createCase with null reportId is accepted (no link)', async () => {
  const { modCaseRepo } = stubRepos();

  const result = await ModerationService.createCase(null, {
    contentId: 'listing-y',
    contentType: 'listing',
    reason: 'pre-screen',
    reportId: null,
  });

  assert(result.id, 'Case must be created with null reportId');
  assertEqual(result.reportId, null, 'reportId must be null on the created case');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
