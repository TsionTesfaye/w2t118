import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { AuthService } from '../../services/AuthService.js';
import { validateSession } from '../../domain/policies/sessionPolicy.js';
import { broadcastSync, SyncEvents } from '../bootstrap/multiTabSync.js';
import { LocalStorageAdapter, StorageKeys } from '../../repositories/localStorageAdapter.js';
import { useToast } from '../../composables/useToast.js';

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null);
  const currentUser = ref(null);
  const isLoading = ref(false);
  const error = ref(null);

  const isAuthenticated = computed(() => !!session.value?.userId);
  const userId = computed(() => session.value?.userId);
  const roles = computed(() => session.value?.roles || []);
  const hasRole = (role) => roles.value.includes(role);

  function setSessionData(s, u) {
    session.value = s;
    currentUser.value = u;
    error.value = null;
  }

  function clearSession() {
    session.value = null;
    currentUser.value = null;
  }

  function restoreSession() {
    const s = AuthService.getCurrentSession();
    if (s) {
      session.value = s;
    }
  }

  function touchActivity() {
    if (session.value) {
      const updated = { ...session.value, lastActivityAt: Date.now() };
      session.value = updated;
      // Persist so idle timeout survives page reloads and other tabs can sync
      LocalStorageAdapter.set(StorageKeys.SESSION, updated);
      broadcastSync(SyncEvents.SESSION_CHANGED, { lastActivityAt: updated.lastActivityAt });
    }
  }

  function checkSessionValidity() {
    if (!session.value) return;
    try {
      validateSession(session.value);
    } catch {
      clearSession();
      AuthService.logout().catch(() => {});
    }
  }

  /**
   * Re-read and validate the session from localStorage on every navigation.
   *
   * This is the authoritative source-of-truth check: the in-memory Pinia ref
   * can lag behind the persisted value (e.g. when a test back-dates
   * lastActivityAt, or when another tab updated the session).
   *
   * Returns true if the session is still valid (and syncs in-memory state),
   * false if it was expired or missing (clears in-memory state).
   */
  function syncFromStorage() {
    // getCurrentSession reads from localStorage, validates both timeouts,
    // and removes the key if expired — returning null in that case.
    const fresh = AuthService.getCurrentSession();
    if (!fresh) {
      clearSession();
      return false;
    }
    // Keep in-memory ref in sync (lastActivityAt may differ).
    session.value = fresh;
    return true;
  }

  async function register(data) {
    isLoading.value = true;
    error.value = null;
    try {
      const user = await AuthService.register(data);
      return user;
    } catch (e) {
      error.value = e.message || 'Registration failed';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function login(username, password) {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await AuthService.login(username, password);
      setSessionData(result.session, result.user);
      return result;
    } catch (e) {
      error.value = e.message || 'Login failed';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  async function logout() {
    try {
      await AuthService.logout();
    } catch { /* ignore */ }
    clearSession();
    broadcastSync(SyncEvents.LOGOUT);
  }

  async function recoverPassword(username, answers, newPassword) {
    isLoading.value = true;
    error.value = null;
    try {
      return await AuthService.recoverPassword(username, answers, newPassword);
    } catch (e) {
      error.value = e.message || 'Recovery failed';
      throw e;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    session, currentUser, isLoading, error,
    isAuthenticated, userId, roles, hasRole,
    setSessionData, clearSession, restoreSession,
    touchActivity, checkSessionValidity, syncFromStorage,
    register, login, logout, recoverPassword,
  };
});
