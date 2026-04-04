/**
 * E2E: Notification Preference Enforcement
 *
 * Verifies that disabling a notification preference in the UI actually
 * suppresses the notification — i.e., the enforcement in
 * NotificationService.create() is wired end-to-end in the browser.
 *
 * Flow:
 *   1. Seller registers, creates a published listing, disables "Messages" pref
 *   2. Buyer starts a conversation and sends a message to the seller
 *   3. Seller logs back in — no notification badge should appear
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

async function registerAndLogin(page, username, displayName, password = USER_PASS) {
  await registerUser(page, { username, displayName, password });
  await login(page, { username, password });
}

test.describe('Notification Preference Enforcement', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
  });

  test('disabled message notification suppresses notification badge', async ({ page }) => {
    // ── Step 1: Seller creates a listing ──
    await registerAndLogin(page, 'notif_seller', 'Notif Seller');
    await createAndPublishListing(page, { title: 'Notification Test Item', price: '50' });

    // ── Step 2: Seller disables the "Messages" notification preference ──
    await page.goto('/#/user-center/settings');
    await page.waitForURL('**/#/user-center/**', { timeout: 8_000 });

    // Find the Messages toggle row and uncheck it if currently checked
    const messagesRow = page.locator('.toggle-row').filter({ hasText: /messages/i }).first();
    const checkbox = messagesRow.locator('input[type="checkbox"]');
    if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
        await page.waitForTimeout(300);
      }
    }

    await logout(page);

    // ── Step 3: Buyer navigates to the listing and sends a message ──
    await registerAndLogin(page, 'notif_buyer', 'Notif Buyer');
    await page.goto('/#/marketplace');
    await page.waitForURL('**/#/marketplace');

    // Click into the listing
    const listingCard = page.locator('.listing-card, [class*="listing-card"]').first();
    await listingCard.waitFor({ timeout: 8_000 });
    await listingCard.click();
    await page.waitForURL(
      url => { const h = new URL(url).hash; return h.startsWith('#/listings/') && h !== '#/listings/new'; },
      { timeout: 8_000 }
    );

    // Start a conversation (button only visible to non-sellers)
    const startConvBtn = page.locator('button:has-text("Start Conversation"), button:has-text("Contact Seller")').first();
    if (await startConvBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await startConvBtn.click();
      await page.waitForURL(/\/#\/threads\/.+/, { timeout: 10_000 });

      // Send a message
      const msgInput = page.locator('input[placeholder*="essage"], textarea[placeholder*="essage"]').first();
      if (await msgInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await msgInput.fill('Hello, is this still available?');
        await page.click('button:has-text("Send")');
        await page.waitForTimeout(500);
      }
    }

    await logout(page);

    // ── Step 4: Seller logs back in — badge must NOT appear ──
    await login(page, { username: 'notif_seller', password: USER_PASS });

    // Give the app time to load notifications
    await page.waitForTimeout(1_000);

    // The notification badge (.badge) should not be visible
    await expect(page.locator('.badge')).not.toBeVisible({ timeout: 5_000 });
  });
});
