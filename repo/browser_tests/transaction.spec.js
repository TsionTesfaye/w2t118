/**
 * E2E: Transaction Lifecycle & Delivery Booking
 *
 * Covers the full buyer/seller interaction flow from conversation
 * creation through every transaction state transition, cancellation
 * validation, and delivery booking.
 *
 * Flow overview:
 *   seller registers → creates delivery-enabled listing
 *   buyer registers → opens thread via "Start Conversation"
 *   buyer → Start Transaction (INQUIRY)
 *   seller → Reserve (RESERVED)
 *   buyer  → Agree   (AGREED)
 *   buyer  → Complete (COMPLETED)  — or cancel with required reason
 *
 * Delivery tests additionally verify:
 *   - uncovered ZIP is rejected
 *   - covered ZIP is accepted (prefix "123" added by admin in beforeEach)
 *   - time-slot selection + Book Delivery succeeds
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

const TX_SELLER = 'tx_seller';
const TX_BUYER  = 'tx_buyer';

// ── Local helpers ──────────────────────────────────────────────

async function registerAndLogin(page, username, displayName, password = USER_PASS) {
  await registerUser(page, { username, displayName, password });
  await login(page, { username, password });
}

/**
 * Register seller, create a delivery-enabled listing; register buyer,
 * open the listing detail and click "Start Conversation".
 * Returns the thread URL so tests can navigate back to it.
 */
