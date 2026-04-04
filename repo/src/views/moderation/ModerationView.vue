<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Moderation Console</h1>
    </div>

    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'queue' }"
        @click="switchTab('queue')"
      >
        Review Queue
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'reports' }"
        @click="switchTab('reports')"
      >
        Reports
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'words' }"
        @click="switchTab('words')"
      >
        Sensitive Words
      </button>
    </div>

    <!-- ── Queue Tab ── -->
    <div v-if="activeTab === 'queue'">
      <div v-if="loadingQueue" class="loading-state">Loading queue...</div>

      <EmptyState
        v-else-if="queueCases.length === 0"
        title="Queue is empty"
        message="No cases awaiting review."
      />

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Content ID</th>
              <th>Content Type</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Flagged Words</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in queueCases" :key="c.id">
              <td>{{ c.contentId }}</td>
              <td>{{ c.contentType }}</td>
              <td>{{ c.reason }}</td>
              <td><StatusBadge :status="c.status" /></td>
              <td>{{ (c.flaggedWords || []).join(', ') || '-' }}</td>
              <td>{{ formatDate(c.createdAt) }}</td>
              <td>
                <button
                  v-if="c.status === ModerationStatus.PENDING"
                  class="btn btn-secondary"
                  @click="pickUp(c)"
                >
                  Pick Up
                </button>
                <button class="btn btn-primary" @click="openReview(c)">
                  Review
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Reports Tab ── -->
    <div v-if="activeTab === 'reports'">
      <div class="pill-tabs">
        <button
          v-for="s in reportFilters"
          :key="s.value"
          class="pill-tab"
          :class="{ active: reportFilter === s.value }"
          @click="reportFilter = s.value"
        >
          {{ s.label }}
        </button>
      </div>

      <div v-if="loadingReports" class="loading-state">Loading reports...</div>

      <EmptyState
        v-else-if="filteredReports.length === 0"
        title="No reports"
        message="No reports match the selected filter."
      />

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Reporter</th>
              <th>Target</th>
              <th>Type</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filteredReports" :key="r.id">
              <td>{{ r.reporterId }}</td>
              <td>{{ r.targetId }}</td>
              <td>{{ r.targetType }}</td>
              <td>{{ r.reason }}</td>
              <td><StatusBadge :status="r.status" /></td>
              <td>{{ formatDate(r.createdAt) }}</td>
              <td>
                <button
                  v-if="r.status === ReportStatus.OPEN"
                  class="btn btn-secondary"
                  @click="updateReport(r.id, ReportStatus.UNDER_REVIEW)"
                >
                  Start Review
                </button>
                <template v-if="r.status === ReportStatus.UNDER_REVIEW">
                  <button
                    class="btn btn-primary"
                    @click="updateReport(r.id, ReportStatus.RESOLVED)"
                  >
                    Resolve
                  </button>
                  <button
                    class="btn btn-secondary"
                    @click="updateReport(r.id, ReportStatus.DISMISSED)"
                  >
                    Dismiss
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Sensitive Words Tab ── -->
    <div v-if="activeTab === 'words'">
      <div class="card" style="margin-bottom: 1rem;">
        <h3>Add Sensitive Word</h3>
        <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
          <div class="form-group" style="flex: 1;">
            <label>Word</label>
            <input v-model="newWord" class="form-input" placeholder="Enter word..." />
          </div>
          <div class="form-group">
            <label>Match Type</label>
            <select v-model="newMatchType" class="form-select">
              <option value="substring">Substring</option>
              <option value="exact">Exact</option>
            </select>
          </div>
          <button
            class="btn btn-primary"
            :disabled="!newWord.trim()"
            @click="addWord"
          >
            Add
          </button>
        </div>
      </div>

      <div v-if="loadingWords" class="loading-state">Loading words...</div>

      <EmptyState
        v-else-if="sensitiveWords.length === 0"
        title="No sensitive words"
        message="No sensitive words have been configured."
      />

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Word</th>
              <th>Match Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in sensitiveWords" :key="w.id">
              <td>{{ w.word }}</td>
              <td>{{ w.matchType }}</td>
              <td>
                <button class="btn btn-danger" @click="confirmRemoveWord(w)">
                  Remove
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Review Detail Modal ── -->
    <AppModal v-model="showReviewModal" title="Review Case" max-width="600px">
      <template v-if="selectedCase">
        <div class="form-group">
          <label>Content Type</label>
          <p>{{ selectedCase.contentType }}</p>
        </div>
        <div class="form-group">
          <label>Content ID</label>
          <p>{{ selectedCase.contentId }}</p>
        </div>
        <div class="form-group">
          <label>Reason</label>
          <p>{{ selectedCase.reason }}</p>
        </div>
        <div class="form-group">
          <label>Flagged Words</label>
          <p>{{ (selectedCase.flaggedWords || []).join(', ') || 'None' }}</p>
        </div>

        <div v-if="showRejectFields" class="card" style="margin-top: 1rem;">
          <div class="form-group">
            <label>Violation Tags (comma-separated)</label>
            <input
              v-model="violationTagsInput"
              class="form-input"
              placeholder="e.g. spam, misleading"
            />
          </div>
          <div class="form-group">
            <label>Penalty (optional)</label>
            <select v-model="selectedPenalty" class="form-select">
              <option value="">None</option>
              <option value="warning">Warning</option>
              <option value="content_removal">Content Removal</option>
              <option value="user_suspension">User Suspension</option>
            </select>
          </div>
        </div>
      </template>

      <template #footer>
        <button class="btn btn-secondary" @click="showReviewModal = false">
          Cancel
        </button>
        <button
          v-if="!showRejectFields"
          class="btn btn-danger"
          @click="showRejectFields = true"
        >
          Reject
        </button>
        <button
          v-if="showRejectFields"
          class="btn btn-danger"
          @click="submitDecision('rejected')"
        >
          Confirm Reject
        </button>
        <button class="btn btn-primary" @click="submitDecision('approved')">
          Approve
        </button>
      </template>
    </AppModal>

    <!-- ── Confirm Remove Word Modal ── -->
    <ConfirmModal
      v-model="showRemoveWordModal"
      title="Remove Sensitive Word"
      :message="`Remove '${wordToRemove?.word ?? ''}'? This cannot be undone.`"
      confirm-text="Remove"
      :danger-mode="true"
      @confirm="removeWord"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ModerationService } from '../../services/ModerationService.js';
