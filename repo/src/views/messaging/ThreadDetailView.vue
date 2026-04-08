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
          <ThreadMessageList ref="messageListRef" :messages="messages" :current-user-id="authStore.userId" />
          <ThreadComposer :is-read-only="thread.isReadOnly" :sending="sending" @send="handleSendMessage" />
        </div>

        <!-- Transaction Sidebar (Right) -->
        <div class="transaction-sidebar" data-testid="transaction-sidebar">
          <TransactionPanel
            :transaction="transaction" :current-user-id="authStore.userId"
            :is-buyer="isBuyer" :action-loading="actionLoading"
            @create-transaction="handleCreateTransaction" @transition="handleTransition"
            @cancel="handleCancelTransaction" @reservation-expired="fetchTransaction"
          >
            <template #complaint>
              <ComplaintSection
                :transaction="transaction" :current-user-id="authStore.userId"
                :existing-complaint="existingComplaint" :action-loading="actionLoading"
                @file-complaint="handleFileComplaint"
              />
            </template>
            <template #delivery>
              <DeliverySection
                :transaction="transaction" :listing-offers-delivery="listingOffersDelivery"
                :transaction-id="transaction?.id" :session="authStore.session"
                @booked="fetchTransaction"
              />
            </template>
          </TransactionPanel>

          <div class="card">
            <h3>Actions</h3>
            <div class="action-buttons">
              <button class="btn btn-danger" @click="showBlockConfirm = true">Block User</button>
              <button class="btn btn-secondary" @click="showReportModal = true">Report User</button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        v-model="showBlockConfirm" title="Block User"
        message="Are you sure you want to block this user? You will no longer be able to communicate with them."
        confirm-text="Block" :danger-mode="true" @confirm="handleBlockUser"
      />

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
          <textarea v-model="reportDescription" class="form-textarea" placeholder="Provide additional details..." rows="3" />
        </div>
        <template #footer>
          <button type="button" class="btn btn-secondary" @click="showReportModal = false">Cancel</button>
          <button type="button" class="btn btn-danger" :disabled="!reportReason || actionLoading" @click="handleReportUser">Submit Report</button>
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
import { SupportService } from '../../services/SupportService.js';
import { RouteNames } from '../../app/router/routeNames.js';
import AppModal from '../../components/AppModal.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import ThreadMessageList from './components/ThreadMessageList.vue';
import ThreadComposer from './components/ThreadComposer.vue';
import TransactionPanel from './components/TransactionPanel.vue';
import ComplaintSection from './components/ComplaintSection.vue';
import DeliverySection from './components/DeliverySection.vue';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const thread = ref(null);
const messages = ref([]);
const transaction = ref(null);
const listing = ref(null);
const loading = ref(false);
const sending = ref(false);
const actionLoading = ref(false);
const existingComplaint = ref(null);
const messageListRef = ref(null);

let pollInterval = null;

const showBlockConfirm = ref(false);
const showReportModal = ref(false);
const reportReason = ref('');
const reportDescription = ref('');

const otherPartyId = computed(() => {
  if (!thread.value) return null;
  return thread.value.buyerId === authStore.userId ? thread.value.sellerId : thread.value.buyerId;
});
const isBuyer = computed(() => thread.value && thread.value.buyerId === authStore.userId);
const listingOffersDelivery = computed(() => listing.value?.deliveryOptions?.delivery === true);

// ── Data fetching ──
async function fetchThread() {
  try { thread.value = await ThreadService.getById(authStore.session, props.id); }
  catch (err) { toast.error(err.message || 'Failed to load thread'); }
}
async function fetchMessages() {
  try {
    messages.value = await ThreadService.getMessages(authStore.session, props.id);
    await nextTick();
    messageListRef.value?.scrollToBottom();
  } catch (err) { toast.error(err.message || 'Failed to load messages'); }
}
async function fetchTransaction() {
  try {
    if (!thread.value) return;
    transaction.value = await TransactionService.getByThreadId(authStore.session, props.id);
    await fetchExistingComplaint();
  } catch { transaction.value = null; }
}
async function fetchListing() {
  if (!thread.value?.listingId) return;
  try { listing.value = await ListingService.getById(authStore.session, thread.value.listingId); }
  catch { listing.value = null; }
}
async function fetchExistingComplaint() {
  if (!transaction.value) return;
  try {
    const list = await SupportService.getMyComplaints(authStore.session);
    existingComplaint.value = list.find(c => c.transactionId === transaction.value.id) || null;
  } catch { existingComplaint.value = null; }
}

// ── Action handlers ──
async function handleSendMessage(content) {
  sending.value = true;
  try { await ThreadService.sendMessage(authStore.session, props.id, content); await fetchMessages(); }
  catch (err) { toast.error(err.message || 'Failed to send message'); }
  finally { sending.value = false; }
}
async function handleCreateTransaction() {
  actionLoading.value = true;
  try { transaction.value = await TransactionService.create(authStore.session, props.id); toast.success('Transaction started.'); }
  catch (err) { toast.error(err.message || 'Failed to create transaction'); }
  finally { actionLoading.value = false; }
}
async function handleTransition(targetStatus) {
  actionLoading.value = true;
  try {
    transaction.value = await TransactionService.transition(authStore.session, transaction.value.id, targetStatus);
    toast.success(`Transaction moved to ${targetStatus}.`);
    await fetchThread();
  } catch (err) { toast.error(err.message || 'Failed to update transaction'); }
  finally { actionLoading.value = false; }
}
async function handleCancelTransaction(reason) {
  actionLoading.value = true;
  try {
    transaction.value = await TransactionService.cancel(authStore.session, transaction.value.id, reason);
    toast.success('Transaction canceled.');
    await fetchThread();
  } catch (err) { toast.error(err.message || 'Failed to cancel transaction'); }
  finally { actionLoading.value = false; }
}
async function handleBlockUser() {
  showBlockConfirm.value = false;
  actionLoading.value = true;
  try { await UserService.blockUser(authStore.session, otherPartyId.value); toast.success('User blocked.'); router.push({ name: RouteNames.THREADS }); }
  catch (err) { toast.error(err.message || 'Failed to block user'); }
  finally { actionLoading.value = false; }
}
async function handleReportUser() {
  if (!reportReason.value) return;
  actionLoading.value = true;
  try {
    await ModerationService.createReport(authStore.session, { targetId: otherPartyId.value, targetType: 'user', reason: reportReason.value, description: reportDescription.value });
    showReportModal.value = false; reportReason.value = ''; reportDescription.value = '';
    toast.success('Report submitted.');
  } catch (err) { toast.error(err.message || 'Failed to submit report'); }
  finally { actionLoading.value = false; }
}
async function handleFileComplaint({ issueType, description }) {
  actionLoading.value = true;
  try {
    await SupportService.createComplaint(authStore.session, { transactionId: transaction.value.id, issueType, description });
    toast.success('Complaint filed successfully.');
    await fetchExistingComplaint();
  } catch (err) { toast.error(err.message || 'Failed to file complaint'); }
  finally { actionLoading.value = false; }
}

// ── Polling & Lifecycle ──
onMounted(async () => {
  loading.value = true;
  try { await fetchThread(); await Promise.all([fetchMessages(), fetchTransaction(), fetchListing()]); }
  finally { loading.value = false; }
  pollInterval = setInterval(() => fetchMessages(), 5000);
});
onUnmounted(() => { if (pollInterval) clearInterval(pollInterval); });
</script>
