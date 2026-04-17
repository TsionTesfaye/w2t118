/**
 * RecoveryView — Component Tests
 *
 * Tests the two-step password recovery flow: step 1 (username entry) →
 * step 2 (security question answers + new password). Exercises the real
 * AuthService.getSecurityQuestions and AuthService.recoverPassword paths.
 *
 * Boundaries mocked:
 *   - src/utils/crypto.js         — PBKDF2 too slow for tests
 *   - src/repositories/index.js   — no IndexedDB in jsdom
 *   - vue-router                  — navigation side effects
 *
 * Real services: AuthService (getSecurityQuestions, recoverPassword)
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RecoveryView from '../src/views/auth/RecoveryView.vue';

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
    getByIdOrFail: async (id) => {
      const u = _users.find(u => u.id === id);
      if (!u) { const e = new Error(`User ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return u;
    },
    getAll: async () => [..._users],
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
}));

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}));

// ── Seeded user with hashed security answers ──────────────────────────────────
// Answers: 'fluffy' (q1), 'springfield' (q2)
const ALICE = {
  id: 'user-1',
  username: 'alice',
  passwordHash: 'mock-hash::OldPass1!@X::test-salt',
  salt: 'test-salt',
  roles: ['user'],
  displayName: 'Alice',
  failedAttempts: 0,
  failedAttemptWindowStart: null,
  lockoutUntil: null,
  recoveryAttempts: 0,
  recoveryLockoutUntil: null,
  securityQuestions: [
    {
      question: "What was your first pet's name?",
      answerHash: 'mock-hash::fluffy::test-salt',
      answerSalt: 'test-salt',
    },
    {
      question: 'What city were you born in?',
      answerHash: 'mock-hash::springfield::test-salt',
      answerSalt: 'test-salt',
    },
  ],
  notificationPreferences: { messages: true, moderation: true, transactions: true, complaints: true },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

let pinia;

function mountRecovery() {
  return mount(RecoveryView, { global: { plugins: [pinia] } });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function advanceToStep2(wrapper, username = 'alice') {
  await wrapper.find('#username').setValue(username);
  await wrapper.find('form').trigger('submit.prevent');
  await flushPromises();
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RecoveryView', () => {
  beforeEach(() => {
    _users = [{ ...ALICE }];
    _sessions = [];
    _auditLogs = [];
    mockPush.mockClear();
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  // ── Step 1 rendering ──────────────────────────────────────────────────────

  it('renders Recover Password heading', () => {
    const wrapper = mountRecovery();
    expect(wrapper.text()).toContain('Recover Password');
  });

  it('starts on step 1 — shows username field', () => {
    const wrapper = mountRecovery();
    expect(wrapper.find('#username').exists()).toBe(true);
    expect(wrapper.text()).toContain('Enter your username to begin');
  });

  it('shows "Username is required" when submitting step 1 empty', async () => {
    const wrapper = mountRecovery();
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Username is required');
  });

  // ── Step 2 — known user ───────────────────────────────────────────────────

  it('advances to step 2 after entering a known username', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    // Step 2 subtitle appears
    expect(wrapper.text()).toContain('Verify your identity');
  });

  it('displays security questions on step 2', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    expect(wrapper.text()).toContain("What was your first pet's name?");
    expect(wrapper.text()).toContain('What city were you born in?');
  });

  it('shows password rules on step 2', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const rules = wrapper.findAll('.password-rules li');
    expect(rules.length).toBeGreaterThanOrEqual(5);
  });

  // ── Step 2 — unknown user (question enumeration prevention) ──────────────

  it('still advances to step 2 for unknown username (no enumeration)', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'nobody');
    // Service returns generic placeholder questions
    expect(wrapper.text()).toContain('Verify your identity');
  });

  // ── Step 2 — validation ───────────────────────────────────────────────────

  it('shows answer required errors on step 2 empty submit', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Answer is required');
  });

  it('shows password mismatch error', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const answerInputs = wrapper.findAll('input[type="text"]');
    await answerInputs[0].setValue('fluffy');
    await answerInputs[1].setValue('springfield');
    await wrapper.find('#newPassword').setValue('NewPass1!@XY');
    await wrapper.find('#confirmPassword').setValue('DifferentPass1!');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Passwords do not match');
  });

  // ── Successful recovery ───────────────────────────────────────────────────

  it('redirects to Login after successful password reset', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const answerInputs = wrapper.findAll('input[type="text"]');
    await answerInputs[0].setValue('fluffy');
    await answerInputs[1].setValue('springfield');
    await wrapper.find('#newPassword').setValue('NewPass1!@XY');
    await wrapper.find('#confirmPassword').setValue('NewPass1!@XY');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ name: 'Login' }));
  });

  it('updates user password hash in repository on success', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const answerInputs = wrapper.findAll('input[type="text"]');
    await answerInputs[0].setValue('fluffy');
    await answerInputs[1].setValue('springfield');
    await wrapper.find('#newPassword').setValue('NewPass1!@XY');
    await wrapper.find('#confirmPassword').setValue('NewPass1!@XY');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    // Password hash should have changed
    expect(_users[0].passwordHash).not.toBe(ALICE.passwordHash);
  });

  // ── Wrong security answers ────────────────────────────────────────────────

  it('shows error on wrong security answers', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const answerInputs = wrapper.findAll('input[type="text"]');
    await answerInputs[0].setValue('wronganswer');
    await answerInputs[1].setValue('wrongcity');
    await wrapper.find('#newPassword').setValue('NewPass1!@XY');
    await wrapper.find('#confirmPassword').setValue('NewPass1!@XY');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.find('.alert-danger').exists()).toBe(true);
  });

  // ── Back button ───────────────────────────────────────────────────────────

  it('returns to step 1 when Back is clicked', async () => {
    const wrapper = mountRecovery();
    await advanceToStep2(wrapper, 'alice');
    const backBtn = wrapper.find('button.btn-secondary');
    await backBtn.trigger('click');
    expect(wrapper.find('#username').exists()).toBe(true);
  });
});
