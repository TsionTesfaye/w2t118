<template>
  <div>
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
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { AuditService } from '../../../services/AuditService.js';
import { useToast } from '../../../composables/useToast.js';
import EmptyState from '../../../components/EmptyState.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

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

function formatTimestamp(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

async function loadAuditLogs() {
  auditLoading.value = true;
  auditPage.value = 1;
  try {
    auditLogs.value = await AuditService.getAll(props.session);
  } catch (e) {
    toast.error(e.message || 'Failed to load audit logs');
  } finally {
    auditLoading.value = false;
  }
}

onMounted(loadAuditLogs);
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
</style>
