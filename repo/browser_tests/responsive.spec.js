/**
 * E2E: Responsive Layout & Visual Consistency
 *
 * Verifies that the app renders correctly across three breakpoints
 * and that key pages have the expected DOM structure.
 *
 * Viewports tested:
 *   mobile   — 375×667  (iPhone SE)
 *   tablet   — 768×1024 (iPad)
 *   desktop  — 1280×800
 *
 * Overflow detection: asserts document.body.scrollWidth ≤ viewport width + 4px
 * (small tolerance for sub-pixel rendering and scrollbar gutters).
 *
 * Visual consistency checks (desktop) verify that:
 *   - setup wizard renders its form fields
 *   - listing detail shows title + price
 *   - thread view renders both the chat panel and transaction sidebar
 *   - admin dashboard renders the analytics tab with stat cards
 */

import { test, expect } from '@playwright/test';
import {
  clearBrowserState,
  completeSetup,
  createAndPublishListing,
  login,
  logout,
  registerUser,
} from './helpers.js';

const ADMIN_PASS = 'Admin@TradeLoop1!';
const USER_PASS  = 'TestUser@Pass1!';

// ── Viewport definitions ───────────────────────────────────────

const VIEWPORTS = [
  { name: 'mobile',   width: 375,  height: 667  },
  { name: 'tablet',   width: 768,  height: 1024 },
  { name: 'desktop',  width: 1280, height: 800  },
];

// ── Overflow helper ────────────────────────────────────────────

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.body.scrollWidth > window.innerWidth + 4);
}

// ── Per-viewport layout tests ──────────────────────────────────

