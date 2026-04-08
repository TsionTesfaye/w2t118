<template>
  <div>
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
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ExportImportService } from '../../../services/ExportImportService.js';
import { useToast } from '../../../composables/useToast.js';
import ConfirmModal from '../../../components/ConfirmModal.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

// ── Download helpers ──

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

// ── State ──

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

// ── Handlers ──

function loadAvailableStores() {
  availableStores.value = ExportImportService.getAvailableStores();
}

async function exportRedactedSnapshot() {
  exportLoading.value = true;
  try {
    const data = await ExportImportService.exportRedactedSnapshot(props.session);
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
    const data = await ExportImportService.exportRestorableSnapshot(props.session, restorePassphrase.value);
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
    const data = await ExportImportService.exportFiltered(props.session, selectedStores.value);
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
    const data = await ExportImportService.exportFiltered(props.session, [storeName]);
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
    const data = await ExportImportService.exportReports(props.session, filters);
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
    const csv = await ExportImportService.exportReportsCSV(props.session, filters);
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
    const data = await ExportImportService.exportAnalytics(props.session);
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
    const result = await ExportImportService.importSnapshot(props.session, importData.value, opts);
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

onMounted(loadAvailableStores);
</script>

<style scoped>
.hint {
  font-style: italic;
}
</style>
