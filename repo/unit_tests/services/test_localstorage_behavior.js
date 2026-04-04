/**
 * LocalStorage Behavior Tests
 *
 * Verifies that preferences and session data are persisted to/from localStorage:
 *   - Theme persists across set/get cycles
 *   - Notification preferences persist correctly
 *   - Session is stored on login and cleared on logout
 *   - LocalStorageAdapter handles JSON serialization correctly
 *   - Default values are returned when keys are absent
 *   - Namespace prefix prevents collisions with other apps
 *   - StorageKeys constants match expected key names
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import {
  LocalStorageAdapter,
  StorageKeys,
} from '../../src/repositories/localStorageAdapter.js';

const suite = new TestRunner('LocalStorage Behavior');

// ── localStorage stub ──
const _store = new Map();
globalThis.localStorage = {
  _data: _store,
  getItem:    (k) => _store.get(k) ?? null,
  setItem:    (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
  clear:      () => _store.clear(),
  get length() { return _store.size; },
  key: (i) => Array.from(_store.keys())[i] ?? null,
};

function clearStorage() {
  _store.clear();
}

// ══════════════════════════════════════════════════════════
//  LocalStorageAdapter: BASIC GET/SET
// ══════════════════════════════════════════════════════════

suite.test('set then get returns the stored value', () => {
  clearStorage();
  LocalStorageAdapter.set('test_key', 'hello');
  const val = LocalStorageAdapter.get('test_key');
  assertEqual(val, 'hello', 'get must return the value that was set');
});

suite.test('get returns defaultValue when key is absent', () => {
  clearStorage();
  const val = LocalStorageAdapter.get('nonexistent', 'default_val');
  assertEqual(val, 'default_val', 'Must return default when key does not exist');
});

suite.test('get returns null defaultValue by default', () => {
  clearStorage();
  const val = LocalStorageAdapter.get('nonexistent');
  assertEqual(val, null, 'Must return null when no default specified and key absent');
});

suite.test('set stores values as JSON-serialized strings', () => {
  clearStorage();
  LocalStorageAdapter.set('obj_key', { a: 1, b: 'two' });
  const raw = _store.get('tradeloop_obj_key');
  assert(typeof raw === 'string', 'Value must be stored as a string');
  const parsed = JSON.parse(raw);
  assertEqual(parsed.a, 1);
  assertEqual(parsed.b, 'two');
});

suite.test('get deserializes JSON objects correctly', () => {
  clearStorage();
  LocalStorageAdapter.set('prefs', { theme: 'dark', notifications: true });
  const val = LocalStorageAdapter.get('prefs');
  assertEqual(val.theme, 'dark');
  assertEqual(val.notifications, true);
});

suite.test('remove deletes the key', () => {
  clearStorage();
  LocalStorageAdapter.set('to_remove', 'value');
  LocalStorageAdapter.remove('to_remove');
  const val = LocalStorageAdapter.get('to_remove');
  assertEqual(val, null, 'Removed key must return null');
});

// ══════════════════════════════════════════════════════════
//  NAMESPACE PREFIX
// ══════════════════════════════════════════════════════════

suite.test('keys are namespaced with tradeloop_ prefix', () => {
  clearStorage();
  LocalStorageAdapter.set('mykey', 'myvalue');
  assert(_store.has('tradeloop_mykey'), 'Key must be stored with tradeloop_ prefix');
  assert(!_store.has('mykey'), 'Unprefixed key must NOT exist in storage');
});

suite.test('clear removes only tradeloop_ namespaced keys', () => {
  clearStorage();
  // Simulate an external app key
  _store.set('other_app_key', 'external_data');
  LocalStorageAdapter.set('theme', 'dark');
  LocalStorageAdapter.set('session', 'session_token');

  LocalStorageAdapter.clear();

  assert(!_store.has('tradeloop_theme'), 'TradeLoop key must be cleared');
  assert(!_store.has('tradeloop_session'), 'TradeLoop session key must be cleared');
  assert(_store.has('other_app_key'), 'External app keys must not be cleared');
});

// ══════════════════════════════════════════════════════════
//  THEME PERSISTENCE
// ══════════════════════════════════════════════════════════

suite.test('theme persists after being set', () => {
  clearStorage();
  LocalStorageAdapter.set(StorageKeys.THEME, 'dark');
  const theme = LocalStorageAdapter.get(StorageKeys.THEME, 'light');
  assertEqual(theme, 'dark', 'Theme must persist after being set');
});

suite.test('theme defaults to light when not set', () => {
  clearStorage();
  const theme = LocalStorageAdapter.get(StorageKeys.THEME, 'light');
  assertEqual(theme, 'light', 'Default theme must be light');
});

suite.test('theme can be changed from dark back to light', () => {
  clearStorage();
  LocalStorageAdapter.set(StorageKeys.THEME, 'dark');
  LocalStorageAdapter.set(StorageKeys.THEME, 'light');
  const theme = LocalStorageAdapter.get(StorageKeys.THEME, 'light');
  assertEqual(theme, 'light', 'Theme must update correctly');
});

// ══════════════════════════════════════════════════════════
//  NOTIFICATION PREFERENCES PERSISTENCE
// ══════════════════════════════════════════════════════════

suite.test('notification preferences persist after being set', () => {
  clearStorage();
  const prefs = { transactions: true, messages: false, moderation: true };
  LocalStorageAdapter.set(StorageKeys.NOTIFICATION_PREFS, prefs);
  const stored = LocalStorageAdapter.get(StorageKeys.NOTIFICATION_PREFS, {});
  assertEqual(stored.transactions, true);
  assertEqual(stored.messages, false);
  assertEqual(stored.moderation, true);
});

suite.test('notification preferences default to empty object when not set', () => {
  clearStorage();
  const prefs = LocalStorageAdapter.get(StorageKeys.NOTIFICATION_PREFS, {});
  assert(typeof prefs === 'object' && prefs !== null, 'Default must be an object');
  assertEqual(Object.keys(prefs).length, 0, 'Default must be empty');
});

suite.test('notification preference update merges correctly', () => {
  clearStorage();
  const initial = { transactions: true, messages: true };
  LocalStorageAdapter.set(StorageKeys.NOTIFICATION_PREFS, initial);

  // Simulate a toggle: turn off messages
  const current = LocalStorageAdapter.get(StorageKeys.NOTIFICATION_PREFS, {});
  const updated = { ...current, messages: false };
  LocalStorageAdapter.set(StorageKeys.NOTIFICATION_PREFS, updated);

  const final = LocalStorageAdapter.get(StorageKeys.NOTIFICATION_PREFS, {});
  assertEqual(final.transactions, true, 'Transactions pref must be unchanged');
  assertEqual(final.messages, false, 'Messages pref must be updated');
});

// ══════════════════════════════════════════════════════════
//  SESSION PERSISTENCE
// ══════════════════════════════════════════════════════════

suite.test('session data persists when stored', () => {
  clearStorage();
  const session = {
    id: 'sess-1', userId: 'user-1', roles: ['user'],
    lastActivityAt: Date.now(), createdAt: Date.now(),
  };
  LocalStorageAdapter.set(StorageKeys.SESSION, session);
  const stored = LocalStorageAdapter.get(StorageKeys.SESSION);
  assertEqual(stored.id, 'sess-1');
  assertEqual(stored.userId, 'user-1');
});

suite.test('session is null when not set (unauthenticated state)', () => {
  clearStorage();
  const session = LocalStorageAdapter.get(StorageKeys.SESSION);
  assertEqual(session, null, 'Session must be null when not authenticated');
});

suite.test('session is cleared after remove', () => {
  clearStorage();
  LocalStorageAdapter.set(StorageKeys.SESSION, { id: 'sess-2', userId: 'user-2' });
  LocalStorageAdapter.remove(StorageKeys.SESSION);
  const session = LocalStorageAdapter.get(StorageKeys.SESSION);
  assertEqual(session, null, 'Session must be null after logout');
});

// ══════════════════════════════════════════════════════════
//  StorageKeys CONSTANTS
// ══════════════════════════════════════════════════════════

suite.test('StorageKeys.THEME is the string "theme"', () => {
  assertEqual(StorageKeys.THEME, 'theme');
});

suite.test('StorageKeys.NOTIFICATION_PREFS is the string "notification_prefs"', () => {
  assertEqual(StorageKeys.NOTIFICATION_PREFS, 'notification_prefs');
});

suite.test('StorageKeys.SESSION is the string "session"', () => {
  assertEqual(StorageKeys.SESSION, 'session');
});

suite.test('StorageKeys is frozen (immutable)', () => {
  assert(Object.isFrozen(StorageKeys), 'StorageKeys must be frozen');
});

// ══════════════════════════════════════════════════════════
//  RESILIENCE: MALFORMED DATA
// ══════════════════════════════════════════════════════════

suite.test('get returns default when stored value is malformed JSON', () => {
  clearStorage();
  // Bypass LocalStorageAdapter to inject malformed data
  _store.set('tradeloop_corrupt_key', 'not{valid}json');
  const val = LocalStorageAdapter.get('corrupt_key', 'fallback');
  assertEqual(val, 'fallback', 'Must return default on JSON parse failure');
});

suite.test('get handles null raw value gracefully', () => {
  clearStorage();
  // Key doesn't exist — getItem returns null
  const val = LocalStorageAdapter.get('missing_key', 42);
  assertEqual(val, 42, 'Must return numeric default for missing key');
});

const results = await suite.run();
process.exitCode = results.failed > 0 ? 1 : 0;
