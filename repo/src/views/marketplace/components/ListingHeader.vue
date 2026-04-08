<template>
  <div class="page-header">
    <div>
      <h1>{{ listing.title }}</h1>
      <div class="listing-badges">
        <StatusBadge :status="listing.status" />
        <span v-if="listing.isPinned" class="badge badge-info">Pinned</span>
        <span v-if="listing.isFeatured" class="badge badge-warning">Featured</span>
      </div>
    </div>
    <div class="header-actions">
      <button v-if="actions.canPublish" class="btn btn-primary" @click="$emit('publish')">
        Publish
      </button>
      <button v-if="actions.canEdit" class="btn btn-secondary" @click="$emit('edit')">
        Edit
      </button>
      <button v-if="actions.canArchive" class="btn btn-danger" @click="showArchiveConfirm = true">
        Archive
      </button>
      <button v-if="actions.canStartThread" class="btn btn-primary" @click="startConversation">
        Start Conversation
      </button>
      <button v-if="actions.canPin" class="btn btn-secondary" @click="$emit('toggle-pin')">
        {{ listing.isPinned ? 'Unpin' : 'Pin' }}
      </button>
      <button v-if="actions.canFeature" class="btn btn-secondary" @click="$emit('toggle-feature')">
        {{ listing.isFeatured ? 'Unfeature' : 'Feature' }}
      </button>
      <button v-if="actions.canReport" class="btn btn-ghost" @click="showReportModal = true">
        Report
      </button>
    </div>

    <!-- Seller Info -->
    <div class="card" style="width: 100%;">
      <h3>Seller Information</h3>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <UserAvatar :userId="listing.sellerId" size="md" />
        <div>
          <p style="margin: 0; font-weight: 600;">{{ sellerDisplayName }}</p>
          <p style="margin: 0; font-size: 0.75rem; color: var(--color-text-muted, #6b7280);">
            Member since {{ sellerMemberSince }}
          </p>
        </div>
      </div>
    </div>

    <!-- Report Modal -->
    <AppModal v-model="showReportModal" title="Report Listing" max-width="480px">
      <div class="form-group">
        <label class="form-label">Reason</label>
        <select v-model="reportReason" class="form-select">
          <option value="">Select a reason</option>
          <option value="spam">Spam</option>
          <option value="inappropriate">Inappropriate Content</option>
          <option value="fraud">Fraud / Scam</option>
          <option value="prohibited">Prohibited Item</option>
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
        <button type="button" class="btn btn-danger" :disabled="!reportReason" @click="submitReport">Submit Report</button>
      </template>
    </AppModal>

    <!-- Archive Confirm -->
    <ConfirmModal
      v-model="showArchiveConfirm"
      title="Archive Listing"
      message="Are you sure you want to archive this listing? This action cannot be easily undone."
      confirm-text="Archive"
      :danger-mode="true"
      @confirm="handleArchive"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../../app/store/authStore.js';
import { useToast } from '../../../composables/useToast.js';
import { ModerationService } from '../../../services/ModerationService.js';
import { ThreadService } from '../../../services/ThreadService.js';
import { useUserProfile } from '../../../composables/useUserProfile.js';
import { RouteNames } from '../../../app/router/routeNames.js';
import StatusBadge from '../../../components/StatusBadge.vue';
import AppModal from '../../../components/AppModal.vue';
import ConfirmModal from '../../../components/ConfirmModal.vue';
import UserAvatar from '../../../components/UserAvatar.vue';

const props = defineProps({
  listing: { type: Object, required: true },
  listingId: { type: String, required: true },
  actions: { type: Object, required: true },
});

const emit = defineEmits([
  'publish',
  'edit',
  'archive',
  'toggle-pin',
  'toggle-feature',
]);

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

// ── Start Conversation ──
async function startConversation() {
  try {
    const thread = await ThreadService.create(authStore.session, props.listingId);
    router.push({ name: RouteNames.THREAD_DETAIL, params: { id: thread.id } });
  } catch (err) {
    toast.error(err.message || 'Failed to start conversation');
  }
}

// ── Seller profile ──
const { getProfile: fetchProfile } = useUserProfile();
const sellerProfile = ref(null);

const sellerDisplayName = computed(() =>
  sellerProfile.value?.displayName || sellerProfile.value?.username || props.listing?.sellerId || ''
);
const sellerMemberSince = computed(() => {
  if (!sellerProfile.value?.createdAt) return '-';
  return new Date(sellerProfile.value.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
});

onMounted(() => {
  fetchProfile(props.listing.sellerId).then(p => { sellerProfile.value = p; }).catch(() => {});
});

// ── Report ──
const showReportModal = ref(false);
const reportReason = ref('');
const reportDescription = ref('');

async function submitReport() {
  if (!reportReason.value) return;
  try {
    await ModerationService.createReport(authStore.session, {
      targetId: props.listingId,
      targetType: 'listing',
      reason: reportReason.value,
      description: reportDescription.value,
    });
    showReportModal.value = false;
    reportReason.value = '';
    reportDescription.value = '';
    toast.success('Report submitted.');
  } catch (err) {
    toast.error(err.message || 'Failed to submit report');
  }
}

// ── Archive ──
const showArchiveConfirm = ref(false);

function handleArchive() {
  showArchiveConfirm.value = false;
  emit('archive');
}
</script>
