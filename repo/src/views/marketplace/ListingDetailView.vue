<template>
  <div class="page-content">
    <div v-if="loading" class="loading-state">Loading listing...</div>
    <template v-else-if="listing">
      <ListingHeader
        :listing="listing"
        :listing-id="props.id"
        :actions="listingActions"
        @publish="handlePublish"
        @edit="router.push({ name: RouteNames.EDIT_LISTING, params: { id: props.id } })"
        @archive="handleArchive"
        @toggle-pin="handleTogglePin"
        @toggle-feature="handleToggleFeature"
      />
      <ListingMedia :media="listing.media" />
      <ListingDescription :listing="listing" :category-name="categoryName" />
      <ListingTransactionEntry :listing-id="props.id" :can-start-thread="listingActions.canStartThread" />

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" :class="{ active: detailTab === 'comments' }" @click="detailTab = 'comments'">Comments</button>
        <button class="tab" :class="{ active: detailTab === 'qa' }" @click="detailTab = 'qa'">Q&amp;A</button>
        <button v-if="isOwner" class="tab" :class="{ active: detailTab === 'versions' }" @click="detailTab = 'versions'; fetchVersions()">Version History</button>
      </div>

      <ListingComments v-if="detailTab === 'comments'" :listing-id="props.id" :comments="comments" @refresh="refreshAll" />
      <ListingQA v-if="detailTab === 'qa'" :listing-id="props.id" :qa-items="qaItems" :is-owner="isOwner" @refresh="refreshAll" />
      <ListingModerationActions v-if="detailTab === 'versions'" :listing-id="props.id" :versions="versions" :is-owner="isOwner" @rollback="l => listing = l" @refresh-versions="fetchVersions" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ListingService } from '../../services/ListingService.js';
import { AdminService } from '../../services/AdminService.js';
import { CommentService } from '../../services/CommentService.js';
import { getListingActions } from '../../domain/policies/actionPolicy.js';
import { RouteNames } from '../../app/router/routeNames.js';
import ListingHeader from './components/ListingHeader.vue';
import ListingMedia from './components/ListingMedia.vue';
import ListingDescription from './components/ListingDescription.vue';
import ListingComments from './components/ListingComments.vue';
import ListingQA from './components/ListingQA.vue';
import ListingModerationActions from './components/ListingModerationActions.vue';
import ListingTransactionEntry from './components/ListingTransactionEntry.vue';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const listing = ref(null);
const categories = ref([]);
const comments = ref([]);
const qaItems = ref([]);
const versions = ref([]);
const loading = ref(false);
const detailTab = ref('comments');

const isOwner = computed(() => listing.value?.sellerId === authStore.userId);
const listingActions = computed(() => getListingActions(authStore.userId, authStore.roles, listing.value));
const categoryName = computed(() => {
  const cat = categories.value.find(c => c.id === listing.value?.categoryId);
  return cat ? cat.name : 'Uncategorized';
});

// ── Data Fetching ──
async function fetchListing() {
  loading.value = true;
  try { listing.value = await ListingService.getById(authStore.session, props.id); }
  catch (err) { toast.error(err.message || 'Failed to load listing'); }
  finally { loading.value = false; }
}
async function fetchCategories() {
  try { categories.value = await AdminService.getAllCategories(authStore.session); } catch { /* non-critical */ }
}
async function fetchComments() {
  try { const all = await CommentService.getByListingId(authStore.session, props.id); comments.value = all.filter(c => c.type === 'comment'); }
  catch (err) { toast.error(err.message || 'Failed to load comments'); }
}
async function fetchQA() {
  try { qaItems.value = await CommentService.getQAByListingId(authStore.session, props.id); }
  catch (err) { toast.error(err.message || 'Failed to load Q&A'); }
}
async function fetchVersions() {
  try { versions.value = await ListingService.getVersions(authStore.session, props.id); }
  catch (err) { toast.error(err.message || 'Failed to load version history'); }
}
async function refreshAll() { await Promise.all([fetchComments(), fetchQA()]); }

// ── Listing Actions ──
async function handlePublish() {
  try {
    const result = await ListingService.publish(authStore.session, props.id);
    listing.value = result.listing;
    toast[result.flagged ? 'warning' : 'success'](result.flagged ? 'Listing submitted for review due to content screening.' : 'Listing published successfully.');
  } catch (err) { toast.error(err.message || 'Failed to publish listing'); }
}
async function handleArchive() {
  try { listing.value = await ListingService.archive(authStore.session, props.id); toast.success('Listing archived.'); }
  catch (err) { toast.error(err.message || 'Failed to archive listing'); }
}
async function handleTogglePin() {
  try { listing.value = await ListingService.togglePin(authStore.session, props.id); toast.success(listing.value.isPinned ? 'Listing pinned.' : 'Listing unpinned.'); }
  catch (err) { toast.error(err.message || 'Failed to toggle pin'); }
}
async function handleToggleFeature() {
  try { listing.value = await ListingService.toggleFeature(authStore.session, props.id); toast.success(listing.value.isFeatured ? 'Listing featured.' : 'Listing unfeatured.'); }
  catch (err) { toast.error(err.message || 'Failed to toggle feature'); }
}

onMounted(() => { fetchListing(); fetchCategories(); fetchComments(); fetchQA(); });
</script>
