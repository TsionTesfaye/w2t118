/**
 * E2E: First-Run Setup Flow
 *
 * Tests the entire first-run initialization flow in a real browser:
 *   1. Fresh browser → redirects to /setup
 *   2. Setup wizard completes admin creation
 *   3. Category seeding during step 2
 *   4. After setup → admin logged in, home page shown
 *   5. /setup route is locked after initialization
 *   6. Admin can create content immediately after setup
 */

import { test, expect } from '@playwright/test';
import { clearBrowserState, completeSetup, login } from './helpers.js';

test.describe('First-Run Setup Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('fresh browser redirects to /setup', async ({ page }) => {
    await page.goto('/');
    // Fresh browser must redirect to /setup (not login or home)
    await page.waitForURL(/\/#\/setup/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/#\/setup/);
  });

  test('setup form shows step 1: admin credentials', async ({ page }) => {
    await page.goto('/#/setup');
    await page.waitForURL('**/#/setup');

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('setup with weak password shows validation error', async ({ page }) => {
    await page.goto('/#/setup');
    await page.fill('#username', 'admin');
    await page.fill('#displayName', 'Admin');
    await page.fill('#password', 'weak');
    await page.fill('#confirmPassword', 'weak');
    await page.click('button[type="submit"]');

    await expect(page.locator('.alert-danger, .error, [class*="error"]').first())
      .toBeVisible({ timeout: 5_000 });
  });

  test('setup with mismatched passwords shows validation error', async ({ page }) => {
    await page.goto('/#/setup');
    await page.fill('#username', 'admin');
    await page.fill('#displayName', 'Admin');
    await page.fill('#password', 'Admin@TradeLoop1!');
    await page.fill('#confirmPassword', 'Different@Pass1!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.alert-danger, .error, [class*="error"]').first())
      .toBeVisible({ timeout: 5_000 });
  });

  test('complete setup creates admin and redirects to home', async ({ page }) => {
    await completeSetup(page, {
      username: 'admin',
      password: 'Admin@TradeLoop1!',
      displayName: 'Site Admin',
    });

    // Should be on home after setup
    await expect(page).toHaveURL(/\/#\/(home|)$/);
    // Sidebar should be visible (authenticated state)
    await expect(page.locator('.sidebar, nav, [class*="sidebar"]').first()).toBeVisible();
  });

  test('after setup, /setup redirects away (route is locked)', async ({ page }) => {
    await completeSetup(page);

    // Logout first, then try to navigate to /setup
    await page.click('button:has-text("Logout")');
    await page.waitForURL(/\/#\/login/);

    await page.goto('/#/setup');
    // Should be redirected to login (not setup)
    await page.waitForURL(/\/#\/(login|home)/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });

  test('admin can create a listing immediately after setup', async ({ page }) => {
    await completeSetup(page);

    // Navigate to create listing
    await page.goto('/#/listings/new');
    await page.waitForURL('**/#/listings/new', { timeout: 8_000 });
    await expect(page.locator('h1').first()).toContainText(/create listing/i);
    await expect(page.locator('#title')).toBeVisible();
  });

  test('setup page is accessible before initialization but not after', async ({ page }) => {
    // Before: setup page loads
    await page.goto('/#/setup');
    await expect(page).toHaveURL(/\/#\/setup/, { timeout: 8_000 });

    // Complete setup
    await completeSetup(page);

    // Now logout and try setup again
    await page.click('button:has-text("Logout")');
    await page.waitForURL(/\/#\/login/);
    await page.goto('/#/setup');
    await expect(page).not.toHaveURL(/\/#\/setup/);
  });
});
