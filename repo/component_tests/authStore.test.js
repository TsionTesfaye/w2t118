/**
 * authStore — Integration Tests
 *
 * Tests computed properties, state transitions, and real AuthService
 * login/logout flows. No service mocks — real AuthService runs against
 * in-memory repository stubs and a fast crypto mock.
 *
 * Boundaries mocked:
 *   - src/utils/crypto.js  (PBKDF2 is too slow for tests)
 *   - src/repositories/index.js  (no IndexedDB in jsdom)
 *
 * LocalStorageAdapter, multiTabSync, and useToast are NOT mocked —
 * jsdom provides real localStorage and multiTabSync is a no-op when
 * BroadcastChannel is unavailable.
 */

import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';

// ── Fast crypto boundary (PBKDF2 is too slow for unit tests) ─────────────────
vi.mock('../src/utils/crypto.js', () => ({
  generateSalt: () => 'test-salt',
  hashValue: async (value, salt) => `mock-hash::${value}::${salt ?? 'test-salt'}`,
  verifyHash: async (value, storedHash, storedSalt) =>
    storedHash === `mock-hash::${value}::${storedSalt}`,
}));

// ── In-memory repository stubs (no IndexedDB) ─────────────────────────────────
let _users = [];
let _sessions = [];
let _auditLogs = [];

vi.mock('../src/repositories/index.js', () => ({
  userRepository: {
    getByUsername: async (username) => _users.find(u => u.username === username) || null,
    getById: async (id) => _users.find(u => u.id === id) || null,
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
}));

// ── Seed data helpers ─────────────────────────────────────────────────────────

/**
 * A pre-hashed user for login tests (password: 'Password1!').
 * Hash format matches the fast crypto mock above.
 */
const ALICE = {
  id: 'user-1',
  username: 'alice',
  passwordHash: 'mock-hash::Password1!::test-salt',
  salt: 'test-salt',
  roles: ['user'],
  displayName: 'Alice',
  failedAttempts: 0,
  failedAttemptWindowStart: null,
  lockoutUntil: null,
  recoveryAttempts: 0,
  recoveryLockoutUntil: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeSession(overrides = {}) {
  return {
    userId: 'user-1',
    roles: ['user'],
    token: 'tok',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  _users = [];
  _sessions = [];
  _auditLogs = [];
  setActivePinia(createPinia());
  // Clear localStorage between tests
  localStorage.clear();
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe('authStore — initial state', () => {
  it('isAuthenticated is false by default', () => {
    expect(useAuthStore().isAuthenticated).toBe(false);
  });

  it('userId is undefined by default', () => {
    expect(useAuthStore().userId).toBeUndefined();
  });

  it('roles is empty array by default', () => {
    expect(useAuthStore().roles).toEqual([]);
  });

  it('isLoading is false by default', () => {
    expect(useAuthStore().isLoading).toBe(false);
  });

  it('error is null by default', () => {
    expect(useAuthStore().error).toBeNull();
  });
});

// ── setSessionData / clearSession ─────────────────────────────────────────────

describe('authStore — setSessionData / clearSession', () => {
  it('setSessionData sets isAuthenticated to true', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession(), { id: 'user-1', username: 'alice' });
    expect(store.isAuthenticated).toBe(true);
  });

  it('setSessionData exposes userId', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession({ userId: 'user-42' }), {});
    expect(store.userId).toBe('user-42');
  });

  it('setSessionData exposes roles', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession({ roles: ['user', 'moderator'] }), {});
    expect(store.roles).toContain('moderator');
  });

  it('clearSession resets isAuthenticated to false', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession(), {});
    store.clearSession();
    expect(store.isAuthenticated).toBe(false);
  });

  it('clearSession nulls userId', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession(), {});
    store.clearSession();
    expect(store.userId).toBeUndefined();
  });
});

// ── hasRole ───────────────────────────────────────────────────────────────────

describe('authStore — hasRole', () => {
  it('hasRole returns true when role is present', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession({ roles: ['admin'] }), {});
    expect(store.hasRole('admin')).toBe(true);
  });

  it('hasRole returns false when role is absent', () => {
    const store = useAuthStore();
    store.setSessionData(makeSession({ roles: ['user'] }), {});
    expect(store.hasRole('admin')).toBe(false);
  });

  it('hasRole returns false when no session', () => {
    expect(useAuthStore().hasRole('user')).toBe(false);
  });
});

// ── login (real AuthService) ──────────────────────────────────────────────────

describe('authStore — login (real AuthService)', () => {
  it('login sets isLoading true then false on success', async () => {
    _users.push({ ...ALICE });
    const store = useAuthStore();
    const promise = store.login('alice', 'Password1!');
    expect(store.isLoading).toBe(true);
    await promise;
    expect(store.isLoading).toBe(false);
  });

  it('login sets isAuthenticated on success', async () => {
    _users.push({ ...ALICE });
    const store = useAuthStore();
    await store.login('alice', 'Password1!');
    expect(store.isAuthenticated).toBe(true);
  });

  it('login exposes userId after successful login', async () => {
    _users.push({ ...ALICE });
    const store = useAuthStore();
    await store.login('alice', 'Password1!');
    expect(store.userId).toBe('user-1');
  });

  it('login sets error message when username is not found', async () => {
    const store = useAuthStore();
    await expect(store.login('nobody', 'Password1!')).rejects.toThrow('Invalid username or password');
    expect(store.error).toBe('Invalid username or password');
    expect(store.isAuthenticated).toBe(false);
  });

  it('login sets error message when password is wrong', async () => {
    _users.push({ ...ALICE });
    const store = useAuthStore();
    await expect(store.login('alice', 'WrongPass!')).rejects.toThrow('Invalid username or password');
    expect(store.error).toBe('Invalid username or password');
    expect(store.isAuthenticated).toBe(false);
  });

  it('login sets isLoading false on failure', async () => {
    const store = useAuthStore();
    await expect(store.login('nobody', 'any')).rejects.toThrow();
    expect(store.isLoading).toBe(false);
  });
});

// ── logout (real AuthService) ─────────────────────────────────────────────────

describe('authStore — logout (real AuthService)', () => {
  it('logout clears the session', async () => {
    const store = useAuthStore();
    store.setSessionData(makeSession(), { id: 'user-1' });
    expect(store.isAuthenticated).toBe(true);
    await store.logout();
    expect(store.isAuthenticated).toBe(false);
  });

  it('logout nulls userId', async () => {
    const store = useAuthStore();
    store.setSessionData(makeSession(), { id: 'user-1' });
    await store.logout();
    expect(store.userId).toBeUndefined();
  });

  it('logout after full login flow clears session', async () => {
    _users.push({ ...ALICE });
    const store = useAuthStore();
    await store.login('alice', 'Password1!');
    expect(store.isAuthenticated).toBe(true);
    await store.logout();
    expect(store.isAuthenticated).toBe(false);
  });
});
