/**
 * Moderation Store — centralized review queue state.
 * Replaces view-local state in ModerationView.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ModerationService } from '../../services/ModerationService.js';

export const useModerationStore = defineStore('moderation', () => {
  const queue = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchQueue(session) {
    if (!session) return;
    loading.value = true;
    error.value = null;
    try {
      queue.value = await ModerationService.getReviewQueue(session);
    } catch (e) {
      error.value = e.message || 'Failed to load moderation queue';
      queue.value = [];
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    queue.value = [];
    loading.value = false;
    error.value = null;
  }

  return { queue, loading, error, fetchQueue, reset };
});
