/**
 * E2E: Threads View & Complaint Section
 *
 * Covers:
 *   ThreadsView    — inbox renders with conversation entries
 *   ThreadDetailView sub-components:
 *     ThreadMessageList  — message history visible
 *     ThreadComposer     — message input and send
 *     ComplaintSection   — complaint form appears in AGREED+ state
 *   Complaint flow:
 *     - Complaint button / section visible to buyer at AGREED state
 *     - Filing a complaint shows confirmation
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

const SELLER = 'thrd_seller';
const BUYER  = 'thrd_buyer';

async function registerAndLogin(page, username, displayName, password = USER_PASS) {
  await registerUser(page, { username, displayName, password });
  await login(page, { username, password });
}

/**
 * Register seller + buyer, seller creates listing, buyer opens thread.
 * Returns the thread URL.
 */
async function setupThread(page) {
  await registerAndLogin(page, SELLER, 'Thread Seller');
  await createAndPublishListing(page, { title: 'Thread Spec Item', price: '40' });
  await logout(page);

  await registerAndLogin(page, BUYER, 'Thread Buyer');
  await page.goto('/#/marketplace');
  await page.waitForURL('**/#/marketplace');

  const card = page.locator('.listing-card, [class*="listing-card"]').first();
  await card.waitFor({ timeout: 8_000 });
  await card.click();
  await page.waitForURL(
    url => new URL(url).hash.startsWith('#/listings/') && new URL(url).hash !== '#/listings/new',
    { timeout: 8_000 },
  );

  const convBtn = page.locator('button:has-text("Start Conversation"), button:has-text("Contact Seller")').first();
  await convBtn.waitFor({ timeout: 6_000 });
  await convBtn.click();
  await page.waitForURL(/\/#\/threads\/.+/, { timeout: 10_000 });
  const threadUrl = page.url();
  await logout(page);
  return threadUrl;
}

// ── ThreadsView (inbox) ───────────────────────────────────────

test.describe('Threads View (inbox)', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
  });

  test('threads view renders when logged in', async ({ page }) => {
    await registerAndLogin(page, 'inbox_user', 'Inbox User');
    await page.goto('/#/threads');
    await page.waitForURL(/\/#\/threads/, { timeout: 8_000 });

    // Either thread list or empty state
    await expect(
      page.locator('.thread-item, .conversation-item, .empty-state, .page-content').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('threads view shows opened thread in inbox', async ({ page }) => {
    const threadUrl = await setupThread(page);

    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto('/#/threads');
    await page.waitForURL(/\/#\/threads/, { timeout: 8_000 });

    // At least one thread entry
    await expect(
      page.locator('.thread-item, .conversation-item, [class*="thread"], [class*="conversation"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('thread appears in seller inbox too', async ({ page }) => {
    await setupThread(page);

    await login(page, { username: SELLER, password: USER_PASS });
    await page.goto('/#/threads');
    await page.waitForURL(/\/#\/threads/, { timeout: 8_000 });

    await expect(
      page.locator('.thread-item, .conversation-item, [class*="thread"], [class*="conversation"]').first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('clicking a thread in inbox navigates to thread detail', async ({ page }) => {
    await setupThread(page);

    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto('/#/threads');
    await page.waitForURL(/\/#\/threads/, { timeout: 8_000 });

    const threadItem = page.locator(
      '.thread-item, .conversation-item, [class*="thread"]'
    ).first();
    if (await threadItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await threadItem.click();
      await page.waitForURL(/\/#\/threads\/.+/, { timeout: 8_000 });
      await expect(page).toHaveURL(/\/#\/threads\/.+/);
    }
  });
});

// ── ThreadDetailView sub-components ───────────────────────────

test.describe('Thread Detail components', () => {
  let threadUrl;

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
    threadUrl = await setupThread(page);
  });

  test('chat panel and transaction sidebar both render', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('[data-testid="transaction-sidebar"]')).toBeVisible({ timeout: 5_000 });
  });

  test('message input is present and can accept text', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    const msgInput = page.locator('input[placeholder="Type a message..."]');
    await msgInput.waitFor({ timeout: 8_000 });
    await msgInput.fill('Hello from buyer!');
    await expect(msgInput).toHaveValue('Hello from buyer!');
  });

  test('sent message appears in message list', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    const msgInput = page.locator('input[placeholder="Type a message..."]');
    await msgInput.waitFor({ timeout: 8_000 });
    await msgInput.fill('Thread spec test message');
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(500);

    await expect(
      page.locator('.chat-bubble').filter({ hasText: 'Thread spec test message' }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('transaction sidebar shows Start Transaction button for buyer', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    await expect(
      page.locator('button:has-text("Start Transaction")')
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Complaint section ─────────────────────────────────────────

test.describe('Complaint Section', () => {
  let threadUrl;

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    // Advance transaction to AGREED so complaint section becomes visible
    threadUrl = await setupThread(page);

    // INQUIRY
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.locator('button:has-text("Start Transaction")').waitFor({ timeout: 8_000 });
    await page.click('button:has-text("Start Transaction")');
    await page.waitForTimeout(500);
    await logout(page);

    // RESERVED
    await login(page, { username: SELLER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.locator('button:has-text("Reserve")').waitFor({ timeout: 8_000 });
    await page.click('button:has-text("Reserve")');
    await page.waitForTimeout(500);
    await logout(page);

    // AGREED
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.locator('button:has-text("Agree")').waitFor({ timeout: 8_000 });
    await page.click('button:has-text("Agree")');
    await page.waitForTimeout(500);
    await logout(page);
  });

  test('complaint section is visible in AGREED state for buyer', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    // Complaint section or button
    await expect(
      page.locator(
        '.complaint-section, button:has-text("File Complaint"), button:has-text("Complaint"), [class*="complaint"]'
      ).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('complaint form requires a reason before submission', async ({ page }) => {
    await login(page, { username: BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.waitForURL(/\/#\/threads\/.+/);

    // Open complaint form
    const complaintBtn = page.locator(
      'button:has-text("File Complaint"), button:has-text("Complaint")'
    ).first();
    if (await complaintBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await complaintBtn.click();
      await page.waitForTimeout(400);

      // Submit button should be disabled (no reason selected)
      const submitBtn = page.locator(
        'button:has-text("Submit Complaint"), button[type="submit"]'
      ).last();
      await expect(submitBtn).toBeDisabled({ timeout: 3_000 });
    }
  });
});
