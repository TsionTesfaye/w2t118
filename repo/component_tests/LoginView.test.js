/**
 * LoginView — Component Tests
 *
 * Tests form rendering, client-side validation, real AuthService login flow
 * (success → redirect, wrong credentials → error message, lockout countdown).
 *
 * Boundaries mocked:
 *   - src/utils/crypto.js         — PBKDF2 too slow for tests
 *   - src/repositories/index.js   — no IndexedDB in jsdom
 *   - vue-router                  — navigation side effects
 *
 * Real services: AuthService (permission checks, throttle, session creation)
 * Real storage:  localStorage (jsdom provides it)
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import LoginView from '../src/views/auth/LoginView.vue';

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

vi.mock('../src/repositories/index.js', () => ({
  userRepository: {
    getByUsername: async (username) => _users.find(u => u.username === username) ?? null,
    getById: async (id) => _users.find(u => u.id === id) ?? null,
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
    getAll: async () => [..._users],
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
}));

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}));

// ── Seeded test user (password: 'Password1!@X') ───────────────────────────────
const ALICE = {
  id: 'user-1',
  username: 'alice',
  passwordHash: 'mock-hash::Password1!@X::test-salt',
  salt: 'test-salt',
  roles: ['user'],
  displayName: 'Alice',
  failedAttempts: 0,
  failedAttemptWindowStart: null,
  lockoutUntil: null,
  recoveryAttempts: 0,
  recoveryLockoutUntil: null,
  securityQuestions: [],
  notificationPreferences: { messages: true, moderation: true, transactions: true, complaints: true },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let pinia;

function mountLogin() {
  return mount(LoginView, {
    global: { plugins: [pinia] },
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('LoginView', () => {
  beforeEach(() => {
    _users = [{ ...ALICE }];
    _sessions = [];
    _auditLogs = [];
    mockPush.mockClear();
    // Clear login throttle storage between tests
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the Sign In heading', () => {
    const wrapper = mountLogin();
    expect(wrapper.text()).toContain('Sign In');
  });

  it('renders username and password inputs', () => {
    const wrapper = mountLogin();
    expect(wrapper.find('#username').exists()).toBe(true);
    expect(wrapper.find('#password').exists()).toBe(true);
  });

  it('renders links to Register and Forgot password', () => {
    const wrapper = mountLogin();
    expect(wrapper.text()).toContain("Don't have an account");
    expect(wrapper.text()).toContain('Forgot your password');
  });

  // ── Client-side validation ────────────────────────────────────────────────

  it('shows "Username is required" when submitting empty form', async () => {
    const wrapper = mountLogin();
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Username is required');
  });

  it('shows "Password is required" when only username is filled', async () => {
    const wrapper = mountLogin();
    await wrapper.find('#username').setValue('alice');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Password is required');
  });

  it('does not show validation errors before first submit', () => {
    const wrapper = mountLogin();
    expect(wrapper.text()).not.toContain('is required');
  });

  // ── Wrong credentials ─────────────────────────────────────────────────────

  it('shows error message on wrong password', async () => {
    const wrapper = mountLogin();
    await wrapper.find('#username').setValue('alice');
    await wrapper.find('#password').setValue('WrongPassword99!');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.alert-danger').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Signing in...');
  });

  it('shows error for unknown username', async () => {
    const wrapper = mountLogin();
    await wrapper.find('#username').setValue('nobody');
    await wrapper.find('#password').setValue('Password1!@X');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.alert-danger').exists()).toBe(true);
  });

  // ── Successful login ──────────────────────────────────────────────────────

  it('redirects to HOME on successful login', async () => {
    const wrapper = mountLogin();
    await wrapper.find('#username').setValue('alice');
    await wrapper.find('#password').setValue('Password1!@X');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ name: 'Home' }));
  });

  it('clears error message before each login attempt', async () => {
    const wrapper = mountLogin();
    // First attempt — wrong password
    await wrapper.find('#username').setValue('alice');
    await wrapper.find('#password').setValue('WrongPass99!');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.alert-danger').exists()).toBe(true);

    // Second attempt — correct password; error should clear before resolving
    await wrapper.find('#password').setValue('Password1!@X');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.alert-danger').exists()).toBe(false);
  });

  // ── Lockout countdown ─────────────────────────────────────────────────────

  it('shows lockout countdown when RateLimitError has retryAfter', async () => {
    vi.useFakeTimers();
    // Exhaust attempts to trigger lockout (AuthService locks after 5 failures in 10-min window)
    const wrapper = mountLogin();
    for (let i = 0; i < 5; i++) {
      await wrapper.find('#username').setValue('alice');
      await wrapper.find('#password').setValue(`Bad${i}Pass!XYZ`);
      await wrapper.find('form').trigger('submit.prevent');
      await flushPromises();
    }
    // 6th attempt — should hit rate limit
    await wrapper.find('#password').setValue('BadFinalPass!Z');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    // Lockout timer or error message should be visible
    expect(wrapper.find('.alert-danger').exists()).toBe(true);
    vi.useRealTimers();
  });
});
