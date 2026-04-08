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
  // Navigate again so the app boots with clean state
  await page.goto('/');
}

/**
 * Complete the first-run setup wizard (SetupView.vue).
 *
 * SetupView form elements:
 *   Step 1: #username, #displayName, #password, #confirmPassword
 *           .security-question-group select (×2), .security-question-group input (×2)
 *   Step 2: button:has-text("Confirm & Finish Setup")
 */
export async function completeSetup(page, {
  username    = 'admin',
  password    = 'Admin@TradeLoop1!',
  displayName = 'Site Admin',
} = {}) {
  await page.goto('/#/setup');
  await page.waitForURL('**/#/setup', { timeout: 10_000 });

  // ── Step 1: admin credentials ──
  await page.fill('#username', username);
  await page.fill('#displayName', displayName);
  await page.fill('#password', password);
  await page.fill('#confirmPassword', password);

  // SetupView uses <select> for security question choices — must pick DIFFERENT questions
  const qSelects = page.locator('.security-question-group select');
  const qCount   = await qSelects.count();
  for (let i = 0; i < qCount; i++) {
    // index 1 = first real question, index 2 = second real question (must differ)
    await qSelects.nth(i).selectOption({ index: i + 1 });
  }

  // Answer inputs are inside .security-question-group > div.form-group:last-child > input
  const aInputs = page.locator('.security-question-group input');
  const aCount  = await aInputs.count();
  for (let i = 0; i < aCount; i++) {
    await aInputs.nth(i).fill(`setupanswer${i + 1}`);
  }

  await page.click('button[type="submit"]');

  // ── Step 2: categories (accept defaults) ──
  // Wait for step 2 to appear
  await page.waitForSelector('button:has-text("Confirm & Finish Setup")', { timeout: 10_000 });
  await page.click('button:has-text("Confirm & Finish Setup")');

  // Should be redirected to home after setup completes
  await page.waitForURL(/\/#\/(home|)$/, { timeout: 15_000 });
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
