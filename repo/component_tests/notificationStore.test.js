/**
 * notificationStore — Integration Tests
 *
 * Tests store actions (fetchNotifications, markAllRead, reset, polling).
 * Real NotificationService runs — no service mock.
 * Only the repository layer (IndexedDB) is replaced with in-memory stubs.
 *
 * For deeper service-level assertions see notificationStore.integration.test.js.
 * This file focuses on store-level behaviour: state changes, loading guards,
 * and the polling interval lifecycle.
 */

import { setActivePinia, createPinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { useNotificationStore } from '../src/app/store/notificationStore.js';
import { Roles } from '../src/domain/enums/roles.js';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _notifications = [];

vi.mock('../src/repositories/index.js', () => ({
  notificationRepository: {
    getByUserId: async (userId) =>
      _notifications.filter(n => n.userId === userId),
    getUnreadByUserId: async (userId) =>
      _notifications.filter(n => n.userId === userId && !n.isRead),
    countUnreadByUserId: async (userId) =>
      _notifications.filter(n => n.userId === userId && !n.isRead).length,
    findUnread: async (userId, type, referenceId) =>
      _notifications.find(
        n => n.userId === userId && n.type === type && n.referenceId === referenceId && !n.isRead,
      ) || null,
    create: async (notification) => { _notifications.push({ ...notification }); return notification; },
    update: async (notification) => {
      const idx = _notifications.findIndex(n => n.id === notification.id);
      if (idx >= 0) _notifications[idx] = { ...notification };
      return notification;
    },
    getById: async (id) => _notifications.find(n => n.id === id) || null,
    getByIdOrFail: async (id) => {
      const n = _notifications.find(item => item.id === id);
      if (!n) { const e = new Error(`Notification ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return n;
    },
  },
  // NotificationService.create() checks user preferences via userRepository
  userRepository: {
    getById: async () => null,
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = 'user-1', roles = [Roles.USER]) {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

let _nextId = 1;
function seedNotification(userId, overrides = {}) {
  const n = {
    id: `n-${_nextId++}`,
    userId,
    type: 'message',
    referenceId: `ref-${_nextId}`,
    message: 'You have a new message',
    isRead: false,
    createdAt: Date.now() + _nextId,
    ...overrides,
  };
  _notifications.push(n);
  return n;
}

beforeEach(() => {
  _notifications = [];
  _nextId = 1;
  setActivePinia(createPinia());
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── fetchNotifications ────────────────────────────────────────────────────────

describe('notificationStore — fetchNotifications', () => {
  it('populates notifications array', async () => {
    seedNotification('user-1');
    seedNotification('user-1');
    seedNotification('user-1');

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession());
    expect(store.notifications).toHaveLength(3);
  });

  it('sets unreadCount from unread items', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: true });
    seedNotification('user-1', { isRead: true });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession());
    expect(store.unreadCount).toBe(2);
  });

  it('does nothing when session is null', async () => {
    seedNotification('user-1');

    const store = useNotificationStore();
    await store.fetchNotifications(null);
    expect(store.notifications).toHaveLength(0);
    expect(store.unreadCount).toBe(0);
  });

  it('silently ignores permission errors (session with no roles)', async () => {
    const badSession = { userId: 'u', roles: [], createdAt: Date.now(), lastActivityAt: Date.now() };
    const store = useNotificationStore();
    await expect(store.fetchNotifications(badSession)).resolves.toBeUndefined();
    expect(store.notifications).toHaveLength(0);
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('notificationStore — markAllRead', () => {
  it('sets all notifications to isRead=true optimistically', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession());
    await store.markAllRead(makeSession());

    expect(store.notifications.every(n => n.isRead)).toBe(true);
    expect(store.unreadCount).toBe(0);
  });

  it('does nothing when session is null', async () => {
    seedNotification('user-1', { isRead: false });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession());
    const countBefore = store.unreadCount;

    await store.markAllRead(null);
    expect(store.unreadCount).toBe(countBefore);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('notificationStore — reset', () => {
  it('clears notifications and unreadCount', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession());
    store.reset();

    expect(store.notifications).toHaveLength(0);
    expect(store.unreadCount).toBe(0);
  });

  it('stops polling on reset', () => {
    const store = useNotificationStore();
    store.startPolling(() => makeSession(), 5000);
    store.reset();
    // Advancing time after reset must NOT trigger interval errors
    vi.advanceTimersByTime(10_000);
  });
});

// ── startPolling / stopPolling ────────────────────────────────────────────────

describe('notificationStore — startPolling / stopPolling', () => {
  it('stopPolling can be called safely when not polling', () => {
    const store = useNotificationStore();
    expect(() => store.stopPolling()).not.toThrow();
  });

  it('startPolling updates unreadCount on initial tick', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });

    const store = useNotificationStore();
    store.startPolling(() => makeSession(), 5000);

    // flushPromises resolves all pending microtasks (real async chain)
    await flushPromises();

    expect(store.unreadCount).toBe(2);
  });
});
