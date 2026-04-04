<template>
  <div class="page-content">
    <div v-if="loading" class="loading-state">Loading conversation...</div>

    <template v-else-if="thread">
      <div class="page-header">
        <h1>{{ thread.listingTitle || `Listing #${thread.listingId}` }}</h1>
        <span class="badge" v-if="thread.isReadOnly">Read-Only</span>
      </div>

      <div class="thread-detail-layout">
        <!-- Chat Panel (Left) -->
        <div class="chat-panel" data-testid="chat-panel">
          <div ref="messagesContainer" class="chat-messages">
            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="['chat-bubble', msg.senderId === authStore.userId ? 'mine' : 'theirs']"
            >
              <div v-if="msg.senderId !== authStore.userId" class="chat-sender">
                <UserAvatar :userId="msg.senderId" show-name size="sm" />
              </div>
              <p>{{ msg.content }}</p>
              <span class="chat-time">{{ formatTime12h(msg.createdAt) }}</span>
            </div>
          </div>

          <div v-if="thread.isReadOnly" class="alert-warning">
            This conversation is read-only.
          </div>
          <form v-else class="chat-input-area" @submit.prevent="handleSendMessage">
            <input
              v-model="newMessage"
              type="text"
              class="form-input"
              placeholder="Type a message..."
              :disabled="sending"
            />
            <button type="submit" class="btn btn-primary" :disabled="!newMessage.trim() || sending">
              Send
            </button>
          </form>
        </div>

        <!-- Transaction Sidebar (Right) -->
        <div class="transaction-sidebar" data-testid="transaction-sidebar">
          <!-- Transaction Status -->
          <div class="card">
            <h3>Transaction</h3>

            <div v-if="!transaction">
              <p>No transaction started.</p>
              <button
                v-if="isBuyer"
                class="btn btn-primary"
                :disabled="actionLoading"
                @click="handleCreateTransaction"
              >
                Start Transaction
              </button>
            </div>

            <div v-else>
              <div class="transaction-status-row">
                <StatusBadge :status="transaction.status" />
                <span v-if="isReservationExpired" class="badge badge-danger">Expired</span>
              </div>

              <!-- Reservation Timer -->
              <div
                v-if="transaction.status === TransactionStatus.RESERVED && !isReservationExpired"
                class="timer"
              >
                Time remaining: {{ reservationCountdown }}
              </div>

              <!-- State Actions — visibility derived from central action policy -->
              <div class="transaction-actions">
                <!-- INQUIRY → RESERVED: seller only -->
                <button
                  v-if="txActions.canReserve && !isReservationExpired"
                  class="btn btn-primary"
                  :disabled="actionLoading"
                  @click="handleTransition(TransactionStatus.RESERVED)"
                >
                  Reserve
                </button>

                <!-- RESERVED → AGREED: buyer only -->
                <button
                  v-if="txActions.canAgree && !isReservationExpired"
                  class="btn btn-primary"
                  :disabled="actionLoading"
                  @click="handleTransition(TransactionStatus.AGREED)"
                >
                  Agree
                </button>

                <!-- AGREED → COMPLETED: buyer only -->
                <button
                  v-if="txActions.canComplete"
                  class="btn btn-primary"
                  :disabled="actionLoading"
                  @click="handleTransition(TransactionStatus.COMPLETED)"
                >
                  Complete
                </button>

                <!-- CANCEL: either participant, any non-terminal state -->
                <button
                  v-if="txActions.canCancel"
                  class="btn btn-danger"
                  :disabled="actionLoading"
                  @click="showCancelModal = true"
                >
                  Cancel
                </button>
              </div>

              <!-- Terminal state message -->
              <div v-if="isTerminal" class="alert-info">
                This transaction is {{ transaction.status }}.
                <span v-if="transaction.cancellationReason">
                  Reason: {{ transaction.cancellationReason }}
                </span>
              </div>

              <!-- Complaint Section -->
              <div v-if="canFileComplaint" class="complaint-section" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color, #e5e7eb);">
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

              <!-- Delivery Section — extracted into DeliverySection component -->
              <DeliverySection
                v-if="listingOffersDelivery && (transaction.status === TransactionStatus.RESERVED || transaction.status === TransactionStatus.AGREED)"
                :transaction-id="transaction.id"
                :session="authStore.session"
              />
            </div>
          </div>

          <!-- User Actions -->
          <div class="card">
            <h3>Actions</h3>
            <div class="action-buttons">
              <button class="btn btn-danger" @click="showBlockConfirm = true">
                Block User
              </button>
              <button class="btn btn-secondary" @click="showReportModal = true">
                Report User
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel Transaction Modal -->
      <AppModal v-model="showCancelModal" title="Cancel Transaction" max-width="480px">
        <div class="form-group">
          <label class="form-label">Reason</label>
          <select v-model="cancelReason" class="form-select">
            <option value="">Select a reason</option>
            <option
              v-for="(value, key) in CancellationReasons"
              :key="key"
              :value="value"
            >
              {{ key.replace(/_/g, ' ') }}
            </option>
          </select>
        </div>
        <template #footer>
          <button type="button" class="btn btn-secondary" @click="showCancelModal = false">Back</button>
          <button type="button" class="btn btn-danger" :disabled="!cancelReason || actionLoading" @click="handleCancelTransaction">
            Cancel Transaction
          </button>
        </template>
      </AppModal>

      <!-- Block User Confirm -->
      <ConfirmModal
        v-model="showBlockConfirm"
        title="Block User"
        message="Are you sure you want to block this user? You will no longer be able to communicate with them."
        confirm-text="Block"
        :danger-mode="true"
        @confirm="handleBlockUser"
      />

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

      <!-- Report User Modal -->
      <AppModal v-model="showReportModal" title="Report User" max-width="480px">
        <div class="form-group">
          <label class="form-label">Reason</label>
          <select v-model="reportReason" class="form-select">
            <option value="">Select a reason</option>
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="fraud">Fraud / Scam</option>
            <option value="inappropriate">Inappropriate Behavior</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea
            v-model="reportDescription"
            class="form-textarea"
            placeholder="Provide additional details..."
            rows="3"
          ></textarea>
        </div>
        <template #footer>
          <button type="button" class="btn btn-secondary" @click="showReportModal = false">Cancel</button>
          <button type="button" class="btn btn-danger" :disabled="!reportReason || actionLoading" @click="handleReportUser">
            Submit Report
          </button>
        </template>
      </AppModal>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ThreadService } from '../../services/ThreadService.js';
