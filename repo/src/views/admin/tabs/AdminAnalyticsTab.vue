<template>
  <div>
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
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { AnalyticsService } from '../../../services/AnalyticsService.js';
import { useToast } from '../../../composables/useToast.js';
import EmptyState from '../../../components/EmptyState.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

const analyticsLoading = ref(false);
const kpis = ref(null);
const trendMetric = ref('listings');
const trendPeriod = ref(30);
const trendData = ref([]);
const trendsLoading = ref(false);

async function loadAnalytics() {
  analyticsLoading.value = true;
  try {
    kpis.value = await AnalyticsService.computeKPIs(props.session);
  } catch (e) {
    toast.error(e.message || 'Failed to load analytics');
  } finally {
    analyticsLoading.value = false;
  }
}

async function loadTrends() {
  trendsLoading.value = true;
  try {
    trendData.value = await AnalyticsService.computeTrends(props.session, {
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

onMounted(loadAnalytics);
</script>

<style scoped>
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #888);
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
</style>
