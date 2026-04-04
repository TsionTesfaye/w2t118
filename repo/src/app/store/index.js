/**
 * Centralized Store Foundation
 * Reactive state management for cross-component consistency.
 * In a Vue app, this would be Pinia/Vuex. Here we define the state shape
 * and accessors that the store modules will implement.
 *
 * Store responsibilities:
 * - Session state (current user, roles)
 * - UI state (active route, modals, drawers)
 * - Cached data (unread counts, review queue counts)
 * - Transaction state for active flows
 *
 * Store does NOT contain business logic — it delegates to services.
 */

/**
 * Application state shape.
 * This defines what the centralized store manages.
 */
export function createInitialState() {
  return {
    // Auth
    session: null,
    currentUser: null,

    // UI
    activeRoute: '/',
    isLoading: false,
    error: null,

    // Notifications
    unreadNotificationCount: 0,

    // Moderation
    reviewQueueCount: 0,

    // Support
    openComplaintCount: 0,

    // Theme
    theme: 'light',
  };
}

/**
 * Simple reactive store (framework-agnostic foundation).
 * Vue integration would wrap this with reactive()/ref().
 */
export class Store {
  constructor() {
    this.state = createInitialState();
    this._subscribers = [];
  }

  /**
   * Update state and notify subscribers.
   */
  commit(key, value) {
    if (!(key in this.state)) {
      throw new Error(`Unknown state key: ${key}`);
    }
    this.state[key] = value;
    this._notify(key, value);
  }

  /**
   * Get state value.
   */
  get(key) {
    return this.state[key];
  }

  /**
   * Subscribe to state changes.
   * @param {Function} callback - (key, value) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== callback);
    };
  }

  /**
   * Reset store to initial state.
   */
  reset() {
    this.state = createInitialState();
    this._notify('*', null);
  }

  _notify(key, value) {
    for (const cb of this._subscribers) {
      try {
        cb(key, value);
      } catch (e) {
        console.error('Store subscriber error:', e);
      }
    }
  }
}

// Singleton store instance
export const store = new Store();
