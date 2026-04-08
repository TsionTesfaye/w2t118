<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Admin Dashboard</h1>
    </div>

    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <AdminAnalyticsTab   v-if="activeTab === 'analytics'"  :session="session" />
    <AdminUsersTab       v-if="activeTab === 'users'"       :session="session" />
    <AdminCategoriesTab  v-if="activeTab === 'categories'"  :session="session" />
    <AdminDeliveryTab    v-if="activeTab === 'delivery'"    :session="session" />
    <AdminAuditTab       v-if="activeTab === 'audit'"       :session="session" />
    <AdminDataTab        v-if="activeTab === 'data'"        :session="session" />
    <AdminDictionaryTab  v-if="activeTab === 'dictionary'"  :session="session" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useAuthStore } from '../../app/store/authStore.js';

import AdminAnalyticsTab  from './tabs/AdminAnalyticsTab.vue';
import AdminUsersTab      from './tabs/AdminUsersTab.vue';
import AdminCategoriesTab from './tabs/AdminCategoriesTab.vue';
import AdminDeliveryTab   from './tabs/AdminDeliveryTab.vue';
import AdminAuditTab      from './tabs/AdminAuditTab.vue';
import AdminDataTab       from './tabs/AdminDataTab.vue';
import AdminDictionaryTab from './tabs/AdminDictionaryTab.vue';

// ── Props & Routing ──

const props = defineProps({
  tab: { type: String, default: 'analytics' },
});

const authStore = useAuthStore();
const session = computed(() => authStore.session);

const tabs = [
  { key: 'analytics',  label: 'Analytics' },
  { key: 'users',      label: 'Users' },
  { key: 'categories', label: 'Categories' },
  { key: 'delivery',   label: 'Delivery' },
  { key: 'audit',      label: 'Audit' },
  { key: 'data',       label: 'Data' },
  { key: 'dictionary', label: 'Dictionary' },
];

const ALLOWED_TABS = ['analytics', 'users', 'categories', 'delivery', 'audit', 'data', 'dictionary'];
function normalizeTab(t) { return ALLOWED_TABS.includes(t) ? t : 'analytics'; }

const activeTab = ref(normalizeTab(props.tab));
watch(() => props.tab, (t) => { activeTab.value = normalizeTab(t); });
</script>

<style scoped>
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #888);
}

.pagination-controls {
  justify-content: center;
}

.hint {
  font-style: italic;
}
</style>
