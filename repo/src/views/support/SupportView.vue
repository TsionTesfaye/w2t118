<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Support Console</h1>
    </div>

    <div class="tabs">
      <button
        class="tab"
        :class="{ active: activeTab === 'complaints' }"
        @click="switchTab('complaints')"
      >
        Complaints
      </button>
      <button
        class="tab"
        :class="{ active: activeTab === 'refunds' }"
        @click="switchTab('refunds')"
      >
        Refunds
      </button>
    </div>

    <!-- ── Complaints Tab ── -->
    <div v-if="activeTab === 'complaints'">
      <div class="pill-tabs">
        <button
          v-for="f in complaintFilters"
          :key="f.value"
          class="pill-tab"
          :class="{ active: complaintFilter === f.value }"
          @click="complaintFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>

      <div v-if="loadingComplaints" class="loading-state">Loading complaints...</div>

      <EmptyState
        v-else-if="filteredComplaints.length === 0"
        title="No complaints"
        message="No complaints match the selected filter."
      />

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Issue Type</th>
              <th>Status</th>
              <th>Transaction ID</th>
              <th>Created</th>
              <th>SLA Deadline</th>
              <th>Assigned To</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in filteredComplaints"
              :key="c.id"
              style="cursor: pointer;"
              @click="openComplaint(c)"
            >
              <td>{{ c.userId }}</td>
              <td>{{ c.issueType }}</td>
              <td><StatusBadge :status="c.status" /></td>
              <td>{{ c.transactionId || '-' }}</td>
              <td>{{ formatDate(c.createdAt) }}</td>
              <td>{{ formatDate(c.slaDeadline) }}</td>
              <td>{{ c.assignedTo || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Refunds Tab ── -->
    <div v-if="activeTab === 'refunds'">
      <div v-if="loadingRefunds" class="loading-state">Loading refunds...</div>

      <EmptyState
        v-else-if="refunds.length === 0"
        title="No refunds"
        message="No refund requests found."
      />

      <div v-else class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Complaint ID</th>
              <th>Transaction ID</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in refunds" :key="r.id">
              <td>{{ r.complaintId }}</td>
              <td>{{ r.transactionId || '-' }}</td>
              <td>{{ r.reason }}</td>
              <td><StatusBadge :status="r.status" /></td>
              <td>{{ formatDate(r.createdAt) }}</td>
              <td>
                <template v-if="r.status === 'requested'">
                  <button class="btn btn-primary" @click="handleRefundDecision(r.id, 'approved')">
                    Approve
                  </button>
                  <button class="btn btn-danger" @click="handleRefundDecision(r.id, 'rejected')">
                    Reject
                  </button>
                </template>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Complaint Detail Modal ── -->
    <AppModal v-model="showComplaintModal" title="Complaint Details" max-width="650px">
      <template v-if="selectedComplaint">
        <div class="form-group">
          <label>Description</label>
          <p>{{ selectedComplaint.description }}</p>
        </div>
        <div class="form-group">
          <label>Issue Type</label>
          <p>{{ selectedComplaint.issueType }}</p>
        </div>
        <div class="form-group">
          <label>Status</label>
          <p><StatusBadge :status="selectedComplaint.status" /></p>
        </div>
        <div class="form-group">
          <label>Transaction ID</label>
          <p>{{ selectedComplaint.transactionId || '-' }}</p>
        </div>
        <div class="form-group">
          <label>Created</label>
          <p>{{ formatDate(selectedComplaint.createdAt) }}</p>
        </div>
        <div class="form-group">
          <label>Updated</label>
          <p>{{ formatDate(selectedComplaint.updatedAt) }}</p>
        </div>

        <!-- Resolution input for resolve / reject -->
        <div
          v-if="
            selectedComplaint.status === ComplaintStatus.INVESTIGATING ||
            selectedComplaint.status === ComplaintStatus.OPEN
          "
          class="form-group"
        >
          <label>Resolution Notes</label>
          <textarea
            v-model="resolutionText"
            class="form-textarea"
            rows="3"
            placeholder="Enter resolution notes..."
          />
        </div>

        <!-- State transition buttons -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem;">
          <button
            v-if="selectedComplaint.status === ComplaintStatus.OPEN"
            class="btn btn-primary"
            @click="transitionComplaint(ComplaintStatus.INVESTIGATING)"
          >
            Take Ownership
          </button>
          <button
            v-if="selectedComplaint.status === ComplaintStatus.INVESTIGATING"
            class="btn btn-primary"
            :disabled="!resolutionText.trim()"
            @click="transitionComplaint(ComplaintStatus.RESOLVED)"
          >
            Resolve
          </button>
          <button
            v-if="
              selectedComplaint.status === ComplaintStatus.INVESTIGATING ||
              selectedComplaint.status === ComplaintStatus.OPEN
            "
            class="btn btn-danger"
            :disabled="!resolutionText.trim()"
            @click="transitionComplaint(ComplaintStatus.REJECTED)"
          >
            Reject
          </button>
        </div>

        <!-- Refund section -->
        <template v-if="complaintRefund">
          <hr style="margin: 1rem 0;" />
          <h4>Refund Request</h4>
          <div class="form-group">
            <label>Refund Status</label>
            <p><StatusBadge :status="complaintRefund.status" /></p>
          </div>
          <div class="form-group">
            <label>Reason</label>
            <p>{{ complaintRefund.reason }}</p>
          </div>
          <div
            v-if="complaintRefund.status === 'requested'"
            style="display: flex; gap: 0.5rem; margin-top: 0.5rem;"
          >
            <button
              class="btn btn-primary"
              @click="handleComplaintRefundDecision(complaintRefund.id, 'approved')"
            >
              Approve Refund
            </button>
            <button
              class="btn btn-danger"
              @click="handleComplaintRefundDecision(complaintRefund.id, 'rejected')"
            >
              Reject Refund
            </button>
          </div>
        </template>
      </template>

      <template #footer>
        <button class="btn btn-secondary" @click="showComplaintModal = false">
          Close
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { SupportService } from '../../services/SupportService.js';
import { ComplaintStatus } from '../../domain/enums/statuses.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import EmptyState from '../../components/EmptyState.vue';

const props = defineProps({
  tab: { type: String, default: 'complaints' },
});

const authStore = useAuthStore();
const toast = useToast();

const activeTab = ref(props.tab);

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function switchTab(tab) {
  activeTab.value = tab;
  if (tab === 'complaints') fetchComplaints();
  else if (tab === 'refunds') fetchRefunds();
}

// ── Complaints ──
const complaints = ref([]);
const loadingComplaints = ref(false);
const complaintFilter = ref('all');
const selectedComplaint = ref(null);
const showComplaintModal = ref(false);
const resolutionText = ref('');
const complaintRefund = ref(null);

const complaintFilters = [
  { value: 'all', label: 'All' },
  { value: ComplaintStatus.OPEN, label: 'Open' },
  { value: ComplaintStatus.INVESTIGATING, label: 'Investigating' },
];

const filteredComplaints = computed(() => {
  if (complaintFilter.value === 'all') return complaints.value;
  return complaints.value.filter(c => c.status === complaintFilter.value);
});

async function fetchComplaints() {
  loadingComplaints.value = true;
  try {
    const result = await SupportService.getAllComplaints(authStore.session);
    complaints.value = result.items;
  } catch (err) {
    toast.error(err.message || 'Failed to load complaints');
  } finally {
    loadingComplaints.value = false;
  }
}

async function openComplaint(complaint) {
  try {
    selectedComplaint.value = await SupportService.getComplaintById(
      authStore.session,
      complaint.id,
    );
    resolutionText.value = '';
    complaintRefund.value = null;
    showComplaintModal.value = true;

    // Load associated refund if any
    try {
      const refund = await SupportService.getRefundByComplaint(
        authStore.session,
        complaint.id,
      );
      complaintRefund.value = refund;
    } catch {
      // No refund exists — that is fine
      complaintRefund.value = null;
    }
  } catch (err) {
    toast.error(err.message || 'Failed to load complaint details');
  }
}

async function transitionComplaint(newStatus) {
  if (!selectedComplaint.value) return;
  try {
    const resolution = (
      newStatus === ComplaintStatus.RESOLVED || newStatus === ComplaintStatus.REJECTED
    )
      ? resolutionText.value.trim()
      : undefined;

    await SupportService.transitionComplaint(
      authStore.session,
      selectedComplaint.value.id,
      newStatus,
      resolution,
    );
    toast.success(`Complaint moved to ${newStatus}`);
    showComplaintModal.value = false;
    selectedComplaint.value = null;
    await fetchComplaints();
  } catch (err) {
    toast.error(err.message || 'Failed to transition complaint');
  }
}

async function handleComplaintRefundDecision(refundId, decision) {
  try {
    await SupportService.decideRefund(authStore.session, refundId, decision);
    toast.success(`Refund ${decision}`);
    // Refresh the refund in modal
    if (selectedComplaint.value) {
      try {
        complaintRefund.value = await SupportService.getRefundByComplaint(
          authStore.session,
          selectedComplaint.value.id,
        );
      } catch {
        complaintRefund.value = null;
      }
    }
  } catch (err) {
    toast.error(err.message || 'Failed to process refund decision');
  }
}

// ── Refunds ──
const refunds = ref([]);
const loadingRefunds = ref(false);

async function fetchRefunds() {
  loadingRefunds.value = true;
  try {
    refunds.value = await SupportService.getAllRefunds(authStore.session);
  } catch (err) {
    toast.error(err.message || 'Failed to load refunds');
  } finally {
    loadingRefunds.value = false;
  }
}

async function handleRefundDecision(refundId, decision) {
  try {
    await SupportService.decideRefund(authStore.session, refundId, decision);
    toast.success(`Refund ${decision}`);
    await fetchRefunds();
  } catch (err) {
    toast.error(err.message || 'Failed to process refund decision');
  }
}

// ── Init ──
onMounted(() => {
  if (activeTab.value === 'complaints') fetchComplaints();
  else if (activeTab.value === 'refunds') fetchRefunds();
});
</script>
