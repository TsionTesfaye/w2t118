/**
 * SetupView — Component Tests
 *
 * Tests the two-step first-run wizard: step 1 (admin account creation) →
 * step 2 (baseline category setup). Exercises real InitService and AuthService
 * against in-memory repositories.
 *
 * Scope: form rendering, client-side validation, service calls that stay
 * within the repo boundary (InitService.createInitialAdmin,
 * InitService.createBaselineCategories via AdminService).
 *
 * Out of scope at this level: the post-setup navigation flow
 * (UserService.getProfile + router.push) which involves a dynamic import chain
 * spanning ThreadService/NotificationService — that path is covered by
 * browser/e2e tests.
 *
 * Boundaries mocked:
 *   - src/utils/crypto.js         — PBKDF2 too slow for tests
 *   - src/repositories/index.js   — no IndexedDB in jsdom
 *   - vue-router                  — navigation side effects
 *
 * Real services: InitService, AuthService, AdminService (real logic runs)
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SetupView from '../src/views/setup/SetupView.vue';

// ── Fast crypto boundary ──────────────────────────────────────────────────────
vi.mock('../src/utils/crypto.js', () => ({
  generateSalt: () => 'test-salt',
  hashValue: async (value, salt) => `mock-hash::${value}::${salt ?? 'test-salt'}`,
  verifyHash: async (value, storedHash, storedSalt) =>
    storedHash === `mock-hash::${value}::${storedSalt}`,
}));

// ── In-memory repository stubs ────────────────────────────────────────────────
let _users = [];
let _sessions = [];
let _auditLogs = [];
let _categories = [];

vi.mock('../src/repositories/index.js', () => ({
  userRepository: {
    getAll: async () => [..._users],
    getByUsername: async (username) => _users.find(u => u.username === username) ?? null,
    getByIdOrFail: async (id) => {
      const u = _users.find(u => u.id === id);
      if (!u) { const e = new Error(`User ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return u;
    },
    create: async (user) => { _users.push({ ...user }); return user; },
    update: async (user) => {
      const idx = _users.findIndex(u => u.id === user.id);
      if (idx >= 0) _users[idx] = { ...user };
      return user;
    },
  },
  sessionRepository: {
    update: async (session) => {
      const idx = _sessions.findIndex(s => s.userId === session.userId);
      if (idx >= 0) _sessions[idx] = { ...session };
      else _sessions.push({ ...session });
      return session;
    },
    delete: async (userId) => { _sessions = _sessions.filter(s => s.userId !== userId); },
  },
  auditLogRepository: {
    create: async (log) => { _auditLogs.push({ ...log }); return log; },
    getAll: async () => [..._auditLogs],
  },
  categoryRepository: {
    getAll: async () => [..._categories],
    getByIdOrFail: async (id) => {
      const c = _categories.find(c => c.id === id);
      if (!c) { const e = new Error(`Category ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return c;
    },
    create: async (cat) => { _categories.push({ ...cat }); return cat; },
    update: async (cat) => {
      const idx = _categories.findIndex(c => c.id === cat.id);
      if (idx >= 0) _categories[idx] = { ...cat };
      return cat;
    },
    delete: async (id) => { _categories = _categories.filter(c => c.id !== id); },
  },
}));

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PASS = 'Admin@TradeLoop1!';

async function fillSecurityQuestion(wrapper, groupIndex, questionText, answerText) {
  const sqSelects = wrapper.findAll('.security-question-group select');
  const sqAnswers = wrapper.findAll('.security-question-group input[type="text"]');
  if (sqSelects[groupIndex]) await sqSelects[groupIndex].setValue(questionText);
  if (sqAnswers[groupIndex]) await sqAnswers[groupIndex].setValue(answerText);
}

async function fillStep1(wrapper, overrides = {}) {
  await wrapper.find('#username').setValue(overrides.username ?? 'admin');
  await wrapper.find('#displayName').setValue(overrides.displayName ?? 'System Admin');
  await wrapper.find('#password').setValue(overrides.password ?? VALID_PASS);
  await wrapper.find('#confirmPassword').setValue(overrides.confirmPassword ?? VALID_PASS);
  await fillSecurityQuestion(wrapper, 0, "What was the name of your first pet?", overrides.sq1a ?? 'Fluffy');
  await fillSecurityQuestion(wrapper, 1, "What city were you born in?", overrides.sq2a ?? 'Springfield');
}

/** Advance to step 2 by completing a valid step 1 submission. */
async function advanceToStep2(wrapper) {
  await fillStep1(wrapper);
  await wrapper.find('form').trigger('submit.prevent');
  await flushPromises();
}

let pinia;

