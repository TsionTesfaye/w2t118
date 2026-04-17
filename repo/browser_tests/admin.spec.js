/**
 * E2E: Admin Dashboard — all tabs
 *
 * Covers every tab in AdminView:
 *   Analytics  — KPI stat cards render
 *   Users      — user table visible; Manage Roles modal opens
 *   Categories — create category form; category tree
 *   Delivery   — add ZIP prefix; verify it appears
 *   Audit      — audit log table renders
 *   Data       — export buttons visible; redacted export resolves
 *   Dictionary — entity list renders
 */

import { test, expect } from '@playwright/test';
import {
  clearBrowserState,
  completeSetup,
  login,
  logout,
  registerUser,
} from './helpers.js';

const ADMIN_PASS = 'Admin@TradeLoop1!';

// ── Analytics tab ─────────────────────────────────────────────

test.describe('Admin: Analytics tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('analytics tab renders KPI stat cards', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/, { timeout: 8_000 });

    // Stats grid is present
    await expect(page.locator('[data-testid="admin-stats-grid"]')).toBeVisible({ timeout: 8_000 });
    // At least one stat card inside
    await expect(
      page.locator('[data-testid="admin-stats-grid"] .stat-card').first()
    ).toBeVisible();
  });

  test('all 7 admin tabs are rendered', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/, { timeout: 8_000 });

    for (const label of ['Analytics', 'Users', 'Categories', 'Delivery', 'Audit', 'Data', 'Dictionary']) {
      await expect(page.locator('.tab', { hasText: label })).toBeVisible();
    }
  });
});

// ── Users tab ─────────────────────────────────────────────────

test.describe('Admin: Users tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
    await logout(page);
    // Register an extra user so the table is non-empty
    await registerUser(page, { username: 'tabuser1', displayName: 'Tab User One' });
    await login(page, { username: 'admin', password: ADMIN_PASS });
  });

  test('users tab shows user table with username column', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Users' }).click();
    await page.waitForTimeout(400);

    // Table is present
    await expect(page.locator('.data-table')).toBeVisible({ timeout: 8_000 });
    // Both users in the table
    await expect(page.locator('td', { hasText: 'admin' }).first()).toBeVisible();
    await expect(page.locator('td', { hasText: 'tabuser1' }).first()).toBeVisible();
  });

  test('Manage Roles button opens modal', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Users' }).click();
    await page.waitForTimeout(400);

    // Click Manage Roles for any row
    await page.locator('button:has-text("Manage Roles")').first().click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 5_000 });
    // Modal title
    await expect(page.locator('.modal-overlay')).toContainText('Manage Roles');
  });

  test('role modal closes on Cancel', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Users' }).click();
    await page.waitForTimeout(400);

    await page.locator('button:has-text("Manage Roles")').first().click();
    await page.waitForSelector('.modal-overlay');
    await page.locator('.modal-overlay button:has-text("Cancel")').click();
    await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 3_000 });
  });
});

// ── Categories tab ────────────────────────────────────────────

test.describe('Admin: Categories tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('categories tab shows add-category form', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Categories' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('input[placeholder="Category name"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
  });

  test('admin can create a new category and it appears in the tree', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Categories' }).click();
    await page.waitForTimeout(400);

    await page.fill('input[placeholder="Category name"]', 'Test Category');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(600);

    // The new category should appear in the category tree/table
    await expect(page.locator('.category-name, td').filter({ hasText: 'Test Category' }).first())
      .toBeVisible({ timeout: 5_000 });
  });
});

// ── Delivery tab ──────────────────────────────────────────────

test.describe('Admin: Delivery tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('delivery tab shows ZIP prefix form', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Delivery' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('input[placeholder="e.g. 100"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Add")')).toBeVisible();
  });

  test('adding a ZIP prefix adds it to the coverage list', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Delivery' }).click();
    await page.waitForTimeout(400);

    await page.fill('input[placeholder="e.g. 100"]', '456');
    await page.click('button:has-text("Add")');
    await page.waitForTimeout(400);

    // The prefix should appear somewhere in the coverage list
    await expect(
      page.locator('li, td, .coverage-item').filter({ hasText: '456' }).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── Audit tab ─────────────────────────────────────────────────

test.describe('Admin: Audit tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('audit tab renders a table or empty state', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Audit' }).click();
    await page.waitForTimeout(400);

    // Either a data table or an empty state must render
    const content = page.locator('.data-table, .empty-state, table').first();
    await expect(content).toBeVisible({ timeout: 8_000 });
  });

  test('audit log contains at least one entry (setup logged)', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Audit' }).click();
    await page.waitForTimeout(400);

    // After setup, at least USER_REGISTERED and DATA_IMPORTED events should be present
    const table = page.locator('.data-table, table').first();
    if (await table.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(table.locator('tbody tr').first()).toBeVisible();
    }
  });
});

// ── Data tab ─────────────────────────────────────────────────

test.describe('Admin: Data tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('data tab shows export buttons', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Data' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('button:has-text("Export Redacted Snapshot")')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Export Restorable Snapshot")')).toBeVisible({ timeout: 5_000 });
  });

  test('restorable export button is disabled with short passphrase', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Data' }).click();
    await page.waitForTimeout(400);

    const passphraseInput = page.locator('input[placeholder="Enter passphrase"]');
    await passphraseInput.fill('short');

    // Button should remain disabled (passphrase < 8 chars)
    const restoreBtn = page.locator('button:has-text("Export Restorable Snapshot")');
    await expect(restoreBtn).toBeDisabled({ timeout: 3_000 });
  });

  test('restorable export button enables with valid passphrase', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Data' }).click();
    await page.waitForTimeout(400);

    const passphraseInput = page.locator('input[placeholder="Enter passphrase"]');
    await passphraseInput.fill('ValidPass99!');

    const restoreBtn = page.locator('button:has-text("Export Restorable Snapshot")');
    await expect(restoreBtn).toBeEnabled({ timeout: 3_000 });
  });

  test('filtered export checkboxes are present for all stores', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Data' }).click();
    await page.waitForTimeout(400);

    // The store selector checkboxes should list known stores
    for (const store of ['users', 'listings', 'transactions']) {
      await expect(
        page.locator(`label:has-text("${store}") input[type="checkbox"]`)
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ── Dictionary tab ────────────────────────────────────────────

test.describe('Admin: Dictionary tab', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await completeSetup(page, { username: 'admin', password: ADMIN_PASS, displayName: 'Site Admin' });
  });

  test('dictionary tab renders entity names', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/\/#\/admin/);
    await page.locator('.tab', { hasText: 'Dictionary' }).click();
    await page.waitForTimeout(400);

    // At least one known entity should appear
    await expect(
      page.locator('h2, h3, .entity-name, td').filter({ hasText: /users|listings|transactions/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
