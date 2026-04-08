<template>
  <div v-if="isOwner" class="card">
    <h3>Version History</h3>
    <div v-if="versions.length === 0" class="empty-state">
      <p>No version history available.</p>
    </div>
    <div class="version-list">
      <div v-for="version in versions" :key="version.id" class="version-item">
        <div>
          <strong>{{ version.snapshot?.title || 'Untitled' }}</strong>
          <span class="version-date">{{ new Date(version.createdAt).toLocaleString() }}</span>
        </div>
        <button class="btn btn-secondary" @click="confirmRollback(version)">
          Rollback
        </button>
      </div>
    </div>

    <!-- Rollback Confirm -->
    <ConfirmModal
      v-model="showRollbackConfirm"
      title="Rollback Listing"
      message="Are you sure you want to rollback to this version? The current state will be saved as a new version."
      confirm-text="Rollback"
      @confirm="handleRollback"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAuthStore } from '../../../app/store/authStore.js';
import { useToast } from '../../../composables/useToast.js';
import { ListingService } from '../../../services/ListingService.js';
import ConfirmModal from '../../../components/ConfirmModal.vue';

const props = defineProps({
  listingId: { type: String, required: true },
  versions: { type: Array, default: () => [] },
  isOwner: { type: Boolean, default: false },
});

const emit = defineEmits(['rollback', 'refresh-versions']);

const authStore = useAuthStore();
const toast = useToast();

const showRollbackConfirm = ref(false);
const rollbackTarget = ref(null);

function confirmRollback(version) {
  rollbackTarget.value = version;
  showRollbackConfirm.value = true;
}

async function handleRollback() {
  showRollbackConfirm.value = false;
  if (!rollbackTarget.value) return;
  try {
    const updatedListing = await ListingService.rollback(authStore.session, props.listingId, rollbackTarget.value.id);
    toast.success('Listing rolled back to selected version.');
    rollbackTarget.value = null;
    emit('rollback', updatedListing);
    emit('refresh-versions');
  } catch (err) {
    toast.error(err.message || 'Failed to rollback listing');
  }
}
</script>