function mountSetup() {
  return mount(SetupView, { global: { plugins: [pinia] } });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SetupView', () => {
  beforeEach(() => {
    _users = [];
    _sessions = [];
    _auditLogs = [];
    _categories = [];
    mockPush.mockClear();
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  // ── Step indicator & initial render ──────────────────────────────────────

  it('renders TradeLoop title and First-Run Setup subtitle', () => {
    const wrapper = mountSetup();
    expect(wrapper.text()).toContain('TradeLoop');
    expect(wrapper.text()).toContain('First-Run Setup');
  });

  it('shows step 1 as active in the step indicator', () => {
    const wrapper = mountSetup();
    const active = wrapper.find('.step.active');
    expect(active.exists()).toBe(true);
    expect(active.text()).toContain('Create Admin');
  });

  it('renders step 1 form fields', () => {
    const wrapper = mountSetup();
    expect(wrapper.find('#username').exists()).toBe(true);
    expect(wrapper.find('#displayName').exists()).toBe(true);
    expect(wrapper.find('#password').exists()).toBe(true);
    expect(wrapper.find('#confirmPassword').exists()).toBe(true);
  });

  it('renders two security question groups', () => {
    const wrapper = mountSetup();
    expect(wrapper.findAll('.security-question-group')).toHaveLength(2);
  });

  it('renders password requirement list', () => {
    const wrapper = mountSetup();
    expect(wrapper.text()).toContain('12 characters');
  });

  // ── Step 1 validation ─────────────────────────────────────────────────────

  it('shows required field errors on empty submit', async () => {
    const wrapper = mountSetup();
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Username is required');
    expect(wrapper.text()).toContain('Display name is required');
  });

  it('shows error when passwords do not match', async () => {
    const wrapper = mountSetup();
    await wrapper.find('#username').setValue('admin');
    await wrapper.find('#displayName').setValue('Admin');
    await wrapper.find('#password').setValue(VALID_PASS);
    await wrapper.find('#confirmPassword').setValue('DifferentPass1!');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Passwords do not match');
  });

  it('requires security questions to be selected', async () => {
    const wrapper = mountSetup();
    await wrapper.find('#username').setValue('admin');
    await wrapper.find('#displayName').setValue('Admin');
    await wrapper.find('#password').setValue(VALID_PASS);
    await wrapper.find('#confirmPassword').setValue(VALID_PASS);
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Select a security question');
  });

  it('rejects duplicate security question selections', async () => {
    const wrapper = mountSetup();
    await wrapper.find('#username').setValue('admin');
    await wrapper.find('#displayName').setValue('Admin');
    await wrapper.find('#password').setValue(VALID_PASS);
    await wrapper.find('#confirmPassword').setValue(VALID_PASS);
    const SAME_Q = "What was the name of your first pet?";
    await fillSecurityQuestion(wrapper, 0, SAME_Q, 'Fluffy');
    await fillSecurityQuestion(wrapper, 1, SAME_Q, 'Fluffy2');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Questions must be different');
  });

  // ── Step 1 → Step 2 transition ────────────────────────────────────────────

  it('advances to step 2 after successful admin creation', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    expect(wrapper.text()).toContain('Initialize Categories');
  });

  it('creates admin user with admin role in repository', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    expect(_users.some(u => u.username === 'admin' && u.roles.includes('admin'))).toBe(true);
  });

  it('marks step 1 as done and step 2 as active in the step indicator', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    expect(wrapper.find('.step.done').exists()).toBe(true);
    const active = wrapper.find('.step.active');
    expect(active.text()).toContain('Categories');
  });

  // ── Step 2 — category management ─────────────────────────────────────────

  it('shows default category list as editable inputs', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    // Categories render as <input value="..."> — check element values, not text()
    const names = wrapper.findAll('.category-row input[type="text"]').map(i => i.element.value);
    expect(names).toContain('Electronics');
  });

  it('can add a new blank category row', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    const before = wrapper.findAll('.category-row').length;
    await wrapper.find('button.btn-secondary').trigger('click');
    expect(wrapper.findAll('.category-row').length).toBe(before + 1);
  });

  it('can remove a category row', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    const before = wrapper.findAll('.category-row').length;
    await wrapper.findAll('.btn-ghost')[0].trigger('click');
    expect(wrapper.findAll('.category-row').length).toBe(before - 1);
  });

  it('shows error when confirming with all categories cleared', async () => {
    const wrapper = mountSetup();
    await advanceToStep2(wrapper);
    // Remove all category rows
    const count = wrapper.findAll('.category-row').length;
    for (let i = 0; i < count; i++) {
      const btn = wrapper.findAll('.btn-ghost')[0];
      if (btn) await btn.trigger('click');
    }
    await wrapper.find('button.btn-primary.btn-full').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('At least one category is required');
  });

});
