/**
 * E2E: Authentication & Session Isolation
 *
 * Tests real browser auth flows:
 *   1. Login with valid credentials → home page
 *   2. Login with wrong password → error shown
 *   3. Logout clears session → redirects to login
 *   4. Session isolation: User A logs out, User B logs in — no stale data
 *   5. Unauthenticated access to protected routes → redirect to login
 *   6. Role-based access: regular user cannot reach /admin or /moderation
 *   7. Route guard: authenticated user navigating to /login → redirect to home
 *   8. Browser refresh preserves login session (localStorage persistence)
 *   9. Session displayed username matches logged-in user
 */

import { test, expect } from '@playwright/test';
import { clearBrowserState, completeSetup, login, logout, registerUser } from './helpers.js';

// Shared setup: each test gets a pre-initialized system
test.describe('Authentication & Session Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, {
      username: 'admin',
      password: 'Admin@TradeLoop1!',
      displayName: 'Site Admin',
    });
    // After setup admin is logged in — log them out for clean test state
    await logout(page);
  });

  test('valid login redirects to home', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await expect(page).toHaveURL(/\/#\/(home|)$/, { timeout: 8_000 });
    await expect(page.locator('.sidebar, nav').first()).toBeVisible();
  });

  test('wrong password shows authentication error', async ({ page }) => {
    await page.goto('/#/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'WrongPassword@1!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.alert-danger, .error, [class*="error"]').first())
      .toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/#\/login/);
  });

  test('non-existent username shows authentication error', async ({ page }) => {
    await page.goto('/#/login');
    await page.fill('#username', 'ghost-user-xyz');
    await page.fill('#password', 'Admin@TradeLoop1!');
    await page.click('button[type="submit"]');

    await expect(page.locator('.alert-danger, .error, [class*="error"]').first())
      .toBeVisible({ timeout: 5_000 });
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await logout(page);

    await expect(page).toHaveURL(/\/#\/login/);

    // Verify localStorage session is cleared
    const session = await page.evaluate(() => {
      return localStorage.getItem('tradeloop_session');
    });
    expect(session).toBeNull();
  });

  test('after logout, protected route redirects to login', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await logout(page);

    await page.goto('/#/');
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });
  });

  test('session persists across browser reload (localStorage)', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await expect(page).toHaveURL(/\/#\/(home|)$/);

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });

    // Should still be authenticated (not redirected to login)
    await expect(page).not.toHaveURL(/\/#\/login/);
    await expect(page.locator('.sidebar, nav').first()).toBeVisible();
  });

  test('topbar shows correct username after login', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });

    // Username should appear somewhere in the topbar
    await expect(
      page.locator('.topbar, header').first()
    ).toContainText(/Site Admin|admin/i);
  });

  test('unauthenticated direct navigation to marketplace → login redirect', async ({ page }) => {
    await page.goto('/#/marketplace');
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });
  });

  test('unauthenticated direct navigation to user-center → login redirect', async ({ page }) => {
    await page.goto('/#/user-center');
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });
  });

  test('regular user cannot access /admin (role guard)', async ({ page }) => {
    await registerUser(page, { username: 'regularuser', displayName: 'Regular User' });
    await login(page, { username: 'regularuser', password: 'TestUser@Pass1!' });

    // Try to access admin
    await page.goto('/#/admin');
    // Should be redirected away (to home or login)
    await expect(page).not.toHaveURL(/\/#\/admin/, { timeout: 8_000 });
  });

  test('regular user cannot access /moderation (role guard)', async ({ page }) => {
    await registerUser(page, { username: 'normaluser2', displayName: 'Normal User' });
    await login(page, { username: 'normaluser2', password: 'TestUser@Pass1!' });
    await page.goto('/#/moderation');
    await expect(page).not.toHaveURL(/\/#\/moderation/, { timeout: 8_000 });
  });

  test('session isolation: User A data not visible in User B sidebar', async ({ page }) => {
    // Register two users with distinct display names
    await registerUser(page, { username: 'userabc', displayName: 'Alice User' });
    await registerUser(page, { username: 'userxyz', displayName: 'Bob User' });

    // Login as Alice
    await login(page, { username: 'userabc', password: 'TestUser@Pass1!' });
    await expect(page.locator('.topbar, header').first()).toContainText(/Alice User|userabc/i);

    // Logout Alice
    await logout(page);

    // Login as Bob
    await login(page, { username: 'userxyz', password: 'TestUser@Pass1!' });

    // Topbar should show Bob, NOT Alice
    await expect(page.locator('.topbar, header').first()).toContainText(/Bob User|userxyz/i);
    await expect(page.locator('.topbar, header').first()).not.toContainText(/Alice User|userabc/i);
  });

  test('authenticated user navigating to /login is redirected to home', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await page.goto('/#/login');
    await expect(page).not.toHaveURL(/\/#\/login/, { timeout: 8_000 });
  });

  test('expired session (stale lastActivityAt) redirects to login and clears storage', async ({ page }) => {
    await login(page, { username: 'admin', password: 'Admin@TradeLoop1!' });
    await expect(page).toHaveURL(/\/#\/(home|)$/, { timeout: 8_000 });

    // Expire the session by back-dating lastActivityAt beyond the idle timeout (30 min)
    await page.evaluate(() => {
      const raw = localStorage.getItem('tradeloop_session');
      if (!raw) return;
      try {
        const s = JSON.parse(raw);
        s.lastActivityAt = Date.now() - (31 * 60 * 1000); // 31 minutes ago
        localStorage.setItem('tradeloop_session', JSON.stringify(s));
      } catch { /* ignore */ }
    });

    // Navigate to a protected route — the router guard must detect the expired session
    await page.goto('/#/marketplace');

    // Should redirect to login
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });

    // Session key must be cleared (no stale data left in storage)
    const session = await page.evaluate(() => localStorage.getItem('tradeloop_session'));
    expect(session).toBeNull();
  });
});

