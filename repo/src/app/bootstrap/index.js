/**
 * App Bootstrap — initializes database, session, and periodic tasks.
 */

import { getDatabase } from '../../repositories/database.js';
import { AuthService } from '../../services/AuthService.js';
import { TransactionService } from '../../services/TransactionService.js';
import { InitService } from '../../services/InitService.js';
import { initMultiTabSync } from './multiTabSync.js';

const RESERVATION_CHECK_INTERVAL = 60 * 1000; // 1 minute
let reservationTimer = null;

/**
 * Cached initialization state.
 * null  = not yet checked
 * true  = system has an admin user (initialized)
 * false = fresh install, setup required
 */
let _initialized = null;

/**
 * Initialize the application.
 * Must be called before any service operations.
 */
export async function bootstrapApp() {
  // 1. Initialize IndexedDB
  await getDatabase();

  // 2. Restore session (if any)
  const session = AuthService.getCurrentSession();

  // 3. Check and cache initialization state (admin user exists?)
  _initialized = await InitService.isInitialized();

  // 4. Start periodic reservation expiry check
  startReservationChecker();

  // 5. Initialize multi-tab sync
  initMultiTabSync();

  return { session };
}

/**
 * Returns the cached initialization state.
 * Always call bootstrapApp() before relying on this.
 */
export function getInitializationState() {
  return _initialized;
}

/**
 * Mark the system as initialized after first-run setup completes.
 * Called by SetupView once the admin account is created.
 */
export function markSystemInitialized() {
  _initialized = true;
}

/**
 * Start periodic check for expired reservations.
 */
function startReservationChecker() {
  if (reservationTimer) clearInterval(reservationTimer);
  reservationTimer = setInterval(async () => {
    try {
      await TransactionService.expireStaleReservations();
    } catch (e) {
      console.error('Reservation expiry check failed:', e);
    }
  }, RESERVATION_CHECK_INTERVAL);
}

/**
 * Stop periodic checks (for cleanup/testing).
 */
export function stopPeriodicTasks() {
  if (reservationTimer) {
    clearInterval(reservationTimer);
    reservationTimer = null;
  }
}
