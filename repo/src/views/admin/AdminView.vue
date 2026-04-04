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

    <!-- ═══════════════════ ANALYTICS TAB ═══════════════════ -->
    <div v-if="activeTab === 'analytics'">
      <div v-if="analyticsLoading" class="loading-state">Loading analytics...</div>
      <template v-else>
        <div class="stats-grid" data-testid="admin-stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Listings</div>
            <div class="stat-value">{{ kpis?.postVolume?.total ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Claim Rate (%)</div>
            <div class="stat-value">{{ kpis?.claimRate?.percentage ?? 0 }}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg Handling Time (hours)</div>
            <div class="stat-value">{{ kpis?.avgHandlingTime?.averageHours ?? 0 }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Transactions</div>
            <div class="stat-value">{{ kpis?.claimRate?.totalTransactions ?? 0 }}</div>
          </div>
        </div>

        <div class="card" style="margin-top: 1.5rem;">
          <div class="card-header">
            <h3>Trends</h3>
            <div style="display: flex; gap: 0.75rem;">
              <select v-model="trendMetric" class="form-select">
                <option value="listings">Listings</option>
                <option value="transactions">Transactions</option>
                <option value="complaints">Complaints</option>
              </select>
              <select v-model.number="trendPeriod" class="form-select">
                <option :value="7">7 days</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
              </select>
              <button class="btn btn-primary" @click="loadTrends">Load</button>
            </div>
          </div>
          <div v-if="trendsLoading" class="loading-state">Loading trends...</div>
          <EmptyState
            v-else-if="trendData.length === 0"
            icon="&#128202;"
            title="No trend data"
            message="Select a metric and period, then click Load."
          />
          <div v-else class="bar-chart">
            <div
              v-for="bucket in trendData"
              :key="bucket.date"
              class="bar"
              :style="{ height: barHeight(bucket.count) + '%' }"
              :title="`${bucket.date}: ${bucket.count}`"
            >
              <span class="bar-label">{{ bucket.count }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ═══════════════════ USERS TAB ═══════════════════ -->
    <div v-if="activeTab === 'users'">
      <div v-if="usersLoading" class="loading-state">Loading users...</div>
      <EmptyState
        v-else-if="users.length === 0"
        icon="&#128100;"
        title="No users"
        message="No user accounts found."
      />
      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Roles</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username }}</td>
              <td>{{ user.displayName || '-' }}</td>
              <td>
                <span v-for="role in user.roles" :key="role" class="badge" style="margin-right: 0.25rem;">
                  {{ role }}
                </span>
              </td>
              <td>{{ formatDate(user.createdAt) }}</td>
              <td>
                <button class="btn btn-sm" @click="openRoleModal(user)">Manage Roles</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Role Management Modal -->
      <AppModal v-model="roleModalOpen" title="Manage Roles" max-width="420px">
        <div v-if="roleTarget">
          <p style="margin-bottom: 1rem;">
            Editing roles for <strong>{{ roleTarget.username }}</strong>
          </p>
          <div v-for="role in ALL_ROLES" :key="role" class="form-group" style="margin-bottom: 0.5rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input
                type="checkbox"
                :checked="roleSelections[role]"
                @change="roleSelections[role] = $event.target.checked"
              />
              {{ role }}
            </label>
          </div>
        </div>
        <template #footer>
          <button class="btn btn-secondary" @click="roleModalOpen = false">Cancel</button>
          <button class="btn btn-primary" :disabled="roleSaving" @click="saveRoles">
            {{ roleSaving ? 'Saving...' : 'Save Roles' }}
          </button>
        </template>
      </AppModal>
    </div>

    <!-- ═══════════════════ CATEGORIES TAB ═══════════════════ -->
    <div v-if="activeTab === 'categories'">
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header">
          <h3>{{ editingCategory ? 'Edit Category' : 'Add Category' }}</h3>
        </div>
        <form @submit.prevent="editingCategory ? submitUpdateCategory() : submitCreateCategory()" style="padding: 1rem;">
          <div class="form-group">
            <label>Name</label>
            <input v-model="categoryForm.name" class="form-input" required placeholder="Category name" />
          </div>
          <div class="form-group">
            <label>Parent</label>
            <select v-model="categoryForm.parentId" class="form-select">
              <option :value="null">None (root)</option>
              <option
                v-for="cat in allCategories"
                :key="cat.id"
                :value="cat.id"
                :disabled="editingCategory && cat.id === editingCategory.id"
              >
                {{ cat.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Sort Order</label>
            <input v-model.number="categoryForm.sortOrder" type="number" class="form-input" min="0" />
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="submit" class="btn btn-primary" :disabled="categorySaving">
              {{ editingCategory ? 'Update' : 'Create' }}
            </button>
            <button v-if="editingCategory" type="button" class="btn btn-secondary" @click="cancelEditCategory">
              Cancel
            </button>
          </div>
        </form>
      </div>

      <div v-if="categoriesLoading" class="loading-state">Loading categories...</div>
      <EmptyState
        v-else-if="categoryTree.length === 0"
        icon="&#128193;"
        title="No categories"
        message="Create your first category above."
      />
      <div v-else class="card">
        <div class="card-header"><h3>Category Tree</h3></div>
        <ul class="category-tree">
          <template v-for="node in categoryTree" :key="node.id">
            <li class="category-node">
              <div class="category-node-row">
                <span class="category-name">{{ node.name }}</span>
                <span class="badge" style="margin-left: 0.5rem;">#{{ node.sortOrder }}</span>
                <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(node)">Edit</button>
              </div>
              <ul v-if="node.children && node.children.length > 0" class="category-tree-children">
                <template v-for="child in node.children" :key="child.id">
                  <li class="category-node" style="padding-left: 1.5rem;">
                    <div class="category-node-row">
                      <span class="category-name">{{ child.name }}</span>
                      <span class="badge" style="margin-left: 0.5rem;">#{{ child.sortOrder }}</span>
                      <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(child)">Edit</button>
                    </div>
                    <ul v-if="child.children && child.children.length > 0" class="category-tree-children">
                      <template v-for="grandchild in child.children" :key="grandchild.id">
                        <li class="category-node" style="padding-left: 3rem;">
                          <div class="category-node-row">
                            <span class="category-name">{{ grandchild.name }}</span>
                            <span class="badge" style="margin-left: 0.5rem;">#{{ grandchild.sortOrder }}</span>
                            <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(grandchild)">Edit</button>
                          </div>
                        </li>
                      </template>
                    </ul>
                  </li>
                </template>
              </ul>
            </li>
          </template>
        </ul>
      </div>
    </div>

    <!-- ═══════════════════ DELIVERY TAB ═══════════════════ -->
    <AdminDeliveryTab v-if="activeTab === 'delivery'" :session="session" />

    <!-- ═══════════════════ AUDIT TAB ═══════════════════ -->
    <div v-if="activeTab === 'audit'">
      <div v-if="auditLoading" class="loading-state">Loading audit logs...</div>
      <EmptyState
        v-else-if="auditLogs.length === 0"
        icon="&#128220;"
        title="No audit logs"
        message="No activity has been recorded yet."
      />
      <template v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity Type</th>
                <th>Entity ID</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in paginatedAuditLogs" :key="log.id">
                <td>{{ formatTimestamp(log.timestamp) }}</td>
                <td>{{ log.actorId }}</td>
                <td>{{ log.action }}</td>
                <td>{{ log.entityType }}</td>
                <td><code>{{ log.entityId }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination-controls" style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: center; justify-content: center;">
          <button
            class="btn btn-sm"
            :disabled="auditPage <= 1"
            @click="auditPage--"
          >
            Previous
          </button>
          <span>Page {{ auditPage }} of {{ auditTotalPages }}</span>
          <button
            class="btn btn-sm"
            :disabled="auditPage >= auditTotalPages"
            @click="auditPage++"
          >
            Next
          </button>
        </div>
      </template>
    </div>

    <!-- ═══════════════════ DATA TAB ═══════════════════ -->
    <div v-if="activeTab === 'data'">
      <!-- Redacted Snapshot -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header"><h3>Redacted Snapshot (Safe / Compliance)</h3></div>
        <div style="padding: 1rem;">
          <p style="margin-bottom: 0.5rem; font-size: 0.9rem;">
            Exports all data with user credentials stripped. Suitable for governance, auditing, or data portability.
            <strong>Cannot restore login capability.</strong>
          </p>
          <button class="btn btn-primary" :disabled="exportLoading" @click="exportRedactedSnapshot" style="margin-bottom: 1rem;">
            {{ exportLoading ? 'Exporting...' : 'Export Redacted Snapshot' }}
          </button>
        </div>
      </div>

      <!-- Restorable Snapshot -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header"><h3>Restorable Snapshot (Disaster Recovery)</h3></div>
        <div style="padding: 1rem;">
          <p style="margin-bottom: 0.5rem; font-size: 0.9rem;">
            Exports all data including user credentials encrypted with your passphrase.
            <strong>Can fully restore accounts and login capability.</strong>
          </p>
          <div class="form-group" style="max-width: 320px; margin-bottom: 0.75rem;">
            <label class="form-label">Encryption Passphrase (min 8 chars)</label>
            <input v-model="restorePassphrase" type="password" class="form-input" placeholder="Enter passphrase" autocomplete="off" />
          </div>
          <button
            class="btn btn-primary"
            :disabled="exportLoading || restorePassphrase.length < 8"
            @click="exportRestorableSnapshot"
          >
            {{ exportLoading ? 'Exporting...' : 'Export Restorable Snapshot' }}
          </button>
        </div>
      </div>

      <!-- Filtered Store Export -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header"><h3>Filtered Store Export</h3></div>
        <div style="padding: 1rem;">

          <h4 style="margin-bottom: 0.5rem;">Filtered Export</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <label
              v-for="store in availableStores"
              :key="store"
              style="display: flex; align-items: center; gap: 0.25rem; cursor: pointer; min-width: 150px;"
            >
              <input type="checkbox" v-model="selectedStores" :value="store" />
              {{ store }}
            </label>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button
              class="btn btn-secondary"
              :disabled="selectedStores.length === 0 || exportLoading"
              @click="exportFiltered"
            >
              Export Filtered JSON
            </button>
            <button
              class="btn btn-secondary"
              :disabled="selectedStores.length !== 1 || exportLoading"
              @click="exportCSV"
            >
              Export as CSV
            </button>
          </div>
          <p v-if="selectedStores.length !== 1" class="hint" style="margin-top: 0.25rem; font-size: 0.85rem; color: var(--text-muted);">
            Select exactly one store to enable CSV export.
          </p>
          <p v-if="selectedStores.includes('users')" class="hint" style="margin-top: 0.25rem; font-size: 0.85rem; color: var(--text-muted);">
            Note: user credential fields (passwordHash, salt, answer hashes) are automatically redacted from user store exports.
          </p>
        </div>
      </div>

      <!-- Report Export Section -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header"><h3>Export Reports</h3></div>
        <div style="padding: 1rem;">
          <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="form-label">Status</label>
              <select v-model="reportFilters.status" class="form-input">
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="under_review">Under Review</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="form-label">Target Type</label>
              <select v-model="reportFilters.targetType" class="form-input">
                <option value="">All</option>
                <option value="listing">Listing</option>
                <option value="user">User</option>
                <option value="comment">Comment</option>
              </select>
            </div>
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="form-label">Reason</label>
              <input v-model="reportFilters.reason" type="text" class="form-input" placeholder="e.g. spam" />
            </div>
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="form-label">Date From</label>
              <input v-model="reportFilters.dateFrom" type="date" class="form-input" />
            </div>
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="form-label">Date To</label>
              <input v-model="reportFilters.dateTo" type="date" class="form-input" />
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary" :disabled="exportLoading" @click="exportReports">
              {{ exportLoading ? 'Exporting...' : 'Export Reports (JSON)' }}
            </button>
            <button class="btn btn-secondary" :disabled="exportLoading" @click="exportReportsCSV">
              {{ exportLoading ? 'Exporting...' : 'Export Reports (CSV)' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Analytics Export Section -->
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-header"><h3>Export Analytics</h3></div>
        <div style="padding: 1rem;">
          <p style="margin-bottom: 0.75rem; color: var(--text-muted); font-size: 0.9rem;">
            Export a KPI and trend snapshot as of right now.
          </p>
          <button class="btn btn-secondary" :disabled="exportLoading" @click="exportAnalytics">
            {{ exportLoading ? 'Exporting...' : 'Export Analytics JSON' }}
          </button>
        </div>
      </div>

      <!-- Import Section -->
      <div class="card">
        <div class="card-header"><h3>Import Snapshot</h3></div>
        <div style="padding: 1rem;">
          <div class="form-group">
            <label>Select JSON Snapshot File</label>
            <input type="file" accept=".json" class="form-input" @change="handleImportFile" ref="importFileInput" />
          </div>

          <div v-if="importPreview" class="card" style="margin-bottom: 1rem; background: var(--bg-secondary, #f5f5f5);">
            <div class="card-header"><h4>Import Preview</h4></div>
            <div style="padding: 0.75rem;">
              <p v-if="importSnapshotMode === 'restorable'" style="margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary);">
                Restorable snapshot detected — enter the export passphrase below to restore user accounts.
              </p>
              <p v-else-if="importSnapshotMode === 'redacted'" style="margin-bottom: 0.5rem; color: var(--text-muted);">
                Redacted snapshot — users will NOT be imported (credentials were stripped at export time).
              </p>
              <ul>
                <li v-for="(count, storeName) in importPreview" :key="storeName">
                  <strong>{{ storeName }}</strong>: {{ count }} records
                </li>
              </ul>
            </div>
          </div>

          <div v-if="importSnapshotMode === 'restorable'" class="form-group" style="max-width: 320px; margin-bottom: 0.75rem;">
            <label class="form-label">Decryption Passphrase</label>
            <input v-model="importPassphrase" type="password" class="form-input" placeholder="Enter passphrase used during export" autocomplete="off" />
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">
              Leave blank to skip user restoration (other stores will still be imported).
            </p>
          </div>

          <button
            class="btn btn-danger"
            :disabled="!importData || importLoading"
            @click="confirmImportOpen = true"
          >
            {{ importLoading ? 'Importing...' : 'Import Snapshot' }}
          </button>
        </div>
      </div>

      <ConfirmModal
        v-model="confirmImportOpen"
        title="Confirm Import"
        :message="importSnapshotMode === 'restorable' && importPassphrase
          ? 'This will overwrite existing data AND restore user accounts from the encrypted backup. This action cannot be undone. Are you sure?'
          : 'This will overwrite existing data for the included stores (except audit logs and users). This action cannot be undone. Are you sure?'"
        confirm-text="Import"
        :danger-mode="true"
        @confirm="executeImport"
      />
    </div>

    <!-- ═══════════════════ DICTIONARY TAB ═══════════════════ -->
    <div v-if="activeTab === 'dictionary'">
      <div class="card" style="margin-bottom: 1rem;">
        <div class="card-header">
          <h3>Data Dictionary</h3>
          <input
            v-model="dictFilter"
            type="text"
            class="form-input"
            placeholder="Search entities or fields..."
            style="max-width: 260px;"
          />
        </div>
      </div>

      <div
        v-for="entity in filteredDictionary"
        :key="entity.store"
        class="card"
        style="margin-bottom: 1.25rem;"
      >
        <div class="card-header" style="display: flex; align-items: baseline; gap: 0.75rem;">
          <h4 style="margin: 0;">{{ entity.label }}</h4>
          <code style="font-size: 0.8rem; color: var(--text-muted);">{{ entity.store }}</code>
        </div>
        <p style="padding: 0 1rem 0.5rem; color: var(--text-muted); font-size: 0.9rem;">{{ entity.description }}</p>
        <div class="table-wrap" style="padding: 0 1rem 1rem;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in entity.fields" :key="field.name">
                <td><code>{{ field.name }}</code></td>
                <td><em style="font-size: 0.85rem;">{{ field.type }}</em></td>
                <td>{{ field.required ? '✓' : '' }}</td>
                <td style="font-size: 0.9rem;">{{ field.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <EmptyState
        v-if="filteredDictionary.length === 0"
        title="No matches"
        message="No entities or fields match your search."
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { AdminService } from '../../services/AdminService.js';
import { UserService } from '../../services/UserService.js';
import { AnalyticsService } from '../../services/AnalyticsService.js';
import { AuditService } from '../../services/AuditService.js';
import { ModerationService } from '../../services/ModerationService.js';
import { ExportImportService } from '../../services/ExportImportService.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import EmptyState from '../../components/EmptyState.vue';
import { ALL_ROLES } from '../../domain/enums/roles.js';
import { DATA_DICTIONARY } from '../../domain/dataDictionary.js';
import AdminDeliveryTab from './tabs/AdminDeliveryTab.vue';

// ── Props & Routing ──

const props = defineProps({
  tab: { type: String, default: 'analytics' },
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

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

// ── Dictionary ──
const dictFilter = ref('');
const filteredDictionary = computed(() => {
  const q = dictFilter.value.toLowerCase().trim();
  if (!q) return DATA_DICTIONARY;
  return DATA_DICTIONARY.filter(entity =>
    entity.store.toLowerCase().includes(q) ||
    entity.label.toLowerCase().includes(q) ||
    entity.description.toLowerCase().includes(q) ||
    entity.fields.some(f =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q)
    )
  );
});

watch(activeTab, (tab) => {
  loadTabData(tab);
});

onMounted(() => {
  loadTabData(activeTab.value);
});

async function loadTabData(tab) {
  switch (tab) {
    case 'analytics': return loadAnalytics();
    case 'users': return loadUsers();
    case 'categories': return loadCategories();

    case 'audit': return loadAuditLogs();
    case 'data': return loadAvailableStores();
  }
}

// ── Helpers ──

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString();
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════

const analyticsLoading = ref(false);
const kpis = ref(null);
const trendMetric = ref('listings');
const trendPeriod = ref(30);
const trendData = ref([]);
const trendsLoading = ref(false);

async function loadAnalytics() {
  analyticsLoading.value = true;
  try {
    kpis.value = await AnalyticsService.computeKPIs(session.value);
  } catch (e) {
    toast.error(e.message || 'Failed to load analytics');
  } finally {
    analyticsLoading.value = false;
  }
}

async function loadTrends() {
  trendsLoading.value = true;
  try {
    trendData.value = await AnalyticsService.computeTrends(session.value, {
      metric: trendMetric.value,
      periodDays: trendPeriod.value,
      bucketSize: 'day',
    });
  } catch (e) {
    toast.error(e.message || 'Failed to load trends');
  } finally {
    trendsLoading.value = false;
  }
}

function barHeight(count) {
  if (!trendData.value || trendData.value.length === 0) return 0;
  const max = Math.max(...trendData.value.map(b => b.count));
  if (max === 0) return 0;
  return Math.max(5, (count / max) * 100);
}

// ═══════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════

const usersLoading = ref(false);
const users = ref([]);
const roleModalOpen = ref(false);
const roleTarget = ref(null);
const roleSelections = reactive({});
const roleSaving = ref(false);

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await UserService.getAllUsers(session.value);
  } catch (e) {
    toast.error(e.message || 'Failed to load users');
  } finally {
    usersLoading.value = false;
  }
}

function openRoleModal(user) {
  roleTarget.value = user;
  for (const role of ALL_ROLES) {
    roleSelections[role] = user.roles.includes(role);
  }
  roleModalOpen.value = true;
}

async function saveRoles() {
  if (!roleTarget.value) return;
  roleSaving.value = true;
  try {
    const currentRoles = new Set(roleTarget.value.roles);
    const desiredRoles = new Set(ALL_ROLES.filter(r => roleSelections[r]));

    // Roles to add
    for (const role of desiredRoles) {
      if (!currentRoles.has(role)) {
        await UserService.assignRole(session.value, roleTarget.value.id, role);
      }
    }
    // Roles to remove
    for (const role of currentRoles) {
      if (!desiredRoles.has(role)) {
        await UserService.removeRole(session.value, roleTarget.value.id, role);
      }
    }

    toast.success('Roles updated successfully');
    roleModalOpen.value = false;
    await loadUsers();
  } catch (e) {
    toast.error(e.message || 'Failed to update roles');
  } finally {
    roleSaving.value = false;
  }
}

// ═══════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════

const categoriesLoading = ref(false);
const categorySaving = ref(false);
const allCategories = ref([]);
const categoryTree = ref([]);
const editingCategory = ref(null);
const categoryForm = reactive({
  name: '',
  parentId: null,
  sortOrder: 0,
});

async function loadCategories() {
  categoriesLoading.value = true;
  try {
    const [flat, tree] = await Promise.all([
      AdminService.getAllCategories(session.value),
      AdminService.getCategoryTree(session.value),
    ]);
    allCategories.value = flat;
    categoryTree.value = tree;
  } catch (e) {
    toast.error(e.message || 'Failed to load categories');
  } finally {
    categoriesLoading.value = false;
  }
}

function resetCategoryForm() {
  categoryForm.name = '';
  categoryForm.parentId = null;
  categoryForm.sortOrder = 0;
  editingCategory.value = null;
}

async function submitCreateCategory() {
  categorySaving.value = true;
  try {
    await AdminService.createCategory(session.value, {
      name: categoryForm.name,
      parentId: categoryForm.parentId,
      sortOrder: categoryForm.sortOrder,
    });
    toast.success('Category created');
    resetCategoryForm();
    await loadCategories();
  } catch (e) {
    toast.error(e.message || 'Failed to create category');
  } finally {
    categorySaving.value = false;
  }
}

function startEditCategory(cat) {
  editingCategory.value = cat;
  categoryForm.name = cat.name;
  categoryForm.parentId = cat.parentId;
  categoryForm.sortOrder = cat.sortOrder;
}

function cancelEditCategory() {
  resetCategoryForm();
}

async function submitUpdateCategory() {
  if (!editingCategory.value) return;
  categorySaving.value = true;
  try {
    await AdminService.updateCategory(session.value, editingCategory.value.id, {
      name: categoryForm.name,
      parentId: categoryForm.parentId,
      sortOrder: categoryForm.sortOrder,
    });
    toast.success('Category updated');
    resetCategoryForm();
    await loadCategories();
  } catch (e) {
    toast.error(e.message || 'Failed to update category');
  } finally {
    categorySaving.value = false;
  }
}

// ═══════════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════════

const auditLoading = ref(false);
const auditLogs = ref([]);
const auditPage = ref(1);
const AUDIT_PAGE_SIZE = 50;

const sortedAuditLogs = computed(() =>
  [...auditLogs.value].sort((a, b) => b.timestamp - a.timestamp)
);

const auditTotalPages = computed(() =>
  Math.max(1, Math.ceil(sortedAuditLogs.value.length / AUDIT_PAGE_SIZE))
);

const paginatedAuditLogs = computed(() => {
  const start = (auditPage.value - 1) * AUDIT_PAGE_SIZE;
  return sortedAuditLogs.value.slice(start, start + AUDIT_PAGE_SIZE);
});

async function loadAuditLogs() {
  auditLoading.value = true;
  auditPage.value = 1;
  try {
    auditLogs.value = await AuditService.getAll(authStore.session);
  } catch (e) {
    toast.error(e.message || 'Failed to load audit logs');
  } finally {
    auditLoading.value = false;
  }
}

// ═══════════════════════════════════════════
// DATA (IMPORT / EXPORT)
// ═══════════════════════════════════════════

const availableStores = ref([]);
const selectedStores = ref([]);
const exportLoading = ref(false);
const restorePassphrase = ref('');
const importPassphrase = ref('');
const importSnapshotMode = ref(''); // 'redacted' | 'restorable' | ''

const reportFilters = reactive({
  status: '',
  targetType: '',
  reason: '',
  dateFrom: '',
  dateTo: '',
});
const importLoading = ref(false);
const importData = ref(null);
const importPreview = ref(null);
const confirmImportOpen = ref(false);
const importFileInput = ref(null);

function loadAvailableStores() {
  availableStores.value = ExportImportService.getAvailableStores();
}

async function exportRedactedSnapshot() {
  exportLoading.value = true;
  try {
    const data = await ExportImportService.exportRedactedSnapshot(session.value);
    downloadJSON(data, `tradeloop-redacted-${Date.now()}.json`);
    toast.success('Redacted snapshot exported (credentials stripped)');
  } catch (e) {
    toast.error(e.message || 'Export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportRestorableSnapshot() {
  if (restorePassphrase.value.length < 8) return;
  exportLoading.value = true;
  try {
    const data = await ExportImportService.exportRestorableSnapshot(session.value, restorePassphrase.value);
    downloadJSON(data, `tradeloop-restorable-${Date.now()}.json`);
    toast.success('Restorable snapshot exported (credentials encrypted)');
    restorePassphrase.value = '';
  } catch (e) {
    toast.error(e.message || 'Export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportFiltered() {
  if (selectedStores.value.length === 0) return;
  exportLoading.value = true;
  try {
    const data = await ExportImportService.exportFiltered(session.value, selectedStores.value);
    downloadJSON(data, `tradeloop-filtered-${Date.now()}.json`);
    toast.success('Filtered export completed');
  } catch (e) {
    toast.error(e.message || 'Export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportCSV() {
  if (selectedStores.value.length !== 1) return;
  exportLoading.value = true;
  try {
    const storeName = selectedStores.value[0];
    const data = await ExportImportService.exportFiltered(session.value, [storeName]);
    const records = data[storeName];
    if (!records || records.length === 0) {
      toast.warning('No records found for selected store');
      return;
    }
    const csv = ExportImportService.toCSV(records);
    downloadCSV(csv, `tradeloop-${storeName}-${Date.now()}.csv`);
    toast.success(`CSV export of ${storeName} completed`);
  } catch (e) {
    toast.error(e.message || 'CSV export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportReports() {
  exportLoading.value = true;
  try {
    const filters = {};
    if (reportFilters.status) filters.status = reportFilters.status;
    if (reportFilters.targetType) filters.targetType = reportFilters.targetType;
    if (reportFilters.reason) filters.reason = reportFilters.reason.trim();
    if (reportFilters.dateFrom) filters.dateFrom = reportFilters.dateFrom;
    if (reportFilters.dateTo) filters.dateTo = reportFilters.dateTo;
    const data = await ExportImportService.exportReports(session.value, filters);
    downloadJSON(data, `tradeloop-reports-${Date.now()}.json`);
    toast.success(`Reports exported (${data._meta.totalRecords} records)`);
  } catch (e) {
    toast.error(e.message || 'Report export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportReportsCSV() {
  exportLoading.value = true;
  try {
    const filters = {};
    if (reportFilters.status) filters.status = reportFilters.status;
    if (reportFilters.targetType) filters.targetType = reportFilters.targetType;
    if (reportFilters.reason) filters.reason = reportFilters.reason.trim();
    if (reportFilters.dateFrom) filters.dateFrom = reportFilters.dateFrom;
    if (reportFilters.dateTo) filters.dateTo = reportFilters.dateTo;
    const csv = await ExportImportService.exportReportsCSV(session.value, filters);
    if (!csv) {
      toast.warning('No matching reports to export');
      return;
    }
    downloadCSV(csv, `tradeloop-reports-${Date.now()}.csv`);
    toast.success('Reports exported as CSV');
  } catch (e) {
    toast.error(e.message || 'Report CSV export failed');
  } finally {
    exportLoading.value = false;
  }
}

async function exportAnalytics() {
  exportLoading.value = true;
  try {
    const data = await ExportImportService.exportAnalytics(session.value);
    downloadJSON(data, `tradeloop-analytics-${Date.now()}.json`);
    toast.success('Analytics snapshot exported');
  } catch (e) {
    toast.error(e.message || 'Analytics export failed');
  } finally {
    exportLoading.value = false;
  }
}

function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    importData.value = null;
    importPreview.value = null;
    importSnapshotMode.value = '';
    importPassphrase.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      importData.value = parsed;

      // Detect snapshot mode
      if (parsed._meta?.mode === 'restorable' && parsed._encryptedUsers) {
        importSnapshotMode.value = 'restorable';
      } else {
        importSnapshotMode.value = 'redacted';
      }
      importPassphrase.value = '';

      // Build preview: store names and record counts
      const preview = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (key === '_meta' || key === '_encryptedUsers') continue;
        if (Array.isArray(value)) {
          preview[key] = value.length;
        }
      }
      importPreview.value = Object.keys(preview).length > 0 ? preview : null;
    } catch {
      toast.error('Invalid JSON file');
      importData.value = null;
      importPreview.value = null;
      importSnapshotMode.value = '';
    }
  };
  reader.readAsText(file);
}

async function executeImport() {
  confirmImportOpen.value = false;
  if (!importData.value) return;
  importLoading.value = true;
  try {
    const opts = {};
    if (importSnapshotMode.value === 'restorable' && importPassphrase.value) {
      opts.passphrase = importPassphrase.value;
    }
    const result = await ExportImportService.importSnapshot(session.value, importData.value, opts);
    const msg = result.usersRestored
      ? `Import complete: ${result.importedStores.length} stores imported (user accounts restored)`
      : `Import complete: ${result.importedStores.length} stores imported (users skipped)`;
    toast.success(msg);
    importData.value = null;
    importPreview.value = null;
    importSnapshotMode.value = '';
    importPassphrase.value = '';
    if (importFileInput.value) {
      importFileInput.value.value = '';
    }
  } catch (e) {
    toast.error(e.message || 'Import failed');
  } finally {
    importLoading.value = false;
  }
}
</script>

<style scoped>
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #888);
}

.category-tree,
.category-tree-children {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-tree {
  padding: 0.75rem 1rem;
}

.category-node {
  padding: 0.35rem 0;
}

.category-node-row {
  display: flex;
  align-items: center;
}

.category-name {
  font-weight: 500;
}

.bar-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 200px;
  padding: 1rem;
  border-top: 1px solid var(--border-color, #e0e0e0);
}

.bar {
  flex: 1;
  background: var(--color-primary, #4f46e5);
  border-radius: 3px 3px 0 0;
  min-width: 8px;
  position: relative;
  transition: height 0.3s ease;
}

.bar-label {
  position: absolute;
  top: -1.4em;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.7rem;
  white-space: nowrap;
  color: var(--text-muted, #888);
}

.pagination-controls {
  justify-content: center;
}

.hint {
  font-style: italic;
}
</style>
