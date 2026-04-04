<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Welcome back, {{ displayName }}</h1>
      <p>What would you like to do today?</p>
    </div>

    <div class="stats-grid">
      <!-- Common quick actions -->
      <router-link :to="{ name: RouteNames.MARKETPLACE }" class="stat-card card">
        <h3>Browse Marketplace</h3>
        <p>Discover listings from other traders</p>
      </router-link>

      <router-link :to="{ name: RouteNames.CREATE_LISTING }" class="stat-card card">
        <h3>Create Listing</h3>
        <p>Post a new item for sale or trade</p>
      </router-link>

      <router-link :to="{ name: RouteNames.THREADS }" class="stat-card card">
        <h3>My Messages</h3>
        <p>View your conversations</p>
      </router-link>

      <router-link :to="{ name: RouteNames.USER_CENTER }" class="stat-card card">
        <h3>User Center</h3>
        <p>Manage your profile and settings</p>
      </router-link>

      <!-- Role-specific quick actions -->
      <router-link
        v-if="authStore.hasRole(Roles.MODERATOR) || authStore.hasRole(Roles.ADMIN)"
        :to="{ name: RouteNames.MODERATION, params: { tab: 'queue' } }"
        class="stat-card card"
      >
        <h3>Review Queue</h3>
        <p>Review flagged content and reports</p>
      </router-link>

      <router-link
        v-if="authStore.hasRole(Roles.SUPPORT_AGENT) || authStore.hasRole(Roles.ADMIN)"
        :to="{ name: RouteNames.SUPPORT, params: { tab: 'complaints' } }"
        class="stat-card card"
      >
        <h3>Complaint Queue</h3>
        <p>Handle user complaints and disputes</p>
      </router-link>

      <router-link
        v-if="authStore.hasRole(Roles.ADMIN)"
        :to="{ name: RouteNames.ADMIN }"
        class="stat-card card"
      >
        <h3>Admin Dashboard</h3>
        <p>System administration and analytics</p>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../app/store/authStore.js';
import { Roles } from '../domain/enums/roles.js';
import { RouteNames } from '../app/router/routeNames.js';

const authStore = useAuthStore();

const displayName = computed(() => {
  const user = authStore.currentUser;
  if (!user) return '';
  return user.displayName || user.username || '';
});
</script>
