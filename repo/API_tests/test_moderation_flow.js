/**
 * Integration Test: Moderation pipeline flow.
 * Tests: report → pre-screen → review → decision
 */

import { TestRunner, assert, assertEqual, assertThrowsAsync } from '../unit_tests/setup.js';
import { validateTransition } from '../src/domain/validation/stateMachine.js';
import {
  ModerationStatus, MODERATION_TRANSITIONS,
  ReportStatus, REPORT_TRANSITIONS,
} from '../src/domain/enums/statuses.js';

const suite = new TestRunner('Integration: Moderation Flow');

// ── Moderation Case Lifecycle ──

suite.test('full moderation flow: pending → in_review → approved', () => {
  let status = ModerationStatus.PENDING;

  validateTransition('moderation', MODERATION_TRANSITIONS, status, ModerationStatus.IN_REVIEW);
  status = ModerationStatus.IN_REVIEW;

  validateTransition('moderation', MODERATION_TRANSITIONS, status, ModerationStatus.APPROVED);
  status = ModerationStatus.APPROVED;

  assertEqual(status, ModerationStatus.APPROVED);
});

suite.test('moderation rejection: pending → in_review → rejected', () => {
  let status = ModerationStatus.PENDING;

  validateTransition('moderation', MODERATION_TRANSITIONS, status, ModerationStatus.IN_REVIEW);
  status = ModerationStatus.IN_REVIEW;

  validateTransition('moderation', MODERATION_TRANSITIONS, status, ModerationStatus.REJECTED);
  status = ModerationStatus.REJECTED;

  assertEqual(status, ModerationStatus.REJECTED);
});

suite.test('rejected content can be resubmitted: rejected → pending', () => {
  validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.REJECTED, ModerationStatus.PENDING);
});

suite.test('cannot skip to approved from pending', async () => {
  await assertThrowsAsync(
    () => validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.PENDING, ModerationStatus.APPROVED),
    'StateTransitionError'
  );
});

suite.test('approved is terminal', async () => {
  await assertThrowsAsync(
    () => validateTransition('moderation', MODERATION_TRANSITIONS, ModerationStatus.APPROVED, ModerationStatus.IN_REVIEW),
    'StateTransitionError'
  );
});

// ── Report Lifecycle ──

suite.test('report flow: open → under_review → resolved', () => {
  let status = ReportStatus.OPEN;

  validateTransition('report', REPORT_TRANSITIONS, status, ReportStatus.UNDER_REVIEW);
  status = ReportStatus.UNDER_REVIEW;

  validateTransition('report', REPORT_TRANSITIONS, status, ReportStatus.RESOLVED);
  status = ReportStatus.RESOLVED;

  assertEqual(status, ReportStatus.RESOLVED);
});

suite.test('report can be dismissed', () => {
  validateTransition('report', REPORT_TRANSITIONS, ReportStatus.UNDER_REVIEW, ReportStatus.DISMISSED);
});

suite.test('report: cannot go from open to resolved directly', async () => {
  await assertThrowsAsync(
    () => validateTransition('report', REPORT_TRANSITIONS, ReportStatus.OPEN, ReportStatus.RESOLVED),
    'StateTransitionError'
  );
});

suite.test('resolved report is terminal', async () => {
  await assertThrowsAsync(
    () => validateTransition('report', REPORT_TRANSITIONS, ReportStatus.RESOLVED, ReportStatus.OPEN),
    'StateTransitionError'
  );
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
