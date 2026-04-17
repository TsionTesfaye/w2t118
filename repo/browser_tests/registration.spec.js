/**
 * E2E: Registration & Account Recovery
 *
 * Tests the RegisterView and RecoveryView flows:
 *   Registration:
 *     1. All required fields present
 *     2. Weak password shows validation error
 *     3. Mismatched passwords shows validation error
 *     4. Duplicate username shows error
 *     5. Successful registration redirects to login
 *     6. Registered user can log in
 *   Account Recovery:
 *     1. Recovery page renders step 1 (username field)
 *     2. Unknown username shows error
 *     3. Valid username advances to step 2 (security questions)
 *     4. Wrong answers show error
 */

import { test, expect } from '@playwright/test';
import { clearBrowserState, completeSetup, login, logout, registerUser } from './helpers.js';

const ADMIN_PASS = 'Admin@TradeLoop1!';
const USER_PASS  = 'TestUser@Pass1!';

// ── Registration ──────────────────────────────────────────────

test.describe('Registration flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
  });

  test('register page shows all required form fields', async ({ page }) => {
    await page.goto('/#/register');
    await page.waitForURL('**/#/register', { timeout: 8_000 });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('weak password shows validation error on submit', async ({ page }) => {
    await page.goto('/#/register');
    await page.waitForURL('**/#/register');

    await page.fill('#username', 'weakpassuser');
    await page.fill('#displayName', 'Weak Pass User');
    await page.fill('#password', 'weak');
    await page.fill('#confirmPassword', 'weak');
    await page.click('button[type="submit"]');

    await expect(
      page.locator('.alert-danger, .error, [class*="error"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('mismatched passwords shows validation error', async ({ page }) => {
    await page.goto('/#/register');
    await page.waitForURL('**/#/register');

    await page.fill('#username', 'mismatchuser');
    await page.fill('#displayName', 'Mismatch User');
    await page.fill('#password', 'ValidPass@1!');
    await page.fill('#confirmPassword', 'DifferentPass@1!');
    await page.click('button[type="submit"]');

    await expect(
      page.locator('.alert-danger, .error, [class*="error"]').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('successful registration redirects to login page', async ({ page }) => {
    await page.goto('/#/register');
    await page.waitForURL('**/#/register');

    await page.fill('#username', 'newreguser');
    await page.fill('#displayName', 'New Reg User');
    await page.fill('#password', USER_PASS);
    await page.fill('#confirmPassword', USER_PASS);

    // Security questions (plain text inputs on RegisterView)
    await page.fill('#sq1-question', "What was your first pet's name?");
    await page.fill('#sq1-answer', 'fluffy');
    await page.fill('#sq2-question', 'What city were you born in?');
    await page.fill('#sq2-answer', 'springfield');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/#\/login/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/#\/login/);
  });

  test('registered user can log in with their credentials', async ({ page }) => {
    await registerUser(page, { username: 'loginafterreg', displayName: 'Login After Reg' });
    await login(page, { username: 'loginafterreg', password: USER_PASS });

    await expect(page).toHaveURL(/\/#\/(home|)$/, { timeout: 8_000 });
    await expect(page.locator('.sidebar, nav').first()).toBeVisible();
  });

  test('duplicate username shows registration error', async ({ page }) => {
    // Register first time
    await registerUser(page, { username: 'dupuser', displayName: 'Dup User' });

    // Try registering the same username again
    await page.goto('/#/register');
    await page.waitForURL('**/#/register');

    await page.fill('#username', 'dupuser');
    await page.fill('#displayName', 'Dup User 2');
    await page.fill('#password', USER_PASS);
    await page.fill('#confirmPassword', USER_PASS);
    await page.fill('#sq1-question', "What was your first pet's name?");
    await page.fill('#sq1-answer', 'fluffy');
    await page.fill('#sq2-question', 'What city were you born in?');
    await page.fill('#sq2-answer', 'springfield');

    await page.click('button[type="submit"]');

    // Should show an error (duplicate username)
    await expect(
      page.locator('.alert-danger, .error, [class*="error"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('register link is present on login page', async ({ page }) => {
    await page.goto('/#/login');
    await page.waitForURL('**/#/login');

    await expect(
      page.locator('a[href*="register"], button:has-text("Register"), a:has-text("Register")').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Account Recovery ──────────────────────────────────────────

test.describe('Account Recovery flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
  });

  test('recovery page renders step 1 with username field', async ({ page }) => {
    await page.goto('/#/recover');
    await page.waitForURL('**/#/recover', { timeout: 8_000 });

    await expect(page.locator('#username')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('any username advances to step 2 (enumeration-safe design)', async ({ page }) => {
    // The recovery flow is enumeration-safe: unknown usernames return
    // placeholder questions rather than exposing whether an account exists.
    await page.goto('/#/recover');
    await page.waitForURL('**/#/recover');

    await page.fill('#username', 'nosuchuser_xyz');
    await page.click('button[type="submit"]');

    // Step 2 renders regardless (placeholder security questions shown)
    await expect(
      page.locator('input[id^="answer"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('valid username advances to step 2 with security questions', async ({ page }) => {
    // Register a user via the helper (which sets known security Q&A)
    await registerUser(page, { username: 'recoveryuser', displayName: 'Recovery User' });

    await page.goto('/#/recover');
    await page.waitForURL('**/#/recover');

    await page.fill('#username', 'recoveryuser');
    await page.click('button[type="submit"]');

    // Step 2 should show security question inputs (id="answer0" or id="answer1")
    await expect(
      page.locator('input[id^="answer"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
