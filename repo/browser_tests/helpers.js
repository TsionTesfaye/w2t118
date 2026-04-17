/**
 * Shared E2E test helpers.
 *
 * Each test should call clearBrowserState() to get a clean page with
 * empty localStorage and IndexedDB — full isolation between tests.
 */

/**
 * Clear all browser storage and navigate to the app root.
 * Call this at the start of each test that needs a clean slate.
 */
export async function clearBrowserState(page) {
  // Navigate to the app first so storage APIs are available in the correct origin
  await page.goto('/');
  await page.evaluate(async () => {
    // Clear localStorage and sessionStorage
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}

    // Clear all IndexedDB databases
    try {
      const dbs = (await indexedDB.databases?.()) ?? [];
      await Promise.all(dbs.map(db => new Promise((res) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = res;
        req.onerror = res;
        req.onblocked = res;
      })));
    } catch {}
  });
  // Navigate again — bootstrap detects empty DB, auto-seeds all demo accounts
  // (PBKDF2 × 5 accounts ≈ 5 s on first load), then redirects to /login.
  await page.goto('/');
  await page.waitForURL(/\/#\/(login|home)/, { timeout: 30_000 });
}

/**
 * "Complete setup" — historically ran the first-run wizard, but the app now
 * auto-seeds all demo accounts at startup so the wizard is never shown.
 * This helper is kept for backward-compatibility: it simply logs in as admin.
 */
export async function completeSetup(page, {
  username = 'admin',
  password = 'Admin@TradeLoop1!',
  displayName = 'Site Admin',   // unused — kept so call-sites need no changes
} = {}) {
  await login(page, { username, password });
}

/**
 * Register a new user via RegisterView.vue.
 *
 * RegisterView form elements:
 *   #username, #displayName, #password, #confirmPassword
 *   #sq1-question, #sq1-answer, #sq2-question, #sq2-answer (plain text inputs)
 */
export async function registerUser(page, {
  username,
  password    = 'TestUser@Pass1!',
  displayName,
} = {}) {
  displayName = displayName || username;
  await page.goto('/#/register');
  await page.waitForURL('**/#/register', { timeout: 8_000 });

  await page.fill('#username',        username);
  await page.fill('#displayName',     displayName);
  await page.fill('#password',        password);
  await page.fill('#confirmPassword', password);

  // RegisterView uses plain text inputs for security questions
  await page.fill('#sq1-question', "What was your first pet's name?");
  await page.fill('#sq1-answer',   'fluffy');
  await page.fill('#sq2-question', 'What city were you born in?');
  await page.fill('#sq2-answer',   'springfield');

  await page.click('button[type="submit"]');
  // Registration involves PBKDF2 hashing (100k iterations) which can be slow in CI
  await page.waitForURL(/\/#\/login/, { timeout: 30_000 });
}

/**
 * Log in via LoginView.vue.
 */
export async function login(page, {
  username,
  password = 'Admin@TradeLoop1!',
} = {}) {
  await page.goto('/#/login');
  await page.waitForURL('**/#/login', { timeout: 8_000 });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // Wait for redirect away from login — PBKDF2 verification can be slow in CI
  await page.waitForURL(/\/#\/(?!login)/, { timeout: 30_000 });
}

/**
 * Log out via the Logout button in the topbar.
 */
export async function logout(page) {
  await page.click('button:has-text("Logout")');
  await page.waitForURL(/\/#\/login/, { timeout: 8_000 });
}

/**
 * Create a listing and publish it via the "Publish Now" modal.
 * After this call, the page is on the listing detail URL.
 */
export async function createAndPublishListing(page, { title, price = '10', delivery = false }) {
  await page.goto('/#/listings/new');
  await page.waitForURL('**/#/listings/new');

  await page.fill('#title', title);

  const rte = page.locator('.rte-content').first();
  await rte.click();
  await rte.pressSequentially('A well-described item in great condition.');

  await page.fill('#price', String(price));

  await page.waitForFunction(
    () => document.querySelectorAll('select#category option').length > 1,
    { timeout: 10_000 }
  );
  await page.locator('select#category').selectOption({ index: 1 });

  // Opt-in to delivery if requested (default is pickup-only)
  if (delivery) {
    const deliveryCheckbox = page
      .locator('.checkbox-group')
      .locator('label', { hasText: 'Delivery' })
      .locator('input[type="checkbox"]');
    if (!(await deliveryCheckbox.isChecked())) {
      await deliveryCheckbox.check();
    }
  }

  await page.click('button[type="submit"]');

  await page.waitForSelector('.modal-overlay', { timeout: 10_000 });
  await page.waitForSelector('button:has-text("Publish Now")', { timeout: 5_000 });
  await page.click('button:has-text("Publish Now")');

  await page.waitForURL(
    url => { const h = new URL(url).hash; return h.startsWith('#/listings/') && h !== '#/listings/new'; },
    { timeout: 10_000 }
  );
}