async function setupListingAndThread(page) {
  // Seller: create listing with delivery enabled
  await registerAndLogin(page, TX_SELLER, 'TX Seller');
  await createAndPublishListing(page, {
    title:    'Transaction Lifecycle Item',
    price:    '50',
    delivery: true,
  });
  await logout(page);

  // Buyer: find listing and start a conversation
  await registerAndLogin(page, TX_BUYER, 'TX Buyer');
  await page.goto('/#/marketplace');
  await page.waitForURL('**/#/marketplace');

  const listingCard = page.locator('.listing-card, [class*="listing-card"]').first();
  await listingCard.waitFor({ timeout: 8_000 });
  await listingCard.click();
  await page.waitForURL(
    url => { const h = new URL(url).hash; return h.startsWith('#/listings/') && h !== '#/listings/new'; },
    { timeout: 8_000 },
  );

  const startConvBtn = page.locator('button:has-text("Start Conversation")').first();
  await startConvBtn.waitFor({ timeout: 6_000 });
  await startConvBtn.click();
  await page.waitForURL(/\/#\/threads\/.+/, { timeout: 10_000 });

  const threadUrl = page.url();
  await logout(page);
  return threadUrl;
}

/**
 * Advance transaction from no-tx to RESERVED.
 * Leaves the seller logged in on the thread page.
 */
async function advanceToReserved(page, threadUrl) {
  // Buyer starts transaction
  await login(page, { username: TX_BUYER, password: USER_PASS });
  await page.goto(threadUrl);
  const startTxBtn = page.locator('button:has-text("Start Transaction")');
  await startTxBtn.waitFor({ timeout: 8_000 });
  await startTxBtn.click();
  await page.waitForTimeout(500);
  await logout(page);

  // Seller reserves
  await login(page, { username: TX_SELLER, password: USER_PASS });
  await page.goto(threadUrl);
  const reserveBtn = page.locator('button:has-text("Reserve")');
  await reserveBtn.waitFor({ timeout: 8_000 });
  await reserveBtn.click();
  await page.waitForTimeout(500);
}

/**
 * Advance transaction to AGREED.
 * Leaves the buyer logged in on the thread page.
 */
async function advanceToAgreed(page, threadUrl) {
  await advanceToReserved(page, threadUrl);
  await logout(page);

  // Buyer agrees
  await login(page, { username: TX_BUYER, password: USER_PASS });
  await page.goto(threadUrl);
  const agreeBtn = page.locator('button:has-text("Agree")');
  await agreeBtn.waitFor({ timeout: 8_000 });
  await agreeBtn.click();
  await page.waitForTimeout(500);
}

// ── Test suite ─────────────────────────────────────────────────

test.describe('Transaction Lifecycle & Delivery', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, {
      username:    'admin',
      password:    ADMIN_PASS,
      displayName: 'Site Admin',
    });

    // Admin: add ZIP coverage prefix "123" so ZIP "12345" is covered
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/, { timeout: 8_000 });
    await page.locator('.tab', { hasText: 'Delivery' }).click();
    await page.waitForTimeout(400);
    await page.fill('input[placeholder="e.g. 100"]', '123');
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(400);

    await logout(page);
  });

  // ── 1. Full lifecycle ────────────────────────────────────────

  test('buyer starts transaction visible only to buyer, seller sees Reserve', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);

    // Buyer: "Start Transaction" button visible
    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await expect(page.locator('button:has-text("Start Transaction")')).toBeVisible({ timeout: 8_000 });

    // Buyer starts the transaction
    await page.click('button:has-text("Start Transaction")');
    await page.waitForTimeout(500);

    // Reserve button is NOT visible to buyer
    await expect(page.locator('button:has-text("Reserve")')).not.toBeVisible();
    await logout(page);

    // Seller: Reserve button visible, Start Transaction is NOT
    await login(page, { username: TX_SELLER, password: USER_PASS });
    await page.goto(threadUrl);
    await expect(page.locator('button:has-text("Reserve")')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('button:has-text("Start Transaction")')).not.toBeVisible();
  });

  test('INQUIRY → RESERVED → AGREED → COMPLETED full lifecycle', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);

    // ── INQUIRY ──
    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.click('button:has-text("Start Transaction")');
    await page.waitForTimeout(500);
    await logout(page);

    // ── RESERVED ──
    await login(page, { username: TX_SELLER, password: USER_PASS });
    await page.goto(threadUrl);
    const reserveBtn = page.locator('button:has-text("Reserve")');
    await reserveBtn.waitFor({ timeout: 8_000 });
    await reserveBtn.click();
    await page.waitForTimeout(500);
    // Reservation countdown should appear
    await expect(page.locator('.timer')).toBeVisible({ timeout: 5_000 });
    await logout(page);

    // ── AGREED ──
    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    const agreeBtn = page.locator('button:has-text("Agree")');
    await agreeBtn.waitFor({ timeout: 8_000 });
    await agreeBtn.click();
    await page.waitForTimeout(500);
    // Complete button now visible (buyer only)
    await expect(page.locator('button:has-text("Complete")')).toBeVisible({ timeout: 5_000 });

    // ── COMPLETED ──
    await page.click('button:has-text("Complete")');
    await page.waitForTimeout(500);

    // Terminal state message appears
    await expect(
      page.locator('.alert-info').filter({ hasText: /COMPLETED/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Thread is now read-only
    await expect(
      page.locator('.alert-warning').filter({ hasText: /read.only/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 2. Cancellation ─────────────────────────────────────────

  test('cancel modal requires reason before submission', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);
    await advanceToAgreed(page, threadUrl);
    // buyer is now logged in at threadUrl

    // Open cancel modal
    await page.click('button.btn-danger:has-text("Cancel")');
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5_000 });

    // "Cancel Transaction" button disabled with no reason selected
    const cancelTxBtn = page.locator('button:has-text("Cancel Transaction")');
    await expect(cancelTxBtn).toBeDisabled();

    // Select a reason
    await page.locator('.modal-overlay select, .modal-overlay .form-select').selectOption({ index: 1 });
    await expect(cancelTxBtn).toBeEnabled();
  });

  test('cancel with reason shows CANCELED state and reason in UI', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);
    await advanceToAgreed(page, threadUrl);

    await page.click('button.btn-danger:has-text("Cancel")');
    await page.locator('.modal-overlay select, .modal-overlay .form-select').selectOption({ index: 1 });
    await page.click('button:has-text("Cancel Transaction")');
    await page.waitForTimeout(500);

    // Terminal state message shows CANCELED + reason
    await expect(
      page.locator('.alert-info').filter({ hasText: /CANCELED/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Reason text is present
    await expect(
      page.locator('.alert-info').filter({ hasText: /Reason:/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 3. Delivery ──────────────────────────────────────────────

  test('delivery section visible in RESERVED state for delivery-enabled listing', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);
    await advanceToReserved(page, threadUrl);
    await logout(page);

    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);

    await expect(page.locator('.delivery-section')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('input[placeholder="12345"]')).toBeVisible();
    await expect(page.locator('button:has-text("Check Coverage")')).toBeVisible();
  });

  test('delivery: uncovered ZIP shows rejection message', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);
    await advanceToReserved(page, threadUrl);
    await logout(page);

    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.locator('[data-testid="chat-panel"]').waitFor({ timeout: 8_000 });
    await page.locator('.delivery-section').waitFor({ timeout: 8_000 });

    await page.fill('input[placeholder="12345"]', '99999');
    // Button enabled once 5-digit ZIP entered
    const checkBtn = page.locator('button:has-text("Check Coverage")');
    await checkBtn.waitFor({ state: 'visible' });
    await checkBtn.click();
    await expect(
      page.locator('text=ZIP code is not in the service area.'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('delivery: covered ZIP accepted, window selected, booking confirmed', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);
    await advanceToReserved(page, threadUrl);
    await logout(page);

    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    await page.locator('.delivery-section').waitFor({ timeout: 8_000 });

    // Enter a ZIP covered by prefix "123"
    await page.fill('input[placeholder="12345"]', '12345');
    await page.click('button:has-text("Check Coverage")');
    await expect(
      page.locator('text=ZIP code is covered.'),
    ).toBeVisible({ timeout: 5_000 });

    // Pick a delivery date (tomorrow to guarantee available windows)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    await page.fill('input[type="date"]', dateStr);
    // Trigger change to fetch windows
    await page.locator('input[type="date"]').dispatchEvent('change');

    // Windows should appear
    const windowSlot = page.locator('.window-slot').filter({ hasText: /available/ }).first();
    await windowSlot.waitFor({ timeout: 8_000 });
    await windowSlot.click();

    // Book Delivery button should now be visible (ZIP covered + window selected)
    const bookBtn = page.locator('button:has-text("Book Delivery")');
    await bookBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await bookBtn.click();
    await page.waitForTimeout(500);

    // Button disappears after successful booking (selectedWindow reset to null)
    await expect(bookBtn).not.toBeVisible({ timeout: 3_000 });
  });

  // ── 4. Messaging in thread ───────────────────────────────────

  test('buyer and seller can exchange messages in thread', async ({ page }) => {
    const threadUrl = await setupListingAndThread(page);

    // Buyer sends a message
    await login(page, { username: TX_BUYER, password: USER_PASS });
    await page.goto(threadUrl);
    const msgInput = page.locator('input[placeholder="Type a message..."]');
    await msgInput.waitFor({ timeout: 8_000 });
    await msgInput.fill('Is this still available?');
    await page.click('button:has-text("Send")');
    await page.waitForTimeout(500);

    // Message appears in chat
    await expect(page.locator('.chat-bubble').filter({ hasText: 'Is this still available?' })).toBeVisible({ timeout: 5_000 });
    await logout(page);

    // Seller sees the message
    await login(page, { username: TX_SELLER, password: USER_PASS });
    await page.goto(threadUrl);
    await expect(page.locator('.chat-bubble').filter({ hasText: 'Is this still available?' })).toBeVisible({ timeout: 8_000 });

    // Seller replies
    await page.fill('input[placeholder="Type a message..."]', 'Yes, still available!');
    await page.click('button:has-text("Send")');
    await expect(page.locator('.chat-bubble').filter({ hasText: 'Yes, still available!' })).toBeVisible({ timeout: 5_000 });
  });
});
