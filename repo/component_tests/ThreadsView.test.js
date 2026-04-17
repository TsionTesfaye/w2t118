/**
 * ThreadsView — Component Tests
 *
 * Tests thread list rendering, other-party name resolution, archive action,
 * empty state, and navigation to thread detail. Uses real ThreadService and
 * UserService against in-memory repository stubs.
 *
 * Boundaries mocked:
 *   - src/repositories/index.js          — no IndexedDB in jsdom
 *   - src/repositories/BlockRepository.js — BroadcastChannel / no IndexedDB
 *   - vue-router                          — navigation side effects
 *
 * NOT mocked: ThreadService, UserService (real permission + query logic runs)
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ThreadsView from '../src/views/messaging/ThreadsView.vue';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _threads = [];
let _users = [];
let _messages = [];
let _auditLogs = [];

vi.mock('../src/repositories/index.js', () => ({
  threadRepository: {
    getByBuyerId: async (buyerId) => _threads.filter(t => t.buyerId === buyerId),
    getBySellerId: async (sellerId) => _threads.filter(t => t.sellerId === sellerId),
    getByIdOrFail: async (id) => {
      const t = _threads.find(t => t.id === id);
      if (!t) { const e = new Error(`Thread ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return t;
    },
    getAll: async () => [..._threads],
    create: async (thread) => { _threads.push({ ...thread }); return thread; },
    update: async (thread) => {
      const idx = _threads.findIndex(t => t.id === thread.id);
      if (idx >= 0) _threads[idx] = { ...thread };
      return thread;
    },
  },
  messageRepository: {
    getByThreadId: async (threadId) => _messages.filter(m => m.threadId === threadId),
    create: async (msg) => { _messages.push({ ...msg }); return msg; },
  },
  listingRepository: {
    getByIdOrFail: async () => { throw new Error('Not found'); },
    getByListingId: async () => [],
    getAll: async () => [],
  },
  userRepository: {
    getByIdOrFail: async (id) => {
      const u = _users.find(u => u.id === id);
      if (!u) { const e = new Error(`User ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return u;
    },
    getAll: async () => [..._users],
    getByUsername: async (username) => _users.find(u => u.username === username) ?? null,
    create: async (user) => { _users.push({ ...user }); return user; },
    update: async (user) => {
      const idx = _users.findIndex(u => u.id === user.id);
      if (idx >= 0) _users[idx] = { ...user };
      return user;
    },
  },
  blockRepository: {
    isEitherBlocked: async () => false,
    getAll: async () => [],
  },
  auditLogRepository: {
    create: async (log) => { _auditLogs.push({ ...log }); return log; },
    getAll: async () => [..._auditLogs],
  },
  notificationRepository: {
    getByUserId: async () => [],
    create: async () => ({}),
    update: async () => ({}),
  },
}));

// ── BlockRepository lives in a separate file ──────────────────────────────────
vi.mock('../src/repositories/BlockRepository.js', () => ({
  blockRepository: {
    isEitherBlocked: async () => false,
    getAll: async () => [],
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

const BUYER_ID = 'user-1';
const SELLER_ID = 'user-2';

function makeSession(userId, roles = ['user']) {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeThread(id, overrides = {}) {
  return {
    id,
    listingId: overrides.listingId ?? 'listing-1',
    listingTitle: overrides.listingTitle ?? `Listing ${id}`,
    buyerId: overrides.buyerId ?? BUYER_ID,
    sellerId: overrides.sellerId ?? SELLER_ID,
    isReadOnly: false,
    archivedBy: overrides.archivedBy ?? [],
    lastMessage: overrides.lastMessage ?? null,
    unreadCount: overrides.unreadCount ?? 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

let pinia;

function mountThreads() {
  return mount(ThreadsView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        EmptyState: {
          template: '<div class="empty-state" />',
          props: ['title', 'description'],
        },
      },
    },
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ThreadsView', () => {
  beforeEach(() => {
    _threads = [];
    _users = [
      {
        id: BUYER_ID, username: 'alice', displayName: 'Alice Buyer', roles: ['user'],
        avatar: null, bio: '', notificationPreferences: {},
        failedAttempts: 0, lockoutUntil: null,
        securityQuestions: [], createdAt: Date.now(), updatedAt: Date.now(),
      },
      {
        id: SELLER_ID, username: 'bob', displayName: 'Bob Seller', roles: ['user'],
        avatar: null, bio: '', notificationPreferences: {},
        failedAttempts: 0, lockoutUntil: null,
        securityQuestions: [], createdAt: Date.now(), updatedAt: Date.now(),
      },
    ];
    _messages = [];
    _auditLogs = [];
    mockPush.mockClear();
    pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.setSessionData(makeSession(BUYER_ID), _users[0]);
  });

  // ── Loading state (tested via delayed spy) ────────────────────────────────

  it('shows loading state when repo is slow', async () => {
    const { threadRepository } = await import('../src/repositories/index.js');
    let resolve;
    vi.spyOn(threadRepository, 'getByBuyerId').mockImplementationOnce(
      () => new Promise(r => { resolve = r; }),
    );
    const wrapper = mountThreads();
    await Promise.resolve(); // one tick — loading=true, repo pending
    expect(wrapper.find('.loading-state').exists()).toBe(true);
    resolve([]);
    await flushPromises();
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows empty state when user has no threads', async () => {
    _threads = [];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  // ── Thread list ───────────────────────────────────────────────────────────

  it('renders threads the current user is a buyer in', async () => {
    _threads = [makeThread('t-1', { listingTitle: 'Cool Widget', buyerId: BUYER_ID })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).toContain('Cool Widget');
  });

  it('renders threads the current user is a seller in', async () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession(SELLER_ID), _users[1]);
    _threads = [makeThread('t-1', { listingTitle: 'My Listing', sellerId: SELLER_ID, buyerId: 'other-user' })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).toContain('My Listing');
  });

  it('does not render threads archived by the current user', async () => {
    _threads = [
      makeThread('t-1', { listingTitle: 'Archived Thread', archivedBy: [BUYER_ID] }),
      makeThread('t-2', { listingTitle: 'Active Thread' }),
    ];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).not.toContain('Archived Thread');
    expect(wrapper.text()).toContain('Active Thread');
  });

  it('shows unread badge when thread has unread messages', async () => {
    _threads = [makeThread('t-1', { unreadCount: 3 })];
    const wrapper = mountThreads();
    await flushPromises();
    const badge = wrapper.find('.badge-primary');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('3');
  });

  it('does not show unread badge when unreadCount is 0', async () => {
    _threads = [makeThread('t-1', { unreadCount: 0 })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.find('.badge-primary').exists()).toBe(false);
  });

  // ── Other party name resolution ───────────────────────────────────────────

  it('resolves seller displayName for buyer view', async () => {
    _threads = [makeThread('t-1', { buyerId: BUYER_ID, sellerId: SELLER_ID })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).toContain('Bob Seller');
  });

  it('resolves buyer displayName for seller view', async () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession(SELLER_ID), _users[1]);
    _threads = [makeThread('t-1', { buyerId: BUYER_ID, sellerId: SELLER_ID })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).toContain('Alice Buyer');
  });

  it('falls back to userId when profile cannot be resolved', async () => {
    _users = [_users[0]]; // Remove bob so profile fetch fails
    _threads = [makeThread('t-1', { buyerId: BUYER_ID, sellerId: SELLER_ID })];
    const wrapper = mountThreads();
    await flushPromises();
    // Falls back to the raw userId string
    expect(wrapper.text()).toContain(SELLER_ID);
  });

  // ── Last message preview ──────────────────────────────────────────────────

  it('shows last message preview when present', async () => {
    _threads = [makeThread('t-1', {
      lastMessage: { content: 'Is this still available?' },
    })];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.text()).toContain('Is this still available?');
  });

  // ── Archive action ────────────────────────────────────────────────────────

  it('removes thread from list when Archive is clicked', async () => {
    _threads = [
      makeThread('t-1', { listingTitle: 'Widget' }),
      makeThread('t-2', { listingTitle: 'Gadget' }),
    ];
    const wrapper = mountThreads();
    await flushPromises();
    expect(wrapper.findAll('.thread-card').length).toBe(2);

    const firstArchiveBtn = wrapper.find('button.btn-secondary.btn-sm');
    await firstArchiveBtn.trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.thread-card').length).toBe(1);
  });

  it('updates archivedBy in repository on archive', async () => {
    _threads = [makeThread('t-1', { buyerId: BUYER_ID })];
    const wrapper = mountThreads();
    await flushPromises();
    await wrapper.find('button.btn-secondary.btn-sm').trigger('click');
    await flushPromises();
    expect(_threads[0].archivedBy).toContain(BUYER_ID);
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('clicking a thread card navigates to thread detail', async () => {
    _threads = [makeThread('t-1')];
    const wrapper = mountThreads();
    await flushPromises();
    const card = wrapper.find('.thread-card');
    await card.trigger('click');
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ThreadDetail', params: { id: 't-1' } }),
    );
  });

  it('archive button click does NOT navigate to thread detail', async () => {
    _threads = [makeThread('t-1')];
    const wrapper = mountThreads();
    await flushPromises();
    const archiveBtn = wrapper.find('button.btn-secondary.btn-sm');
    await archiveBtn.trigger('click');
    await flushPromises();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── Invalid session ───────────────────────────────────────────────────────

  it('shows empty state gracefully when session is missing', async () => {
    const auth = useAuthStore();
    auth.clearSession();
    const wrapper = mountThreads();
    await flushPromises();
    // Error is caught by the catch block — no crash
    expect(wrapper.find('.page-content').exists()).toBe(true);
  });
});
