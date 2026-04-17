/**
 * notificationStore — Store + Real Service + Stubbed Repository Integration Tests
 *
 * This file validates the full vertical slice:
 *   notificationStore → real NotificationService → in-memory repository stubs
 *
 * The repository layer is replaced with in-memory arrays (no IndexedDB, no
 * migrations, no schema setup). The service layer is NOT mocked — real
 * NotificationService code runs, including validateSession, requirePermission,
 * deduplication, and sort order. This catches bugs that store-only tests
 * with mocked services would miss (e.g. service silently dropping notifications,
 * permission gates, sort order reversals).
 *
 * Strategy:
 *   1. vi.mock('repositories/index.js') with in-memory stubs
 *   2. Do NOT mock NotificationService
 *   3. Seed the in-memory store in beforeEach
 *   4. Assert Pinia store state after calling real store actions
 */

import { setActivePinia, createPinia } from 'pinia';
import { useNotificationStore } from '../src/app/store/notificationStore.js';
import { Roles } from '../src/domain/enums/roles.js';

// ── In-memory repository stubs ────────────────────────────────────────────────
// These are module-level so we can mutate them in tests.
let _notifications = [];
let _users = [];

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
    create: async (notification) => {
      _notifications.push({ ...notification });
      return notification;
    },
    update: async (notification) => {
      const idx = _notifications.findIndex(n => n.id === notification.id);
      if (idx >= 0) _notifications[idx] = { ...notification };
      return notification;
    },
    getById: async (id) => _notifications.find(n => n.id === id) || null,
    getByIdOrFail: async (id) => {
      const n = _notifications.find(item => item.id === id);
      if (!n) throw new Error(`Notification ${id} not found`);
      return n;
    },
  },
  // NotificationService.create() calls userRepository.getById to check prefs
  userRepository: {
    getById: async (id) => _users.find(u => u.id === id) || null,
  },
  // Provide empty stubs for other repos imported transitively (none needed here
  // since we only import notificationStore → NotificationService)
}));

// ── Session helper ────────────────────────────────────────────────────────────
function makeSession(userId = 'user-1', roles = [Roles.USER]) {
  return {
    userId,
    roles,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
let _nextId = 1;
function seedNotification(userId, overrides = {}) {
  const n = {
    id: `n-${_nextId++}`,
    userId,
    type: 'message',
    referenceId: `ref-${_nextId}`,
    message: 'You have a new message',
    isRead: false,
    createdAt: Date.now() + _nextId, // stagger timestamps
    ...overrides,
  };
  _notifications.push(n);
  return n;
}

beforeEach(() => {
  _notifications = [];
  _users = [];
  _nextId = 1;
  setActivePinia(createPinia());
});

// ── fetchNotifications ────────────────────────────────────────────────────────

describe('notificationStore + real NotificationService — fetchNotifications', () => {
  it('populates store.notifications from the repository', async () => {
    seedNotification('user-1');
    seedNotification('user-1');

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    expect(store.notifications).toHaveLength(2);
  });

  it('only returns notifications for the current user, not other users', async () => {
    seedNotification('user-1');
    seedNotification('user-2');
    seedNotification('user-2');

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    expect(store.notifications).toHaveLength(1);
    expect(store.notifications[0].userId).toBe('user-1');
  });

  it('derives unreadCount from unread notifications', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    expect(store.unreadCount).toBe(2);
  });

  it('returns 0 unread when all notifications are read', async () => {
    seedNotification('user-1', { isRead: true });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    expect(store.unreadCount).toBe(0);
  });

  it('sorts notifications newest-first (real service sort)', async () => {
    const older = seedNotification('user-1', { createdAt: 1000 });
    const newer = seedNotification('user-1', { createdAt: 9000 });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    expect(store.notifications[0].id).toBe(newer.id);
    expect(store.notifications[1].id).toBe(older.id);
  });

  it('does nothing when session is null', async () => {
    seedNotification('user-1');

    const store = useNotificationStore();
    await store.fetchNotifications(null);

    expect(store.notifications).toHaveLength(0);
    expect(store.unreadCount).toBe(0);
  });

  it('silently handles permission errors (store catches and ignores)', async () => {
    // Session with no roles — NotificationService will throw AuthorizationError
    // but the store catches it silently
    const badSession = { userId: 'u', roles: [], createdAt: Date.now(), lastActivityAt: Date.now() };
    const store = useNotificationStore();
    await expect(store.fetchNotifications(badSession)).resolves.not.toThrow();
  });
});

// ── fetchUnreadCount ──────────────────────────────────────────────────────────

describe('notificationStore + real NotificationService — fetchUnreadCount', () => {
  it('sets unreadCount from repository without touching notifications array', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: true });

    const store = useNotificationStore();
    await store.fetchUnreadCount(makeSession('user-1'));

    expect(store.unreadCount).toBe(2);
    // fetchUnreadCount only updates the count, not the full notifications list
    expect(store.notifications).toHaveLength(0);
  });
});

// ── markAllRead ───────────────────────────────────────────────────────────────

describe('notificationStore + real NotificationService — markAllRead', () => {
  it('sets all in-store notifications to isRead=true optimistically', async () => {
    seedNotification('user-1', { isRead: false });
    seedNotification('user-1', { isRead: false });

    const store = useNotificationStore();
    // First populate the store
    await store.fetchNotifications(makeSession('user-1'));
    expect(store.unreadCount).toBe(2);

    // Now mark all read
    await store.markAllRead(makeSession('user-1'));

    expect(store.unreadCount).toBe(0);
    expect(store.notifications.every(n => n.isRead)).toBe(true);
  });

  it('persists isRead=true to the repository (real service writes back)', async () => {
    seedNotification('user-1', { isRead: false });

    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));
    await store.markAllRead(makeSession('user-1'));

    // Verify the in-memory repository was updated
    expect(_notifications.every(n => n.isRead)).toBe(true);
  });

  it('does nothing when session is null', async () => {
    seedNotification('user-1', { isRead: false });
    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    const countBefore = store.unreadCount;
    await store.markAllRead(null);
    expect(store.unreadCount).toBe(countBefore);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('notificationStore — reset', () => {
  it('clears notifications and unreadCount', async () => {
    seedNotification('user-1');
    const store = useNotificationStore();
    await store.fetchNotifications(makeSession('user-1'));

    store.reset();

    expect(store.notifications).toHaveLength(0);
    expect(store.unreadCount).toBe(0);
  });
});
