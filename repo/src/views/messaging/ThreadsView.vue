<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Messages</h1>
    </div>

    <div v-if="loading" class="loading-state">Loading threads...</div>

    <EmptyState
      v-else-if="threads.length === 0"
      title="No conversations"
      description="When you start a conversation on a listing, it will appear here."
    />

    <div v-else class="thread-list">
      <div
        v-for="thread in threads"
        :key="thread.id"
        class="card thread-card"
        @click="goToThread(thread.id)"
      >
        <div class="thread-card-body">
          <div class="thread-info">
            <h3 class="thread-title">
              {{ thread.listingTitle || `Listing #${thread.listingId}` }}
            </h3>
            <p class="thread-party">{{ otherPartyName(thread) }}</p>
            <p v-if="thread.lastMessage" class="thread-preview">
              {{ thread.lastMessage.content }}
            </p>
          </div>
          <div class="thread-meta">
            <span v-if="thread.unreadCount" class="badge badge-primary">
              {{ thread.unreadCount }}
            </span>
            <span class="thread-date">
              {{ thread.updatedAt ? new Date(thread.updatedAt).toLocaleDateString() : '' }}
            </span>
          </div>
        </div>
        <div class="thread-card-actions" @click.stop>
          <button class="btn btn-secondary btn-sm" @click="handleArchive(thread.id)">
            Archive
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ThreadService } from '../../services/ThreadService.js';
import { UserService } from '../../services/UserService.js';
import { RouteNames } from '../../app/router/routeNames.js';
import EmptyState from '../../components/EmptyState.vue';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const threads = ref([]);
const loading = ref(false);
const profileCache = ref({});

function otherPartyName(thread) {
  const otherId = thread.buyerId === authStore.userId ? thread.sellerId : thread.buyerId;
  const cached = profileCache.value[otherId];
  return cached?.displayName || cached?.username || otherId;
}

async function fetchThreads() {
  loading.value = true;
  try {
    const result = await ThreadService.getMyThreads(authStore.session);
    threads.value = result;

    const userIds = new Set();
    for (const thread of result) {
      const otherId = thread.buyerId === authStore.userId ? thread.sellerId : thread.buyerId;
      if (!profileCache.value[otherId]) {
        userIds.add(otherId);
      }
    }

    const profilePromises = [...userIds].map(async (uid) => {
      try {
        const profile = await UserService.getProfile(authStore.session, uid);
        profileCache.value[uid] = profile;
      } catch {
        // Non-critical; fall back to user ID display
      }
    });
    await Promise.all(profilePromises);
  } catch (err) {
    toast.error(err.message || 'Failed to load threads');
  } finally {
    loading.value = false;
  }
}

function goToThread(threadId) {
  router.push({ name: RouteNames.THREAD_DETAIL, params: { id: threadId } });
}

async function handleArchive(threadId) {
  try {
    await ThreadService.archive(authStore.session, threadId);
    threads.value = threads.value.filter(t => t.id !== threadId);
    toast.success('Thread archived.');
  } catch (err) {
    toast.error(err.message || 'Failed to archive thread');
  }
}

onMounted(() => {
  fetchThreads();
});
</script>
