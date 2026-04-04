/**
 * Login Throttle Storage
 *
 * Persists pre-lookup login throttle state so that lockouts survive page
 * reloads and are shared across tabs.
 *
 * Browser:  state is written to localStorage under STORAGE_KEY.
 * Node.js:  state is held in an in-memory object (same semantics, no LS).
 *
 * Shape of each entry:
 *   { attempts: number, windowStart: number|null, lockUntil: number|null }
 *
 * Public API:
 *   LoginThrottleStorage.get(key)           → entry | null
 *   LoginThrottleStorage.set(key, entry)
 *   LoginThrottleStorage.delete(key)
 *   LoginThrottleStorage.getAll()           → { [key]: entry }
 *   LoginThrottleStorage.replaceAll(data)   → overwrite whole store (used for pruning)
 *
 * Testing:
 *   _overrideLoginThrottleStorage(backend)  → swap backend; returns previous
 *   makeThrottleMemoryBackend()             → create a fresh in-memory backend
 */

export const THROTTLE_STORAGE_KEY = 'tradeloop_login_throttle';

function makeLocalStorageBackend() {
  return {
    read() {
      try {
        const raw = localStorage.getItem(THROTTLE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    },
    write(data) {
      try {
        localStorage.setItem(THROTTLE_STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage quota exceeded — fail open so login is never permanently broken
      }
    },
  };
}

/**
 * Creates a fresh in-memory backend (used in Node.js and for test injection).
 * Each call returns a new independent store object.
 */
export function makeThrottleMemoryBackend() {
  let store = {};
  return {
    read() { return { ...store }; },
    write(data) { store = { ...data }; },
  };
}

// Default backend: localStorage in browser, memory otherwise
let _backend = typeof localStorage !== 'undefined'
  ? makeLocalStorageBackend()
  : makeThrottleMemoryBackend();

/**
 * Replace the storage backend. Returns the previous backend.
 * FOR TESTING ONLY — never call this in production paths.
 */
export function _overrideLoginThrottleStorage(backend) {
  const prev = _backend;
  _backend = backend;
  return prev;
}

export const LoginThrottleStorage = {
  /** Get a single entry by normalized username key, or null. */
  get(key) {
    const all = _backend.read();
    return all[key] || null;
  },

  /** Write a single entry. */
  set(key, entry) {
    const all = _backend.read();
    all[key] = entry;
    _backend.write(all);
  },

  /** Remove a single entry (e.g. on successful login). */
  delete(key) {
    const all = _backend.read();
    delete all[key];
    _backend.write(all);
  },

  /** Return a snapshot of all entries (for pruning). */
  getAll() {
    return _backend.read();
  },

  /** Overwrite the entire store (used by the prune pass). */
  replaceAll(data) {
    _backend.write(data);
  },
};
