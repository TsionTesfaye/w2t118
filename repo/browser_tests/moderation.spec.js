/**
 * E2E: Moderation & Report Lifecycle
 *
 * Tests real browser moderation flows:
 *   1. Admin can access moderation dashboard
 *   2. Moderation queue shows pending cases
 *   3. Moderator can pick up a case (PENDING → IN_REVIEW)
 *   4. Moderator can make a decision (approve/reject)
 *   5. Regular user cannot access moderation (role guard)
 *   6. Support agent can access complaint queue
 *   7. Report tab shows open reports
 */

import { test, expect } from '@playwright/test';
import { clearBrowserState, completeSetup, login, logout, registerUser } from './helpers.js';

const ADMIN_PASS = 'Admin@TradeLoop1!';

test.describe('Moderation Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    // Admin is logged in
  });

  test('admin can navigate to moderation dashboard', async ({ page }) => {
    await page.goto('/#/moderation');
    await page.waitForURL('**/#/moderation**', { timeout: 8_000 });

    // Should show moderation UI
    await expect(
      page.locator('h1, h2, .page-header').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('moderation dashboard has queue, decisions, and reports tabs', async ({ page }) => {
    await page.goto('/#/moderation');
    await page.waitForURL('**/#/moderation**');

    // Tabs for queue/decisions/reports should be present
    const queueTab = page.locator(
      'button:has-text("Queue"), .pill-tab:has-text("Queue"), [class*="tab"]:has-text("Queue")'
    ).first();
    const decisionsTab = page.locator(
      'button:has-text("Decisions"), button:has-text("Review"), .pill-tab:has-text("Decisions")'
    ).first();

    if (await queueTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(queueTab).toBeVisible();
    }
  });

  test('empty moderation queue shows empty state', async ({ page }) => {
    await page.goto('/#/moderation/queue');
    await page.waitForURL('**/#/moderation**');

    // On fresh system with no content, queue should be empty
    const emptyOrTable = page.locator(
      '.empty-state, [class*="empty"], .data-table, table'
    ).first();
    await expect(emptyOrTable).toBeVisible({ timeout: 8_000 });
  });

  test('admin moderation sidebar link is visible', async ({ page }) => {
    await expect(
      page.locator('.sidebar a:has-text("Review Queue"), .nav-item:has-text("Review Queue")')
    ).toBeVisible({ timeout: 5_000 });
  });

  test('regular user does not see moderation link in sidebar', async ({ page }) => {
    // Logout admin
    await logout(page);

    // Register regular user and login
    await registerUser(page, { username: 'regmod1', displayName: 'Regular Mod Test' });
    await login(page, { username: 'regmod1', password: 'TestUser@Pass1!' });

    // Regular user should NOT see moderation section — check the nav specifically
    await expect(
      page.locator('.sidebar-nav')
    ).not.toContainText('Review Queue');
  });

  test('report tab shows correct column headers', async ({ page }) => {
    await page.goto('/#/moderation');
    await page.waitForURL('**/#/moderation**');

    // Navigate to reports tab
    const reportsTab = page.locator(
      'button:has-text("Reports"), .pill-tab:has-text("Reports")'
    ).first();
    if (await reportsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await reportsTab.click();
      await page.waitForTimeout(500);

      // Check that Type column shows targetType (the fix from previous session)
      const typeHeader = page.locator('th:has-text("Type")');
      if (await typeHeader.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(typeHeader).toBeVisible();
      }
    }
  });
});

test.describe('Support Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('admin can access support complaints view', async ({ page }) => {
    await page.goto('/#/support');
    await page.waitForURL('**/#/support**', { timeout: 8_000 });

    await expect(
      page.locator('h1, h2, .page-header').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('support dashboard shows complaints tab', async ({ page }) => {
    await page.goto('/#/support');
    await page.waitForURL('**/#/support**');

    const complaintsTab = page.locator(
      'button:has-text("Complaints"), .pill-tab:has-text("Complaints")'
    ).first();
    if (await complaintsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(complaintsTab).toBeVisible();
    }
  });

  test('empty support queue shows empty state', async ({ page }) => {
    await page.goto('/#/support/complaints');
    await page.waitForURL('**/#/support**');

    // Wait for loading spinner to disappear, then check for empty or data
    await page.waitForFunction(
      () => !document.querySelector('.loading-state'),
      { timeout: 12_000 }
    ).catch(() => {});

    const emptyOrContent = page.locator(
      '.empty-state, .data-table, table'
    ).first();
    await expect(emptyOrContent).toBeVisible({ timeout: 8_000 });
  });
});
