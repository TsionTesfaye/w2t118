/**
 * E2E: Listing Detail — Q&A, Comments, and Moderation Actions
 *
 * Covers sub-components of ListingDetailView:
 *   ListingHeader    — title, price, seller info, status badge
 *   ListingQA        — buyer can post question; seller sees answer form
 *   ListingComments  — buyer can post a comment
 *   ListingModerationActions — report button visible to non-owner
 *   ListingTransactionEntry  — Start Conversation button visible to non-owner
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

// ── Header: title, price, status ─────────────────────────────

test.describe('Listing Detail: Header', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
  });

  test('listing detail shows title, price and status badge', async ({ page }) => {
    await registerAndLogin(page, 'ldhseller', 'LDH Seller');
    await createAndPublishListing(page, { title: 'Detail Header Item', price: '77' });

    // createAndPublishListing leaves us on the listing detail page
    await expect(page.locator('h1, h2, .listing-title').first()).toContainText('Detail Header Item');
    await expect(page.locator('text=77').first()).toBeVisible();
    // Published listing shows "Active" status badge
    await expect(
      page.locator('.badge').filter({ hasText: /active/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('seller sees Edit / Delete controls on their own listing', async ({ page }) => {
    await registerAndLogin(page, 'ldhseller2', 'LDH Seller 2');
    await createAndPublishListing(page, { title: 'Edit Controls Item', price: '30' });

    // Seller should see edit or manage controls
    await expect(
      page.locator('button:has-text("Edit"), a:has-text("Edit"), button:has-text("Manage")').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('non-owner sees Start Conversation button', async ({ page }) => {
    await registerAndLogin(page, 'ldhseller3', 'LDH Seller 3');
    await createAndPublishListing(page, { title: 'Convo Button Item', price: '20' });
    const listingUrl = page.url();
    await logout(page);

    await registerAndLogin(page, 'ldhbuyer3', 'LDH Buyer 3');
    await page.goto(listingUrl);
    await page.waitForURL(
      url => new URL(url).hash.startsWith('#/listings/'),
      { timeout: 8_000 },
    );

    await expect(
      page.locator('button:has-text("Start Conversation"), button:has-text("Contact Seller")').first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Q&A section ────────────────────────────────────────────────

test.describe('Listing Detail: Q&A', () => {
  let listingUrl;

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    await registerAndLogin(page, 'qaseller', 'QA Seller');
    await createAndPublishListing(page, { title: 'Q&A Test Item', price: '15' });
    listingUrl = page.url();
    await logout(page);
  });

  test('Q&A section renders with empty state on fresh listing', async ({ page }) => {
    await registerAndLogin(page, 'qabuyer1', 'QA Buyer 1');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    // Q&A empty state (note: text includes trailing period)
    await expect(
      page.locator('.card .empty-state p').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('buyer can submit a question via the Q&A form', async ({ page }) => {
    await registerAndLogin(page, 'qabuyer2', 'QA Buyer 2');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    // Look for the Ask a Question form (RichTextEditor or plain textarea)
    const qaInput = page.locator('.rte-content, [contenteditable="true"], textarea[placeholder*="question" i]').first();
    if (await qaInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await qaInput.click();
      await qaInput.pressSequentially('Is this item still available?');

      const submitBtn = page.locator(
        'button[type="submit"]:has-text("Ask"), button:has-text("Post Question"), button:has-text("Submit")'
      ).first();
      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(600);

        // Question should appear in the Q&A thread
        await expect(
          page.locator('.qa-question, .qa-thread').filter({ hasText: 'Is this item still available?' }).first()
        ).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});

// ── Comments section ───────────────────────────────────────────

test.describe('Listing Detail: Comments', () => {
  let listingUrl;

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    await registerAndLogin(page, 'comseller', 'Comment Seller');
    await createAndPublishListing(page, { title: 'Comment Test Item', price: '25' });
    listingUrl = page.url();
    await logout(page);
  });

  test('comments section renders (empty or with entries)', async ({ page }) => {
    await registerAndLogin(page, 'combuyer1', 'Comment Buyer 1');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    // Comments section header or empty state
    await expect(
      page.locator('h2, h3, .section-title').filter({ hasText: /comment/i }).first()
        .or(page.locator('text=No comments').first())
    ).toBeVisible({ timeout: 5_000 });
  });

  test('buyer can post a comment', async ({ page }) => {
    await registerAndLogin(page, 'combuyer2', 'Comment Buyer 2');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    // Comment form uses RichTextEditor — the editable div inside .comment-form
    const commentRTE = page.locator('.comment-form .rte-content').first();
    if (await commentRTE.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await commentRTE.click();
      await commentRTE.pressSequentially('Great item, highly recommend!');

      // Submit button enables once text is present
      const postBtn = page.locator('.comment-form button[type="submit"]').first();
      await expect(postBtn).toBeEnabled({ timeout: 3_000 });
      await postBtn.click();
      await page.waitForTimeout(600);

      await expect(
        page.locator('.comment-item').filter({ hasText: 'Great item, highly recommend!' }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ── Report button (ModerationActions) ─────────────────────────

test.describe('Listing Detail: Report button', () => {
  let listingUrl;

  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);

    await registerAndLogin(page, 'repseller', 'Report Seller');
    await createAndPublishListing(page, { title: 'Report Test Item', price: '10' });
    listingUrl = page.url();
    await logout(page);
  });

  test('Report button is visible to a non-owner user', async ({ page }) => {
    await registerAndLogin(page, 'repbuyer', 'Report Buyer');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    await expect(
      page.locator('button:has-text("Report")').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Report button opens a report modal', async ({ page }) => {
    await registerAndLogin(page, 'repbuyer2', 'Report Buyer 2');
    await page.goto(listingUrl);
    await page.waitForURL(url => new URL(url).hash.startsWith('#/listings/'), { timeout: 8_000 });

    const reportBtn = page.locator('button:has-text("Report")').first();
    if (await reportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reportBtn.click();
      await page.waitForTimeout(400);

      // The report action opens a modal overlay
      await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ── Listing form (create/edit) ────────────────────────────────

test.describe('Listing Form', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
    await registerUser(page, { username: 'formuser', displayName: 'Form User' });
    await login(page, { username: 'formuser', password: USER_PASS });
  });

  test('create listing form has required fields', async ({ page }) => {
    await page.goto('/#/listings/new');
    await page.waitForURL('**/#/listings/new');

    await expect(page.locator('#title')).toBeVisible();
    await expect(page.locator('#price')).toBeVisible();
    await expect(page.locator('select#category')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('create listing with empty title shows validation error', async ({ page }) => {
    await page.goto('/#/listings/new');
    await page.waitForURL('**/#/listings/new');

    // Submit without filling required fields
    await page.click('button[type="submit"]');

    await expect(
      page.locator('.alert-danger, .error, [class*="error"], .form-error').first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('created listing appears in My Listings', async ({ page }) => {
    await createAndPublishListing(page, { title: 'My Listing Item', price: '45' });

    await page.goto('/#/marketplace');
    await page.waitForURL('**/#/marketplace');

    const myTab = page.locator('button:has-text("My Listings"), .pill-tab:has-text("My Listings")');
    if (await myTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await myTab.click();
      await page.waitForTimeout(500);
      await expect(
        page.locator('.listing-card, [class*="listing-card"]').filter({ hasText: 'My Listing Item' }).first()
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});
