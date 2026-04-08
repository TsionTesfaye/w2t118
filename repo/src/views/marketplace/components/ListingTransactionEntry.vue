<template>
  <div v-if="canStartThread" class="card transaction-entry">
    <h3>Interested in this listing?</h3>
    <p>Start a conversation with the seller to discuss details and begin a transaction.</p>
    <button class="btn btn-primary" @click="startConversation">
      Start Conversation
    </button>
  </div>
</template>

<script setup>
import { useAuthStore } from '../../../app/store/authStore.js';
import { useToast } from '../../../composables/useToast.js';
import { ThreadService } from '../../../services/ThreadService.js';
import { useRouter } from 'vue-router';
import { RouteNames } from '../../../app/router/routeNames.js';

const props = defineProps({
  listingId: { type: String, required: true },
  canStartThread: { type: Boolean, default: false },
});

const authStore = useAuthStore();
const toast = useToast();
const router = useRouter();

async function startConversation() {
  try {
    const thread = await ThreadService.create(authStore.session, props.listingId);
    router.push({ name: RouteNames.THREAD_DETAIL, params: { id: thread.id } });
  } catch (err) {
    toast.error(err.message || 'Failed to start conversation');
  }
}
</script>
