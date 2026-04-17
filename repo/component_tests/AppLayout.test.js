/**
 * AppLayout — Component Unit Tests
 *
 * The outermost shell: sidebar navigation, topbar with notification badge,
 * displayName, and the logout button.
 *
 * Tests cover:
 *   - Role-gated sidebar sections (Moderation, Support, Administration)
 *   - Unread notification badge visibility
 *   - displayName rendered from currentUser
 *   - Logout clears session and calls router.push(LOGIN)
 *
 * Mocks:
 *   - vue-router (useRoute / useRouter) — navigation side-effect
 *   - src/repositories/index.js — no IndexedDB in jsdom
 *   - src/app/bootstrap/multiTabSync.js — no BroadcastChannel in jsdom
 *
 * Real Pinia stores: authStore, notificationStore, transactionStore, moderationStore.
 * UserAvatar is stubbed to avoid fetching profile avatars.
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import { useNotificationStore } from '../src/app/store/notificationStore.js';
import AppLayout from '../src/views/AppLayout.vue';

// ── vue-router stub ────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'Home', query: {}, params: {} }),
  useRouter: () => ({ push: mockPush }),
}));

// ── BroadcastChannel boundary (unavailable in jsdom) ─────────────────────────
vi.mock('../src/app/bootstrap/multiTabSync.js', () => ({
  broadcastSync: vi.fn(),
  SyncEvents: { LOGOUT: 'logout', SESSION_CHANGED: 'session_changed' },
  initMultiTabSync: vi.fn(),
  onSyncEvent: vi.fn(() => () => {}),
  closeSyncChannel: vi.fn(),
}));

// ── In-memory repository stubs ────────────────────────────────────────────────
let _notifications = [];
let _auditLogs = [];
let _sessions = [];

vi.mock('../src/repositories/index.js', () => ({
  notificationRepository: {
    getByUserId: async (userId) => _notifications.filter(n => n.userId === userId),
    getUnreadByUserId: async (userId) => _notifications.filter(n => n.userId === userId && !n.isRead),
    countUnreadByUserId: async (userId) =>
      _notifications.filter(n => n.userId === userId && !n.isRead).length,
    findUnread: async () => null,
    create: async (n) => { _notifications.push({ ...n }); return n; },
    update: async (n) => n,
    getById: async () => null,
    getByIdOrFail: async (id) => {
      const e = new Error(`Not found: ${id}`); e.name = 'NotFoundError'; throw e;
    },
  },
  userRepository: {
    getById: async () => null,
    getByIdOrFail: async (id) => {
      const e = new Error(`Not found: ${id}`); e.name = 'NotFoundError'; throw e;
    },
    getByUsername: async () => null,
    update: async (u) => u,
  },
  sessionRepository: {
    update: async (s) => { _sessions.push({ ...s }); return s; },
    delete: async (userId) => { _sessions = _sessions.filter(s => s.userId !== userId); },
  },
  auditLogRepository: {
    create: async (log) => { _auditLogs.push({ ...log }); return log; },
    getAll: async () => [..._auditLogs],
  },
  // Stubs for services imported transitively
  blockRepository: {},
  listingRepository: { getAll: async () => [] },
  transactionRepository: { getAll: async () => [] },
  moderationCaseRepository: { getAll: async () => [] },
}));

// ── Crypto mock (needed by AuthService.logout path via AuditService) ──────────
// Actually logout reads localStorage session (null in test) so audit is skipped,
// but mock is provided for completeness / future-proofing.
vi.mock('../src/utils/crypto.js', () => ({
  generateSalt: () => 'test-salt',
  hashValue: async (v, s) => `mock::${v}::${s}`,
  verifyHash: async (v, h, s) => h === `mock::${v}::${s}`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

let pinia;

function makeSession(userId = 'user-1', roles = ['user']) {
  return { userId, roles, token: 'tok', createdAt: Date.now(), lastActivityAt: Date.now() };
}

function mountLayout({ roles = ['user'], displayName = null, username = 'alice' } = {}) {
  const auth = useAuthStore();
  auth.setSessionData(makeSession('user-1', roles), {
    id: 'user-1',
    username,
    displayName,
  });

  return mount(AppLayout, {
    global: {
      plugins: [pinia],
      stubs: {
        UserAvatar: true,
        RouterLink: { template: '<a><slot /></a>' },
        RouterView: { template: '<div />' },
        teleport: true,
      },
    },
  });
}

beforeEach(() => {
  _notifications = [];
  _auditLogs = [];
  _sessions = [];
  mockPush.mockClear();
  pinia = createPinia();
  setActivePinia(pinia);
  localStorage.clear();
});

// ── Sidebar sections ──────────────────────────────────────────────────────────

describe('AppLayout — sidebar sections (role-gated)', () => {
  it('always shows Marketplace section', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).toContain('Marketplace');
  });

  it('always shows Messaging section', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).toContain('Messaging');
  });

  it('always shows Account section', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).toContain('Account');
  });

  it('hides Moderation section for regular user', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).not.toContain('Moderation');
  });

  it('hides Support section for regular user', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).not.toContain('Support');
  });

  it('hides Administration section for regular user', () => {
    const wrapper = mountLayout({ roles: ['user'] });
    expect(wrapper.text()).not.toContain('Administration');
  });

  it('shows Moderation section for moderator', () => {
    const wrapper = mountLayout({ roles: ['moderator'] });
    expect(wrapper.text()).toContain('Moderation');
  });

  it('shows Support section for support_agent', () => {
    const wrapper = mountLayout({ roles: ['support_agent'] });
    expect(wrapper.text()).toContain('Support');
  });

  it('shows Administration section only for admin', () => {
    const wrapper = mountLayout({ roles: ['admin'] });
    expect(wrapper.text()).toContain('Administration');
  });

  it('admin sees all privileged sections', () => {
    const wrapper = mountLayout({ roles: ['admin'] });
    expect(wrapper.text()).toContain('Moderation');
    expect(wrapper.text()).toContain('Support');
    expect(wrapper.text()).toContain('Administration');
  });

  it('moderator sees Moderation but not Support or Administration', () => {
    const wrapper = mountLayout({ roles: ['moderator'] });
    expect(wrapper.text()).toContain('Moderation');
    expect(wrapper.text()).not.toContain('Support');
    expect(wrapper.text()).not.toContain('Administration');
  });
});

// ── Notification badge ────────────────────────────────────────────────────────

describe('AppLayout — notification badge', () => {
  it('hides badge when unreadCount is 0', async () => {
    const wrapper = mountLayout();
    await flushPromises();
    expect(wrapper.find('.badge').exists()).toBe(false);
  });

  it('shows badge with count when unreadCount > 0', async () => {
    const wrapper = mountLayout();
    await flushPromises();

    const notifStore = useNotificationStore();
    notifStore.unreadCount = 7;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.badge').text()).toContain('7');
  });
});

// ── displayName ───────────────────────────────────────────────────────────────

describe('AppLayout — displayName in topbar', () => {
  it('shows displayName when currentUser has displayName', () => {
    const wrapper = mountLayout({ displayName: 'Alice Smith' });
    expect(wrapper.text()).toContain('Alice Smith');
  });

  it('falls back to username when displayName is null', () => {
    const wrapper = mountLayout({ displayName: null, username: 'alice' });
    expect(wrapper.text()).toContain('alice');
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

describe('AppLayout — logout', () => {
  it('Logout button exists in topbar', () => {
    const wrapper = mountLayout();
    const logoutBtn = wrapper.findAll('button').find(b => b.text() === 'Logout');
    expect(logoutBtn).toBeDefined();
  });

  it('clears auth session when Logout is clicked', async () => {
    const wrapper = mountLayout();
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(true);

    const logoutBtn = wrapper.findAll('button').find(b => b.text() === 'Logout');
    await logoutBtn.trigger('click');
    await flushPromises();

    expect(auth.isAuthenticated).toBe(false);
  });

  it('redirects to Login route after logout', async () => {
    const wrapper = mountLayout();
    const logoutBtn = wrapper.findAll('button').find(b => b.text() === 'Logout');
    await logoutBtn.trigger('click');
    await flushPromises();

    expect(mockPush).toHaveBeenCalled();
    const arg = mockPush.mock.calls[0][0];
    // Called with an object like { name: 'Login' }
    expect(typeof arg === 'object' ? arg.name : arg).toMatch(/[Ll]ogin/);
  });

  it('resets notification store on logout', async () => {
    const wrapper = mountLayout();
    const notifStore = useNotificationStore();
    notifStore.unreadCount = 3;

    const logoutBtn = wrapper.findAll('button').find(b => b.text() === 'Logout');
    await logoutBtn.trigger('click');
    await flushPromises();

    expect(notifStore.unreadCount).toBe(0);
  });
});
