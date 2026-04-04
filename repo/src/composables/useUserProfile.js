/**
 * useUserProfile composable
 *
 * Module-level cache avoids duplicate fetches for the same userId within a
 * browser session. Components call getProfile(userId) and get the cached
 * result on subsequent renders.
 */

import { UserService } from '../services/UserService.js';
import { useAuthStore } from '../app/store/authStore.js';

// Module-level cache — survives component re-mounts, cleared on logout
const _cache = new Map();

export function useUserProfile() {
  const authStore = useAuthStore();

  /**
   * Returns the sanitized profile for userId, using the cache.
   * Returns null silently on error (session expired, user deleted, etc.)
   *
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async function getProfile(userId) {
    if (!userId) return null;
    if (_cache.has(userId)) return _cache.get(userId);

    try {
      const profile = await UserService.getProfile(authStore.session, userId);
      _cache.set(userId, profile);
      return profile;
    } catch {
      return null;
    }
  }

  /** Invalidate a single entry (call after profile update). */
  function invalidate(userId) {
    _cache.delete(userId);
  }

  /** Full cache flush (call on logout). */
  function clearCache() {
    _cache.clear();
  }

  return { getProfile, invalidate, clearCache };
}