import { TransactionService } from '../../services/TransactionService.js';
import { ListingService } from '../../services/ListingService.js';
import { UserService } from '../../services/UserService.js';
import { ModerationService } from '../../services/ModerationService.js';
import { TransactionStatus, CancellationReasons, TRANSACTION_TERMINAL_STATES } from '../../domain/enums/statuses.js';
import { getTransactionActions } from '../../domain/policies/actionPolicy.js';
import { SupportService } from '../../services/SupportService.js';
import { formatTime12h, THIRTY_MINUTES_MS } from '../../utils/time.js';
import { RouteNames } from '../../app/router/routeNames.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import UserAvatar from '../../components/UserAvatar.vue';
import DeliverySection from '../../components/DeliverySection.vue';

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

// Core state
const thread = ref(null);
const messages = ref([]);
const transaction = ref(null);
const listing = ref(null);
const loading = ref(false);
const sending = ref(false);
const actionLoading = ref(false);

// Chat
const newMessage = ref('');
const messagesContainer = ref(null);

// Polling
let pollInterval = null;

// Transaction cancel
const showCancelModal = ref(false);
const cancelReason = ref('');

// User actions
const showBlockConfirm = ref(false);
const showReportModal = ref(false);
const reportReason = ref('');
const reportDescription = ref('');

// Reservation timer
const countdownSeconds = ref(0);
let countdownInterval = null;

// Computed
const otherPartyId = computed(() => {
  if (!thread.value) return null;
  return thread.value.buyerId === authStore.userId ? thread.value.sellerId : thread.value.buyerId;
});

const isBuyer = computed(() => thread.value && thread.value.buyerId === authStore.userId);

const isTerminal = computed(() => {
  if (!transaction.value) return false;
  return TRANSACTION_TERMINAL_STATES.includes(transaction.value.status);
});

const isReservationExpired = computed(() => {
  if (!transaction.value) return false;
  if (transaction.value.status !== TransactionStatus.RESERVED) return false;
  if (!transaction.value.reservedAt) return false;
  return Date.now() - transaction.value.reservedAt > THIRTY_MINUTES_MS;
});

// Derived from central action policy — single source of truth for button visibility
const txActions = computed(() => getTransactionActions(authStore.userId, transaction.value));

// Delivery is only available if the listing explicitly offers it
const listingOffersDelivery = computed(() => listing.value?.deliveryOptions?.delivery === true);

// Complaint filing: only on agreed or completed transactions, by a direct participant
const canFileComplaint = computed(() => {
  if (!transaction.value) return false;
  const eligibleStates = [TransactionStatus.AGREED, TransactionStatus.COMPLETED];
  if (!eligibleStates.includes(transaction.value.status)) return false;
  // Non-participants (e.g. moderators who can view the thread) must not see the button
  return transaction.value.buyerId === authStore.userId || transaction.value.sellerId === authStore.userId;
});

// Complaint modal state
const showComplaintModal = ref(false);
const complaintIssueType = ref('');
const complaintDescription = ref('');
const existingComplaint = ref(null);