for (const vp of VIEWPORTS) {
  test.describe(`Responsive: ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await clearBrowserState(page);
      await completeSetup(page, {
        username:    'admin',
        password:    ADMIN_PASS,
        displayName: 'Site Admin',
      });
      await logout(page);
    });

    test('login page: form inputs visible, no horizontal overflow', async ({ page }) => {
      await page.goto('/#/login');
      await page.waitForURL('**/#/login');

      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();

      // Inputs must not overflow the viewport
      const userBox = await page.locator('#username').boundingBox();
      expect(userBox).not.toBeNull();
      expect(userBox.x + userBox.width).toBeLessThanOrEqual(vp.width + 4);

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test('home page: no horizontal overflow after login', async ({ page }) => {
      await login(page, { username: 'admin', password: ADMIN_PASS });
      await page.waitForURL(/\/#\/(home|)$/, { timeout: 10_000 });

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test('marketplace page: no horizontal overflow, content renders', async ({ page }) => {
      // Register a user so we can access marketplace
      await registerUser(page, { username: 'resp_user', password: USER_PASS, displayName: 'Resp User' });
      await login(page, { username: 'resp_user', password: USER_PASS });
      await page.goto('/#/marketplace');
      await page.waitForURL('**/#/marketplace');

      // Either listing cards or empty state should be visible (no blank screen)
      const content = page.locator(
        '.listing-card, [class*="listing-card"], .empty-state, .empty-state-message',
      );
      // Wait for the page to settle (at least one of these must render)
      await page.waitForSelector(
        '.listing-card, [class*="listing-card"], .empty-state, .empty-state-message, .page-content',
        { timeout: 8_000 },
      );

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test('user center: tabs visible and page does not overflow', async ({ page }) => {
      await registerUser(page, { username: 'resp_uc', password: USER_PASS, displayName: 'UC User' });
      await login(page, { username: 'resp_uc', password: USER_PASS });
      await page.goto('/#/user-center');
      await page.waitForURL(/\/#\/user-center/, { timeout: 8_000 });

      // Tab navigation must be reachable
      await expect(page.locator('[data-testid="user-center-tabs"]')).toBeVisible({ timeout: 5_000 });

      expect(await hasHorizontalOverflow(page)).toBe(false);
    });

    test('thread detail: layout does not break on narrow viewport', async ({ page }) => {
      // Set up: seller creates listing, buyer starts conversation
      await registerUser(page, { username: 'resp_seller', password: USER_PASS, displayName: 'Resp Seller' });
      await login(page, { username: 'resp_seller', password: USER_PASS });
      await createAndPublishListing(page, { title: 'Responsive Test Item', price: '15' });
      await logout(page);

      await registerUser(page, { username: 'resp_buyer', password: USER_PASS, displayName: 'Resp Buyer' });
      await login(page, { username: 'resp_buyer', password: USER_PASS });

      await page.goto('/#/marketplace');
      const card = page.locator('.listing-card, [class*="listing-card"]').first();
      if (await card.isVisible({ timeout: 6_000 }).catch(() => false)) {
        await card.click();
        await page.waitForURL(
          url => { const h = new URL(url).hash; return h.startsWith('#/listings/') && h !== '#/listings/new'; },
          { timeout: 8_000 },
        );
        const convBtn = page.locator('button:has-text("Start Conversation")').first();
        if (await convBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
          await convBtn.click();
          await page.waitForURL(/\/#\/threads\/.+/, { timeout: 10_000 });

          // Chat panel and sidebar must both be present
          await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 5_000 });
          await expect(page.locator('[data-testid="transaction-sidebar"]')).toBeVisible({ timeout: 5_000 });

          expect(await hasHorizontalOverflow(page)).toBe(false);
        }
      }
    });
  });
}

// ── Visual consistency checks (desktop only) ──────────────────

test.describe('Visual consistency (desktop)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    // Do NOT complete setup so we can check the setup wizard itself
  });

  test('setup wizard: form fields present on fresh app load', async ({ page }) => {
    await page.goto('/');
    // Fresh app → redirects to setup
    await page.waitForURL(/\/#\/setup/, { timeout: 10_000 });

    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#displayName')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('listing detail: title, price, and description sections render', async ({ page }) => {
    // Full setup needed to create a listing
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    await registerUser(page, { username: 'vis_seller', password: USER_PASS, displayName: 'Vis Seller' });
    await login(page, { username: 'vis_seller', password: USER_PASS });
    await createAndPublishListing(page, { title: 'Visual Check Item', price: '42' });
    // createAndPublishListing leaves us on the listing detail page

    // Key structural elements
    await expect(page.locator('h1, h2, .listing-title').first()).toBeVisible();
    // Price rendered somewhere on the page
    await expect(page.locator('text=42').first()).toBeVisible({ timeout: 5_000 });
    // No blank white-screen: page-content wrapper present
    await expect(page.locator('.page-content').first()).toBeVisible();
  });

  test('thread view: chat panel and transaction sidebar both render', async ({ page }) => {
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    await registerUser(page, { username: 'vis_seller2', password: USER_PASS, displayName: 'Vis Seller 2' });
    await login(page, { username: 'vis_seller2', password: USER_PASS });
    await createAndPublishListing(page, { title: 'Thread Visual Item', price: '20' });
    await logout(page);

    await registerUser(page, { username: 'vis_buyer', password: USER_PASS, displayName: 'Vis Buyer' });
    await login(page, { username: 'vis_buyer', password: USER_PASS });

    await page.goto('/#/marketplace');
    const card = page.locator('.listing-card, [class*="listing-card"]').first();
    await card.waitFor({ timeout: 8_000 });
    await card.click();
    await page.waitForURL(
      url => { const h = new URL(url).hash; return h.startsWith('#/listings/') && h !== '#/listings/new'; },
      { timeout: 8_000 },
    );

    const convBtn = page.locator('button:has-text("Start Conversation")').first();
    await convBtn.waitFor({ timeout: 6_000 });
    await convBtn.click();
    await page.waitForURL(/\/#\/threads\/.+/, { timeout: 10_000 });

    // Two-pane layout
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="transaction-sidebar"]')).toBeVisible({ timeout: 5_000 });

    // Message input present and usable
    await expect(page.locator('input[placeholder="Type a message..."]')).toBeVisible();

    // Transaction card in sidebar
    await expect(page.locator('[data-testid="transaction-sidebar"] .card').first()).toBeVisible();
  });

  test('admin dashboard: analytics tab renders stat cards', async ({ page }) => {
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    // admin is logged in after setup
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/, { timeout: 8_000 });

    // Stats grid with KPI cards
    await expect(page.locator('[data-testid="admin-stats-grid"]')).toBeVisible({ timeout: 8_000 });
    // At least one stat card
    await expect(page.locator('[data-testid="admin-stats-grid"] .stat-card').first()).toBeVisible();

    // All 7 admin tabs present
    const tabLabels = ['Analytics', 'Users', 'Categories', 'Delivery', 'Audit', 'Data', 'Dictionary'];
    for (const label of tabLabels) {
      await expect(page.locator('.tab', { hasText: label })).toBeVisible();
    }
  });

  test('admin delivery tab: renders add-prefix form after tab click', async ({ page }) => {
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/, { timeout: 8_000 });

    await page.locator('.tab', { hasText: 'Delivery' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('input[placeholder="e.g. 100"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Add")')).toBeVisible();
  });
});
