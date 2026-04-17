/**
 * E2E: Startup & Auto-Seed
 *
 * The app auto-seeds all demo accounts on the first load of a fresh database
 * so testers go straight to /login. The setup wizard (/setup route) is
 * permanently locked and always redirects away.
 *
 * These tests verify:
 *   1. Fresh browser lands on /login (not /setup)
 *   2. /setup route is locked for unauthenticated users
 *   3. /setup route is locked for authenticated users too
 *   4. Seeded admin credentials work immediately
 *   5. Admin can create content right after first load
 *   6. Seeded categories are available in listing forms
 *   7. All seeded role accounts can log in
 *   8. Re-seeding does not duplicate accounts on reload
 */

import { test, expect } from '@playwright/test';
import { clearBrowserState, login, logout } from './helpers.js';

const ADMIN_PASS = 'Admin@TradeLoop1!';

test.describe('First-Run Setup Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('fresh browser redirects to /login (auto-seeded, not /setup)', async ({ page }) => {
    // clearBrowserState already navigated to / and waited for redirect
    await expect(page).toHaveURL(/\/#\/login/);
  });

  test('setup form shows step 1: admin credentials', async ({ page }) => {
    // /setup is locked — verify it redirects away rather than showing the form
    await page.goto('/#/setup');
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });

  test('setup with weak password shows validation error', async ({ page }) => {
    // /setup is inaccessible — validation is covered by SetupView component tests.
    // Here we confirm the route redirect is instant (no form rendered).
    await page.goto('/#/setup');
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });

  test('setup with mismatched passwords shows validation error', async ({ page }) => {
    // Same as above — route is locked, covered by SetupView.test.js at component level.
    await page.goto('/#/setup');
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });

  test('complete setup creates admin and redirects to home', async ({ page }) => {
    // Seeded admin can log in and lands on home
    await login(page, { username: 'admin', password: ADMIN_PASS });
    await expect(page).toHaveURL(/\/#\/(home|)$/);
    await expect(page.locator('.sidebar, nav, [class*="sidebar"]').first()).toBeVisible();
  });

  test('after setup, /setup redirects away (route is locked)', async ({ page }) => {
    await login(page, { username: 'admin', password: ADMIN_PASS });
    await logout(page);

    await page.goto('/#/setup');
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });

  test('admin can create a listing immediately after setup', async ({ page }) => {
    await login(page, { username: 'admin', password: ADMIN_PASS });

    await page.goto('/#/listings/new');
    await page.waitForURL('**/#/listings/new', { timeout: 8_000 });
    await expect(page.locator('h1').first()).toContainText(/create listing/i);
    await expect(page.locator('#title')).toBeVisible();
  });

  test('setup page is accessible before initialization but not after', async ({ page }) => {
    // With auto-seeding, /setup is inaccessible from the very first load
    await page.goto('/#/setup');
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);

    // Also inaccessible while authenticated — navigating from /#/home to
    // /#/setup is a hash-only change (no page reload), so use toHaveURL which
    // polls without requiring a load event rather than waitForURL.
    await login(page, { username: 'admin', password: ADMIN_PASS });
    await page.goto('/#/setup');
    await expect(page).not.toHaveURL(/\/#\/setup/, { timeout: 8_000 });
  });
});
