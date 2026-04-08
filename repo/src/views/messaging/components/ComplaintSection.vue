<template>
  <div
    v-if="canFileComplaint"
    class="complaint-section"
    style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);"
  >
    <h4>Dispute</h4>
    <div v-if="existingComplaint" class="alert-info" style="margin-bottom: 0.5rem;">
      Complaint filed — Status:
      <strong>{{ existingComplaint.status }}</strong>
    </div>
    <button
      v-if="!existingComplaint"
      class="btn btn-secondary"
      :disabled="actionLoading"
      @click="showComplaintModal = true"
    >
      File Complaint
    </button>
  </div>

  <!-- File Complaint Modal -->
  <AppModal v-model="showComplaintModal" title="File Complaint" max-width="520px">
    <div class="form-group">
      <label class="form-label">Issue Type *</label>
      <select v-model="complaintIssueType" class="form-select">
        <option value="">Select issue type</option>
        <option value="item_not_received">Item Not Received</option>
        <option value="item_not_as_described">Item Not as Described</option>
        <option value="seller_unresponsive">Seller Unresponsive</option>
        <option value="payment_dispute">Payment Dispute</option>
        <option value="fraud">Fraud / Scam</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Description *</label>
      <textarea
        v-model="complaintDescription"
        class="form-textarea"
        rows="4"
        placeholder="Describe the issue in detail..."
      ></textarea>
    </div>
    <template #footer>
      <button type="button" class="btn btn-secondary" @click="showComplaintModal = false">Cancel</button>
      <button
        type="button"
        class="btn btn-danger"
        :disabled="!complaintIssueType || !complaintDescription.trim() || actionLoading"
        @click="handleFileComplaint"
      >
        Submit Complaint
      </button>
    </template>
  </AppModal>
</template>

<script setup>
import { ref, computed } from 'vue';
import { TransactionStatus } from '../../../domain/enums/statuses.js';
import AppModal from '../../../components/AppModal.vue';

const props = defineProps({
  transaction: { type: Object, default: null },
  currentUserId: { type: String, required: true },
  existingComplaint: { type: Object, default: null },
  actionLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['file-complaint']);

const showComplaintModal = ref(false);
const complaintIssueType = ref('');
const complaintDescription = ref('');

const canFileComplaint = computed(() => {
  if (!props.transaction) return false;
  const eligibleStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  if (!eligibleStates.includes(props.transaction.status)) return false;
  // Non-participants (e.g. moderators who can view the thread) must not see the button
  return props.transaction.buyerId === props.currentUserId || props.transaction.sellerId === props.currentUserId;
});

function handleFileComplaint() {
  if (!complaintIssueType.value || !complaintDescription.value.trim()) return;
  emit('file-complaint', {
    issueType: complaintIssueType.value,
    description: complaintDescription.value.trim(),
  });
  showComplaintModal.value = false;
  complaintIssueType.value = '';
  complaintDescription.value = '';
}
</script>
