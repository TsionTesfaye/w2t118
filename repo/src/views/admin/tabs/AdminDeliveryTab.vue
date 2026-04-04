<template>
  <div>
    <!-- Add Coverage Prefix -->
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-header"><h3>Add Coverage Prefix</h3></div>
      <form
        @submit.prevent="submitAddPrefix"
        style="padding: 1rem; display: flex; gap: 0.75rem; align-items: flex-end;"
      >
        <div class="form-group" style="margin-bottom: 0;">
          <label>ZIP Prefix (3 digits)</label>
          <input
            v-model="newPrefix"
            class="form-input"
            maxlength="3"
            pattern="\d{3}"
            placeholder="e.g. 100"
            required
          />
        </div>
        <button type="submit" class="btn btn-primary" :disabled="saving">Add</button>
      </form>
      <p v-if="prefixError" class="alert-error" style="margin: 0 1rem 1rem;">{{ prefixError }}</p>
    </div>

    <!-- Coverage List -->
    <div v-if="loading" class="loading-state">Loading coverage data...</div>
    <EmptyState
      v-else-if="coveragePrefixes.length === 0"
      icon="&#128230;"
      title="No coverage prefixes"
      message="Add ZIP prefixes to define delivery coverage areas."
    />
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Prefix</th>
            <th>Added</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in coveragePrefixes" :key="entry.id">
            <td><code>{{ entry.prefix }}</code></td>
            <td>{{ formatDate(entry.createdAt) }}</td>
            <td>
              <button class="btn btn-sm btn-danger" @click="removePrefix(entry.prefix)">
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { DeliveryService } from '../../../services/DeliveryService.js';
import { useToast } from '../../../composables/useToast.js';
import EmptyState from '../../../components/EmptyState.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

const loading         = ref(false);
const saving          = ref(false);
const coveragePrefixes = ref([]);
const newPrefix       = ref('');
const prefixError     = ref('');

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString();
}

async function loadCoverage() {
  loading.value = true;
  try {
    coveragePrefixes.value = await DeliveryService.getAllCoverage(props.session);
  } catch (e) {
    toast.error(e.message || 'Failed to load coverage data');
  } finally {
    loading.value = false;
  }
}

async function submitAddPrefix() {
  prefixError.value = '';
  const val = newPrefix.value.trim();
  if (!/^\d{3}$/.test(val)) {
    prefixError.value = 'Prefix must be exactly 3 digits';
    return;
  }
  saving.value = true;
  try {
    await DeliveryService.addCoveragePrefix(props.session, val);
    toast.success(`Prefix ${val} added`);
    newPrefix.value = '';
    await loadCoverage();
  } catch (e) {
    toast.error(e.message || 'Failed to add prefix');
  } finally {
    saving.value = false;
  }
}

async function removePrefix(prefix) {
  try {
    await DeliveryService.removeCoveragePrefix(props.session, prefix);
    toast.success(`Prefix ${prefix} removed`);
    await loadCoverage();
  } catch (e) {
    toast.error(e.message || 'Failed to remove prefix');
  }
}

onMounted(loadCoverage);
</script>