const reservationCountdown = computed(() => {
  const secs = countdownSeconds.value;
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

// Data fetching
async function fetchThread() {
  try {
    thread.value = await ThreadService.getById(authStore.session, props.id);
  } catch (err) {
    toast.error(err.message || 'Failed to load thread');
  }
}

async function fetchMessages() {
  try {
    messages.value = await ThreadService.getMessages(authStore.session, props.id);
    await nextTick();
    scrollToBottom();
  } catch (err) {
    toast.error(err.message || 'Failed to load messages');
  }
}

async function fetchTransaction() {
  try {
    if (!thread.value) return;
    // Transactions are linked by threadId, not stored on the thread object
    const tx = await TransactionService.getByThreadId(authStore.session, props.id);
    transaction.value = tx;
    updateCountdown();
    await fetchExistingComplaint();
  } catch {
    // No transaction exists yet, which is a normal state
    transaction.value = null;
  }
}

async function fetchListing() {
  if (!thread.value?.listingId) return;
  try {
    listing.value = await ListingService.getById(authStore.session, thread.value.listingId);
  } catch {
    listing.value = null;
  }
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function updateCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (
    !transaction.value ||
    transaction.value.status !== TransactionStatus.RESERVED ||
    !transaction.value.reservedAt
  ) {
    countdownSeconds.value = 0;
    return;
  }

  const update = () => {
    const elapsed = Date.now() - transaction.value.reservedAt;
    const remaining = Math.max(0, Math.floor((THIRTY_MINUTES_MS - elapsed) / 1000));
    countdownSeconds.value = remaining;
    if (remaining <= 0 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      fetchTransaction();
    }
  };

  update();
  countdownInterval = setInterval(update, 1000);
}

// Actions
async function handleSendMessage() {
  const content = newMessage.value.trim();
  if (!content) return;

  sending.value = true;
  try {
    await ThreadService.sendMessage(authStore.session, props.id, content);
    newMessage.value = '';
    await fetchMessages();
  } catch (err) {
    toast.error(err.message || 'Failed to send message');
  } finally {
    sending.value = false;
  }
}

async function handleCreateTransaction() {
  actionLoading.value = true;
  try {
    transaction.value = await TransactionService.create(authStore.session, props.id);
    toast.success('Transaction started.');
  } catch (err) {
    toast.error(err.message || 'Failed to create transaction');
  } finally {
    actionLoading.value = false;
  }
}

async function handleTransition(targetStatus) {
  actionLoading.value = true;
  try {
    transaction.value = await TransactionService.transition(
      authStore.session,
      transaction.value.id,
      targetStatus,
    );
    updateCountdown();
    toast.success(`Transaction moved to ${targetStatus}.`);
    // Refresh thread in case read-only status changed
    await fetchThread();
  } catch (err) {
    toast.error(err.message || 'Failed to update transaction');
  } finally {
    actionLoading.value = false;
  }
}

async function handleCancelTransaction() {
  if (!cancelReason.value) return;

  actionLoading.value = true;
  try {
    transaction.value = await TransactionService.cancel(
      authStore.session,
      transaction.value.id,
      cancelReason.value,
    );
    showCancelModal.value = false;
    cancelReason.value = '';
    updateCountdown();
    toast.success('Transaction canceled.');
    await fetchThread();
  } catch (err) {
    toast.error(err.message || 'Failed to cancel transaction');
  } finally {
    actionLoading.value = false;
  }
}

// User actions
async function handleBlockUser() {
  showBlockConfirm.value = false;
  actionLoading.value = true;
  try {
    await UserService.blockUser(authStore.session, otherPartyId.value);
    toast.success('User blocked.');
    router.push({ name: RouteNames.THREADS });
  } catch (err) {
    toast.error(err.message || 'Failed to block user');
  } finally {
    actionLoading.value = false;
  }
}

async function handleReportUser() {
  if (!reportReason.value) return;

  actionLoading.value = true;
  try {
    await ModerationService.createReport(authStore.session, {
      targetId: otherPartyId.value,
      targetType: 'user',
      reason: reportReason.value,
      description: reportDescription.value,
    });
    showReportModal.value = false;
    reportReason.value = '';
    reportDescription.value = '';
    toast.success('Report submitted.');
  } catch (err) {
    toast.error(err.message || 'Failed to submit report');
  } finally {
    actionLoading.value = false;
  }
}

// Complaint
async function fetchExistingComplaint() {
  if (!transaction.value) return;
  try {
    const myComplaints = await SupportService.getMyComplaints(authStore.session);
    existingComplaint.value = myComplaints.find(c => c.transactionId === transaction.value.id) || null;
  } catch {
    existingComplaint.value = null;
  }
}

async function handleFileComplaint() {
  if (!complaintIssueType.value || !complaintDescription.value.trim()) return;
  actionLoading.value = true;
  try {
    await SupportService.createComplaint(authStore.session, {
      transactionId: transaction.value.id,
      issueType: complaintIssueType.value,
      description: complaintDescription.value.trim(),
    });
    toast.success('Complaint filed successfully.');
    showComplaintModal.value = false;
    complaintIssueType.value = '';
    complaintDescription.value = '';
    await fetchExistingComplaint();
  } catch (err) {
    toast.error(err.message || 'Failed to file complaint');
  } finally {
    actionLoading.value = false;
  }
}

// Polling
function startPolling() {
  pollInterval = setInterval(async () => {
    await fetchMessages();
  }, 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// Lifecycle
onMounted(async () => {
  loading.value = true;
  try {
    await fetchThread();
    await Promise.all([fetchMessages(), fetchTransaction(), fetchListing()]);
  } finally {
    loading.value = false;
  }
  startPolling();
});

onUnmounted(() => {
  stopPolling();
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
});
</script>
