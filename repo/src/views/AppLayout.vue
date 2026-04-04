<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-logo">
        <router-link :to="{ name: RouteNames.HOME }">TradeLoop</router-link>
      </div>

      <nav class="sidebar-nav">
        <!-- Marketplace -->
        <div class="sidebar-section">
          <span class="sidebar-section-title">Marketplace</span>
          <router-link
            :to="{ name: RouteNames.HOME }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.HOME }"
          >
            Home
          </router-link>
          <router-link
            :to="{ name: RouteNames.MARKETPLACE }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.MARKETPLACE && !route.query.mine }"
          >
            Browse Marketplace
          </router-link>
          <router-link
            :to="{ name: RouteNames.MARKETPLACE, query: { mine: '1' } }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.MARKETPLACE && route.query.mine === '1' }"
          >
            My Listings
          </router-link>
        </div>

        <!-- Messaging -->
        <div class="sidebar-section">
          <span class="sidebar-section-title">Messaging</span>
          <router-link
            :to="{ name: RouteNames.THREADS }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.THREADS || routeName === RouteNames.THREAD_DETAIL }"
          >
            Messages
            <span v-if="unreadNotificationCount > 0" class="nav-badge">
              {{ unreadNotificationCount }}
            </span>
          </router-link>
        </div>

        <!-- User -->
        <div class="sidebar-section">
          <span class="sidebar-section-title">Account</span>
          <router-link
            :to="{ name: RouteNames.USER_CENTER }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.USER_CENTER }"
          >
            User Center
          </router-link>
        </div>

        <!-- Moderation (moderator or admin) -->
        <div v-if="authStore.hasRole(Roles.MODERATOR) || authStore.hasRole(Roles.ADMIN)" class="sidebar-section">
          <span class="sidebar-section-title">Moderation</span>
          <router-link
            :to="{ name: RouteNames.MODERATION, params: { tab: 'queue' } }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.MODERATION }"
          >
            Review Queue
          </router-link>
        </div>

        <!-- Support (support_agent or admin) -->
        <div v-if="authStore.hasRole(Roles.SUPPORT_AGENT) || authStore.hasRole(Roles.ADMIN)" class="sidebar-section">
          <span class="sidebar-section-title">Support</span>
          <router-link
            :to="{ name: RouteNames.SUPPORT, params: { tab: 'complaints' } }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.SUPPORT }"
          >
            Complaints
          </router-link>
        </div>

        <!-- Admin -->
        <div v-if="authStore.hasRole(Roles.ADMIN)" class="sidebar-section">
          <span class="sidebar-section-title">Administration</span>
          <router-link
            :to="{ name: RouteNames.ADMIN }"
            class="nav-item"
            :class="{ active: routeName === RouteNames.ADMIN }"
          >
            Admin Dashboard
          </router-link>
        </div>
      </nav>
    </aside>

    <div class="main-content">
      <header class="topbar">
        <div class="topbar-spacer"></div>
        <div class="topbar-actions">
          <router-link
            :to="{ name: RouteNames.USER_CENTER, params: { tab: 'notifications' } }"
            class="btn btn-ghost topbar-notifications"
          >
            <span class="notification-bell">&#128276;</span>
            <span v-if="unreadNotificationCount > 0" class="badge">
              {{ unreadNotificationCount }}
            </span>
          </router-link>
          <router-link
            :to="{ name: RouteNames.USER_CENTER, params: { tab: 'profile' } }"
            class="topbar-user"
            title="View profile"
          >
            <UserAvatar
              :userId="authStore.userId"
              :avatar-url="authStore.currentUser?.avatar || null"
              :display-name="displayName"
              size="sm"
            />
            <span class="topbar-username">{{ displayName }}</span>
          </router-link>
          <button class="btn btn-ghost" @click="handleLogout">
            Logout
          </button>
        </div>
      </header>

      <div class="page-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../app/store/authStore.js';
import { useNotificationStore } from '../app/store/notificationStore.js';
import { useTransactionStore } from '../app/store/transactionStore.js';
import { useModerationStore } from '../app/store/moderationStore.js';
import { useToast } from '../composables/useToast.js';
import { useUserProfile } from '../composables/useUserProfile.js';
import { Roles } from '../domain/enums/roles.js';
import { RouteNames } from '../app/router/routeNames.js';
import UserAvatar from '../components/UserAvatar.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const transactionStore = useTransactionStore();
const moderationStore = useModerationStore();
const toast = useToast();
const { clearCache: clearProfileCache } = useUserProfile();

const routeName = computed(() => route.name);
const unreadNotificationCount = computed(() => notificationStore.unreadCount);

const displayName = computed(() => {
  const user = authStore.currentUser;
  if (!user) return '';
  return user.displayName || user.username || '';
});

async function handleLogout() {
  // Reset all user-scoped stores to prevent data leaking to the next session
  notificationStore.reset();
  transactionStore.reset();
  moderationStore.reset();
  clearProfileCache();
  await authStore.logout();
  toast.success('You have been signed out');
  router.push({ name: RouteNames.LOGIN });
}

onMounted(() => {
  notificationStore.startPolling(() => authStore.session);
});

onBeforeUnmount(() => {
  notificationStore.stopPolling();
});
</script>