import { useModerationStore } from '../../app/store/moderationStore.js';
import { ModerationStatus, ReportStatus } from '../../domain/enums/statuses.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps({
  tab: { type: String, default: 'queue' },
});

const authStore = useAuthStore();
const toast = useToast();
const moderationStore = useModerationStore();

// ── Shared state ──
const activeTab = ref(props.tab);

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function switchTab(tab) {
  activeTab.value = tab;
  if (tab === 'queue') fetchQueue();
  else if (tab === 'reports') fetchReports();
  else if (tab === 'words') fetchWords();
}

// ── Queue (backed by moderationStore) ──
const queueCases = computed(() => moderationStore.queue);
const loadingQueue = computed(() => moderationStore.loading);
const selectedCase = ref(null);
const showReviewModal = ref(false);
const showRejectFields = ref(false);
const violationTagsInput = ref('');
const selectedPenalty = ref('');

async function fetchQueue() {
  await moderationStore.fetchQueue(authStore.session);
}

async function pickUp(caseItem) {
  try {
    await ModerationService.pickUpCase(authStore.session, caseItem.id);
    toast.success('Case picked up');
    await fetchQueue();
  } catch (err) {
    toast.error(err.message || 'Failed to pick up case');
  }
}

async function openReview(caseItem) {
  try {
    selectedCase.value = await ModerationService.getCaseById(authStore.session, caseItem.id);
    showRejectFields.value = false;
    violationTagsInput.value = '';
    selectedPenalty.value = '';
    showReviewModal.value = true;
  } catch (err) {
    toast.error(err.message || 'Failed to load case details');
  }
}

async function submitDecision(decision) {
  if (!selectedCase.value) return;
  try {
    const payload = { decision };
    if (decision === 'rejected') {
      payload.violationTags = violationTagsInput.value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      if (selectedPenalty.value) {
        payload.penalty = selectedPenalty.value;
      }
    }
    // ModerationService.decide is the single source of truth:
    // it updates the moderation case AND the associated listing status internally.
    await ModerationService.decide(authStore.session, selectedCase.value.id, payload);

    toast.success(`Case ${decision}`);
    showReviewModal.value = false;
    selectedCase.value = null;
    await fetchQueue();
  } catch (err) {
    toast.error(err.message || 'Failed to submit decision');
  }
}

// ── Reports ──
const reports = ref([]);
const loadingReports = ref(false);
const reportFilter = ref('all');

const reportFilters = [
  { value: 'all', label: 'All' },
  { value: ReportStatus.OPEN, label: 'Open' },
  { value: ReportStatus.UNDER_REVIEW, label: 'Under Review' },
  { value: ReportStatus.RESOLVED, label: 'Resolved' },
];

const filteredReports = computed(() => {
  if (reportFilter.value === 'all') return reports.value;
  return reports.value.filter(r => r.status === reportFilter.value);
});

async function fetchReports() {
  loadingReports.value = true;
  try {
    reports.value = await ModerationService.getAllReports(authStore.session);
  } catch (err) {
    toast.error(err.message || 'Failed to load reports');
  } finally {
    loadingReports.value = false;
  }
}

async function updateReport(id, newStatus) {
  try {
    await ModerationService.updateReportStatus(authStore.session, id, newStatus);
    toast.success('Report updated');
    await fetchReports();
  } catch (err) {
    toast.error(err.message || 'Failed to update report');
  }
}

// ── Sensitive Words ──
const sensitiveWords = ref([]);
const loadingWords = ref(false);
const newWord = ref('');
const newMatchType = ref('substring');
const showRemoveWordModal = ref(false);
const wordToRemove = ref(null);

async function fetchWords() {
  loadingWords.value = true;
  try {
    sensitiveWords.value = await ModerationService.getAllSensitiveWords(authStore.session);
  } catch (err) {
    toast.error(err.message || 'Failed to load sensitive words');
  } finally {
    loadingWords.value = false;
  }
}

async function addWord() {
  const word = newWord.value.trim();
  if (!word) return;
  try {
    await ModerationService.addSensitiveWord(authStore.session, word, newMatchType.value);
    toast.success('Word added');
    newWord.value = '';
    newMatchType.value = 'substring';
    await fetchWords();
  } catch (err) {
    toast.error(err.message || 'Failed to add word');
  }
}

function confirmRemoveWord(word) {
  wordToRemove.value = word;
  showRemoveWordModal.value = true;
}

async function removeWord() {
  if (!wordToRemove.value) return;
  try {
    await ModerationService.removeSensitiveWord(authStore.session, wordToRemove.value.id);
    toast.success('Word removed');
    showRemoveWordModal.value = false;
    wordToRemove.value = null;
    await fetchWords();
  } catch (err) {
    toast.error(err.message || 'Failed to remove word');
  }
}

// ── Init ──
onMounted(() => {
  if (activeTab.value === 'queue') fetchQueue();
  else if (activeTab.value === 'reports') fetchReports();
  else if (activeTab.value === 'words') fetchWords();
});
</script>
