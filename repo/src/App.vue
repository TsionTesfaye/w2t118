<template>
  <div id="tradeloop-app">
    <ToastContainer />
    <router-view />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './app/store/authStore.js';
import { useNotificationStore } from './app/store/notificationStore.js';
import { useTransactionStore } from './app/store/transactionStore.js';
import { useModerationStore } from './app/store/moderationStore.js';
import { useUserProfile } from './composables/useUserProfile.js';
import { RouteNames } from './app/router/routeNames.js';
import { onSyncEvent, SyncEvents } from './app/bootstrap/multiTabSync.js';
import ToastContainer from './components/ToastContainer.vue';

const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const transactionStore = useTransactionStore();
const moderationStore = useModerationStore();
const { clearCache: clearProfileCache } = useUserProfile();

let unsubLogout = null;
let unsubActivity = null;

onMounted(() => {
  authStore.restoreSession();

  // Listen for logout from other tabs — perform FULL cleanup matching handleLogout in AppLayout.
  // BroadcastChannel does NOT fire in the originating tab, so this only runs in other tabs.
  unsubLogout = onSyncEvent(SyncEvents.LOGOUT, () => {
    notificationStore.reset();
    transactionStore.reset();
    moderationStore.reset();
    clearProfileCache();
    authStore.clearSession();
    router.replace({ name: RouteNames.LOGIN });
  });

  // Sync lastActivityAt from other tabs so idle timeout is tab-aware
  unsubActivity = onSyncEvent(SyncEvents.SESSION_CHANGED, ({ lastActivityAt } = {}) => {
    if (authStore.session && lastActivityAt) {
      authStore.session.lastActivityAt = lastActivityAt;
    }
  });

  // Track idle activity — throttled so mousemove/scroll don't flood storage
  let lastTouch = 0;
  const touch = () => {
    const ts = Date.now();
    if (ts - lastTouch > 10000) { // persist at most every 10 seconds
      lastTouch = ts;
      authStore.touchActivity();
    }
  };
  window.addEventListener('click', touch);
  window.addEventListener('keydown', touch);
  window.addEventListener('scroll', touch, { passive: true });
  window.addEventListener('mousemove', touch, { passive: true });
  window.addEventListener('touchstart', touch, { passive: true });

  // Periodic session validity check
  const interval = setInterval(() => {
    if (authStore.isAuthenticated) {
      authStore.checkSessionValidity();
    }
  }, 30000);

  onUnmounted(() => {
    window.removeEventListener('click', touch);
    window.removeEventListener('keydown', touch);
    window.removeEventListener('scroll', touch);
    window.removeEventListener('mousemove', touch);
    window.removeEventListener('touchstart', touch);
    clearInterval(interval);
    if (unsubLogout) unsubLogout();
    if (unsubActivity) unsubActivity();
  });
});
</script>