// ── Cross-Tab Logout ──────────────────────────────────────────────────────────
//
// BroadcastChannel only fires in OTHER tabs (not the sender), so we open two
// pages within the same browser context (shared localStorage + BroadcastChannel).

test.describe('Cross-Tab Logout', () => {
  const ADMIN_PASS = 'Admin@TradeLoop1!';

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, {
      username:    'admin',
      password:    ADMIN_PASS,
      displayName: 'Site Admin',
    });
    // After setup admin is logged in — leave session in localStorage for tab B to pick up
    // (do NOT logout here — we need both tabs to start authenticated)
  });

  test('cross-tab logout clears UI and redirects to login', async ({ page, context }) => {
    // page = Tab A, already logged in after setup

    // ── Tab B: open in the same context → restores session from shared localStorage ──
    const pageB = await context.newPage();
    await pageB.goto('/');
    await pageB.waitForURL(/\/#\/(home|)$/, { timeout: 10_000 });

    // Verify Tab B has the protected shell (sidebar/nav visible)
    await expect(pageB.locator('.sidebar, [class*="sidebar"]').first())
      .toBeVisible({ timeout: 5_000 });

    // ── Tab A: logout ──
    await page.click('button:has-text("Logout")');
    await page.waitForURL(/\/#\/login/, { timeout: 8_000 });

    // ── Tab B: cross-tab LOGOUT broadcast must redirect to /login ──
    await expect(pageB).toHaveURL(/\/#\/login/, { timeout: 8_000 });

    // Protected shell must NOT remain visible after cross-tab logout
    await expect(pageB.locator('.sidebar, [class*="sidebar"]').first())
      .not.toBeVisible({ timeout: 3_000 });

    // No stale session in storage
    const storedSession = await pageB.evaluate(() => localStorage.getItem('tradeloop_session'));
    expect(storedSession).toBeNull();

    await pageB.close();
  });
});

// ── Security: Session Integrity ───────────────────────────────────────────────

test.describe('Security: Session Integrity', () => {
  const ADMIN_PASS = 'Admin@TradeLoop1!';

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, {
      username:    'admin',
      password:    ADMIN_PASS,
      displayName: 'Site Admin',
    });
    await logout(page);
  });

  test('tampered session (invalid structure) causes fail-closed logout', async ({ page }) => {
    await login(page, { username: 'admin', password: ADMIN_PASS });
    await page.waitForURL(/\/#\/(home|)$/, { timeout: 8_000 });

    // Replace the session with a structurally invalid object (missing required fields)
    await page.evaluate(() => {
      localStorage.setItem('tradeloop_session', JSON.stringify({
        tampered: true,
        userId: 'fake-user',
        // no createdAt, no lastActivityAt, no roles
      }));
    });

    // Navigate to a protected route — router guard must detect the broken session
    await page.goto('/#/marketplace');
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });

    // Storage must be cleared (fail-closed: no stale session left)
    const session = await page.evaluate(() => localStorage.getItem('tradeloop_session'));
    expect(session).toBeNull();
  });

  test('expired session on page reload redirects to login', async ({ page }) => {
    await login(page, { username: 'admin', password: ADMIN_PASS });
    await page.waitForURL(/\/#\/(home|)$/, { timeout: 8_000 });

    // Back-date createdAt past the 12-hour absolute timeout
    await page.evaluate(() => {
      const raw = localStorage.getItem('tradeloop_session');
      if (!raw) return;
      const s = JSON.parse(raw);
      s.createdAt = Date.now() - (13 * 60 * 60 * 1000); // 13 h ago
      localStorage.setItem('tradeloop_session', JSON.stringify(s));
    });

    // Full page reload — app reboots, session is validated on first navigation
    await page.reload({ waitUntil: 'load' });

    // Must redirect to login, not stay on home
    await expect(page).toHaveURL(/\/#\/login/, { timeout: 8_000 });

    // Session key must be purged
    const session = await page.evaluate(() => localStorage.getItem('tradeloop_session'));
    expect(session).toBeNull();
  });
});
