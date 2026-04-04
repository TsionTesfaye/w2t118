<template>
  <div class="page-content">
    <div v-if="loading" class="loading-state">Loading listing...</div>

    <template v-else-if="listing">
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
          <button v-if="listingActions.canPublish" class="btn btn-primary" @click="handlePublish">
            Publish
          </button>
          <button v-if="listingActions.canEdit" class="btn btn-secondary" @click="goToEdit">
            Edit
          </button>
          <button v-if="listingActions.canArchive" class="btn btn-danger" @click="showArchiveConfirm = true">
            Archive
          </button>
          <button v-if="listingActions.canStartThread" class="btn btn-primary" @click="startConversation">
            Start Conversation
          </button>
          <button v-if="listingActions.canPin" class="btn btn-secondary" @click="handleTogglePin">
            {{ listing.isPinned ? 'Unpin' : 'Pin' }}
          </button>
          <button v-if="listingActions.canFeature" class="btn btn-secondary" @click="handleToggleFeature">
            {{ listing.isFeatured ? 'Unfeature' : 'Feature' }}
          </button>
          <button v-if="listingActions.canReport" class="btn btn-ghost" @click="showReportModal = true">
            Report
          </button>
        </div>
      </div>

      <!-- Media Gallery -->
      <div v-if="listing.media && listing.media.length > 0" class="media-grid">
        <template v-for="(item, idx) in listing.media" :key="idx">
          <video
            v-if="isVideoMedia(item)"
            :src="item.url || item.data || ''"
            controls
            class="media-thumb"
          />
          <img
            v-else
            :src="item.url || item.data || ''"
            alt="Listing media"
            class="media-thumb"
          />
        </template>
      </div>

      <!-- Listing Details -->
      <div class="card listing-detail-card">
        <div class="stats-grid">
          <div>
            <strong>Price</strong>
            <p>{{ formatCurrency(listing.price) }}</p>
          </div>
          <div>
            <strong>Category</strong>
            <p>{{ categoryName }}</p>
          </div>
          <div>
            <strong>Delivery Options</strong>
            <p>
              <span v-if="listing.deliveryOptions?.pickup">Pickup</span>
              <span v-if="listing.deliveryOptions?.pickup && listing.deliveryOptions?.delivery"> / </span>
              <span v-if="listing.deliveryOptions?.delivery">Delivery</span>
            </p>
          </div>
        </div>
        <div class="listing-description">
          <strong>Description</strong>
          <div v-html="sanitizeHtml(listing.description)"></div>
        </div>
        <div v-if="listing.tagIds && listing.tagIds.length > 0" class="listing-tags">
          <strong>Tags</strong>
          <div>
            <span v-for="tag in listing.tagIds" :key="tag" class="badge badge-neutral">{{ tag }}</span>
          </div>
        </div>
      </div>

      <!-- Seller Info -->
      <div class="card">
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

      <!-- Tabs: Comments / Q&A / Versions -->
      <div class="tabs">
        <button
          class="tab"
          :class="{ active: detailTab === 'comments' }"
          @click="detailTab = 'comments'"
        >
          Comments
        </button>
        <button
          class="tab"
          :class="{ active: detailTab === 'qa' }"
          @click="detailTab = 'qa'"
        >
          Q&amp;A
        </button>
        <button
          v-if="isOwner"
          class="tab"
          :class="{ active: detailTab === 'versions' }"
          @click="detailTab = 'versions'; fetchVersions()"
        >
          Version History
        </button>
      </div>

      <!-- Comments Section -->
      <div v-if="detailTab === 'comments'" class="card">
        <div v-if="comments.length === 0" class="empty-state">
          <p>No comments yet.</p>
        </div>
        <div v-for="comment in comments" :key="comment.id" class="comment-item">
          <p class="comment-meta">
            <UserAvatar :userId="comment.userId" show-name size="sm" />
            &mdash; {{ new Date(comment.createdAt).toLocaleString() }}
          </p>
          <div v-html="sanitizeHtml(comment.content)"></div>
          <!-- Media preview -->
          <div v-if="comment.media && comment.media.length > 0" class="comment-media">
            <template v-for="(m, mi) in comment.media" :key="mi">
              <img v-if="m.type === 'image'" :src="m.data" alt="Comment image" class="media-thumb-sm" />
              <video v-else-if="m.type === 'video'" :src="m.data" controls class="media-thumb-sm" />
            </template>
          </div>
          <!-- Edit / Delete (owner only; moderator can delete) -->
          <div v-if="comment.userId === authStore.userId || isModerator" class="comment-actions">
            <button
              v-if="comment.userId === authStore.userId"
              class="btn btn-sm btn-ghost"
              @click="openEditComment(comment)"
            >
              Edit
            </button>
            <button
              class="btn btn-sm btn-ghost"
              style="color: var(--color-danger, #ef4444);"
              @click="handleDeleteComment(comment.id)"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- New Comment Form -->
        <form class="comment-form" @submit.prevent="submitComment">
          <div class="form-group">
            <label class="form-label">Add Comment</label>
            <RichTextEditor v-model="newComment" placeholder="Write a comment..." />
          </div>
          <!-- Media Upload -->
          <div class="form-group">
            <label class="form-label">Attach Media (optional)</label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              class="form-input"
              @change="handleCommentMediaChange"
            />
            <span class="form-hint" style="font-size: 0.8rem; color: var(--text-muted);">
              Images ≤ 2 MB · Videos ≤ 10 MB
            </span>
            <div v-if="commentMediaError" class="form-error">{{ commentMediaError }}</div>
            <div v-if="commentMedia.length > 0" class="media-preview-row">
              <div v-for="(m, mi) in commentMedia" :key="mi" class="media-preview-item">
                <img v-if="m.type === 'image'" :src="m.data" class="media-thumb-sm" alt="preview" />
                <span v-else class="media-preview-label">{{ m.name }}</span>
                <button type="button" class="btn btn-sm btn-ghost" @click="removeCommentMedia(mi)">✕</button>
              </div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="!hasCommentText || !!commentMediaError">
            Post Comment
          </button>
        </form>
      </div>

      <!-- Q&A Section -->
      <div v-if="detailTab === 'qa'" class="card">
        <div v-if="qaItems.length === 0" class="empty-state">
          <p>No questions yet.</p>
        </div>
        <div v-for="qa in qaItems" :key="qa.id" class="qa-thread">
          <div class="qa-question">
            <p class="comment-meta">
              <UserAvatar :userId="qa.userId" show-name size="sm" /> asked &mdash; {{ new Date(qa.createdAt).toLocaleString() }}
            </p>
            <div v-html="sanitizeHtml(qa.content)"></div>
            <!-- Q media preview -->
            <div v-if="qa.media && qa.media.length > 0" class="comment-media">
              <template v-for="(m, mi) in qa.media" :key="mi">
                <img v-if="m.type === 'image'" :src="m.data" alt="Question image" class="media-thumb-sm" />
                <video v-else-if="m.type === 'video'" :src="m.data" controls class="media-thumb-sm" />
              </template>
            </div>
            <div v-if="qa.userId === authStore.userId || isModerator" class="comment-actions">
              <button
                v-if="qa.userId === authStore.userId"
                class="btn btn-sm btn-ghost"
                @click="openEditComment(qa)"
              >
                Edit
              </button>
              <button
                class="btn btn-sm btn-ghost"
                style="color: var(--color-danger, #ef4444);"
                @click="handleDeleteComment(qa.id)"
              >
                Delete
              </button>
            </div>
          </div>
          <div v-if="qa.answers && qa.answers.length > 0" class="qa-answers">
            <div v-for="answer in qa.answers" :key="answer.id" class="qa-answer">
              <p class="comment-meta">
                <UserAvatar :userId="answer.userId" show-name size="sm" /> answered &mdash; {{ new Date(answer.createdAt).toLocaleString() }}
              </p>
              <div v-html="sanitizeHtml(answer.content)"></div>
              <!-- Answer media preview -->
              <div v-if="answer.media && answer.media.length > 0" class="comment-media">
                <template v-for="(m, mi) in answer.media" :key="mi">
                  <img v-if="m.type === 'image'" :src="m.data" alt="Answer image" class="media-thumb-sm" />
                  <video v-else-if="m.type === 'video'" :src="m.data" controls class="media-thumb-sm" />
                </template>
              </div>
              <div v-if="answer.userId === authStore.userId || isModerator" class="comment-actions">
                <button
                  v-if="answer.userId === authStore.userId"
                  class="btn btn-sm btn-ghost"
                  @click="openEditComment(answer)"
                >
                  Edit
                </button>
                <button
                  class="btn btn-sm btn-ghost"
                  style="color: var(--color-danger, #ef4444);"
                  @click="handleDeleteComment(answer.id)"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
          <!-- Answer form (seller only, unanswered questions) -->
          <form v-if="isOwner && (!qa.answers || qa.answers.length === 0)" class="comment-form" @submit.prevent="submitAnswer(qa.id)">
            <div class="form-group">
              <RichTextEditor
                :model-value="answerTexts[qa.id] || ''"
                placeholder="Write your answer..."
                @update:model-value="(v) => answerTexts[qa.id] = v"
              />
            </div>
            <!-- Answer media upload -->
            <div class="form-group">
              <label class="form-label">Attach Media (optional)</label>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                class="form-input"
                @change="handleAnswerMediaChange(qa.id, $event)"
              />
              <span class="form-hint" style="font-size: 0.8rem; color: var(--text-muted);">
                Images ≤ 2 MB · Videos ≤ 10 MB
              </span>
              <div v-if="answerMediaError[qa.id]" class="form-error">{{ answerMediaError[qa.id] }}</div>
              <div v-if="answerMedia[qa.id] && answerMedia[qa.id].length > 0" class="media-preview-row">
                <div v-for="(m, mi) in answerMedia[qa.id]" :key="mi" class="media-preview-item">
                  <img v-if="m.type === 'image'" :src="m.data" class="media-thumb-sm" alt="preview" />
                  <span v-else class="media-preview-label">{{ m.name }}</span>
                  <button type="button" class="btn btn-sm btn-ghost" @click="removeAnswerMedia(qa.id, mi)">✕</button>
                </div>
              </div>
            </div>
            <button type="submit" class="btn btn-secondary" :disabled="!hasAnswerText(qa.id) || !!answerMediaError[qa.id]">
              Answer
            </button>
          </form>
        </div>
        <!-- Question submission form -->
        <form class="comment-form" @submit.prevent="submitQuestion">
          <div class="form-group">
            <label class="form-label">Ask a Question</label>
            <RichTextEditor v-model="newQuestion" placeholder="Ask the seller a question..." />
          </div>
          <!-- Question media upload -->
          <div class="form-group">
            <label class="form-label">Attach Media (optional)</label>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              class="form-input"
              @change="handleQuestionMediaChange"
            />
            <span class="form-hint" style="font-size: 0.8rem; color: var(--text-muted);">
              Images ≤ 2 MB · Videos ≤ 10 MB
            </span>
            <div v-if="questionMediaError" class="form-error">{{ questionMediaError }}</div>
            <div v-if="questionMedia.length > 0" class="media-preview-row">
              <div v-for="(m, mi) in questionMedia" :key="mi" class="media-preview-item">
                <img v-if="m.type === 'image'" :src="m.data" class="media-thumb-sm" alt="preview" />
                <span v-else class="media-preview-label">{{ m.name }}</span>
                <button type="button" class="btn btn-sm btn-ghost" @click="removeQuestionMedia(mi)">✕</button>
              </div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" :disabled="!hasQuestionText || !!questionMediaError">
            Ask Question
          </button>
        </form>
      </div>

      <!-- Version History -->
      <div v-if="detailTab === 'versions'" class="card">
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
      </div>

      <!-- Edit Comment Modal -->
      <AppModal v-model="showEditModal" title="Edit Comment" max-width="520px">
        <div class="form-group">
          <label class="form-label">Content</label>
          <RichTextEditor v-model="editCommentContent" />
        </div>
        <template #footer>
          <button type="button" class="btn btn-secondary" @click="showEditModal = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!htmlHasText(editCommentContent)"
            @click="handleUpdateComment"
          >
            Save
          </button>
        </template>
      </AppModal>

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

      <!-- Rollback Confirm -->
      <ConfirmModal
        v-model="showRollbackConfirm"
        title="Rollback Listing"
        message="Are you sure you want to rollback to this version? The current state will be saved as a new version."
        confirm-text="Rollback"
        @confirm="handleRollback"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ListingService } from '../../services/ListingService.js';
import { AdminService } from '../../services/AdminService.js';
import { ThreadService } from '../../services/ThreadService.js';
import { CommentService } from '../../services/CommentService.js';
import { ModerationService } from '../../services/ModerationService.js';
import { getListingActions } from '../../domain/policies/actionPolicy.js';
import { Roles } from '../../domain/enums/roles.js';
import { formatCurrency } from '../../utils/formatting.js';
import { RouteNames } from '../../app/router/routeNames.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import ConfirmModal from '../../components/ConfirmModal.vue';
import RichTextEditor from '../../components/RichTextEditor.vue';
import UserAvatar from '../../components/UserAvatar.vue';
import { sanitizeHtml } from '../../utils/sanitizeHtml.js';
import { useUserProfile } from '../../composables/useUserProfile.js';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;  // 2 MB
const VIDEO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const props = defineProps({
  id: { type: String, required: true },
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const listing = ref(null);
const categories = ref([]);
const comments = ref([]);
const qaItems = ref([]);

// ── Seller profile cache ──
const { getProfile: fetchProfile } = useUserProfile();
const sellerProfile = ref(null);

const sellerDisplayName = computed(() =>
  sellerProfile.value?.displayName || sellerProfile.value?.username || listing.value?.sellerId || ''
);
const sellerMemberSince = computed(() => {
  if (!sellerProfile.value?.createdAt) return '-';
  return new Date(sellerProfile.value.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
});
const versions = ref([]);
const loading = ref(false);
const detailTab = ref('comments');

// New comment
const newComment = ref('');
const commentMedia = ref([]);
const commentMediaError = ref('');

// New Q&A
const newQuestion = ref('');
const questionMedia = ref([]);
const questionMediaError = ref('');
const answerTexts = reactive({});
const answerMedia = reactive({});   // keyed by questionId
const answerMediaError = reactive({}); // keyed by questionId

// Edit comment
const showEditModal = ref(false);
const editingComment = ref(null);
const editCommentContent = ref('');

// Report
const showReportModal = ref(false);
const reportReason = ref('');
const reportDescription = ref('');

// Listing actions
const showArchiveConfirm = ref(false);
const showRollbackConfirm = ref(false);
const rollbackTarget = ref(null);

// ── Media type detection ──

function isVideoMedia(item) {
  if (item.type?.startsWith('video/')) return true;
  const src = item.url || item.data || '';
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(src);
}

// ── Rich-text content guards (HTML may be empty tags like <p></p>) ──

function htmlHasText(html) {
  if (!html) return false;
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent.trim().length > 0;
}

const hasCommentText  = computed(() => htmlHasText(newComment.value));
const hasQuestionText = computed(() => htmlHasText(newQuestion.value));

function hasAnswerText(qaId) {
  return htmlHasText(answerTexts[qaId]);
}

// Derived from action policy — single source of truth for button visibility
const isOwner  = computed(() => listing.value && listing.value.sellerId === authStore.userId);
const isModerator = computed(() => authStore.roles.includes(Roles.MODERATOR) || authStore.roles.includes(Roles.ADMIN));

const listingActions = computed(() =>
  getListingActions(authStore.userId, authStore.roles, listing.value)
);

const categoryName = computed(() => {
  if (!listing.value) return '';
  const cat = categories.value.find(c => c.id === listing.value.categoryId);
  return cat ? cat.name : 'Uncategorized';
});

// ── Data Fetching ──

async function fetchListing() {
  loading.value = true;
  try {
    listing.value = await ListingService.getById(authStore.session, props.id);
    // Load seller profile for the info card (non-blocking)
    fetchProfile(listing.value.sellerId).then(p => { sellerProfile.value = p; }).catch(() => {});
  } catch (err) {
    toast.error(err.message || 'Failed to load listing');
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  try {
    categories.value = await AdminService.getAllCategories(authStore.session);
  } catch {
    // Non-critical; category names will show as "Uncategorized"
  }
}

async function fetchComments() {
  try {
    const all = await CommentService.getByListingId(authStore.session, props.id);
    comments.value = all.filter(c => c.type === 'comment');
  } catch (err) {
    toast.error(err.message || 'Failed to load comments');
  }
}

async function fetchQA() {
  try {
    qaItems.value = await CommentService.getQAByListingId(authStore.session, props.id);
  } catch (err) {
    toast.error(err.message || 'Failed to load Q&A');
  }
}

async function fetchVersions() {
  try {
    versions.value = await ListingService.getVersions(authStore.session, props.id);
  } catch (err) {
    toast.error(err.message || 'Failed to load version history');
  }
}

// ── Listing Actions ──

async function handlePublish() {
  try {
    const result = await ListingService.publish(authStore.session, props.id);
    listing.value = result.listing;
    if (result.flagged) {
      toast.warning('Listing submitted for review due to content screening.');
    } else {
      toast.success('Listing published successfully.');
    }
  } catch (err) {
    toast.error(err.message || 'Failed to publish listing');
  }
}

function goToEdit() {
  router.push({ name: RouteNames.EDIT_LISTING, params: { id: props.id } });
}

async function handleArchive() {
  showArchiveConfirm.value = false;
  try {
    listing.value = await ListingService.archive(authStore.session, props.id);
    toast.success('Listing archived.');
  } catch (err) {
    toast.error(err.message || 'Failed to archive listing');
  }
}

async function startConversation() {
  try {
    const thread = await ThreadService.create(authStore.session, props.id);
    router.push({ name: RouteNames.THREAD_DETAIL, params: { id: thread.id } });
  } catch (err) {
    toast.error(err.message || 'Failed to start conversation');
  }
}

async function handleTogglePin() {
  try {
    listing.value = await ListingService.togglePin(authStore.session, props.id);
    toast.success(listing.value.isPinned ? 'Listing pinned.' : 'Listing unpinned.');
  } catch (err) {
    toast.error(err.message || 'Failed to toggle pin');
  }
}

async function handleToggleFeature() {
  try {
    listing.value = await ListingService.toggleFeature(authStore.session, props.id);
    toast.success(listing.value.isFeatured ? 'Listing featured.' : 'Listing unfeatured.');
  } catch (err) {
    toast.error(err.message || 'Failed to toggle feature');
  }
}

// ── Media Upload ──

/**
 * Reads a File into a base64 data URL.
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleCommentMediaChange(event) {
  commentMediaError.value = '';
  const files = Array.from(event.target.files || []);
  const newItems = [];

  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      commentMediaError.value = `Unsupported file type: ${file.type}`;
      return;
    }
    if (isImage && file.size > IMAGE_MAX_BYTES) {
      commentMediaError.value = `Image "${file.name}" exceeds 2 MB limit`;
      return;
    }
    if (isVideo && file.size > VIDEO_MAX_BYTES) {
      commentMediaError.value = `Video "${file.name}" exceeds 10 MB limit`;
      return;
    }

    const data = await readFileAsDataURL(file);
    newItems.push({ type: isImage ? 'image' : 'video', name: file.name, data });
  }

  commentMedia.value = [...commentMedia.value, ...newItems];
  // Reset the file input so same file can be re-selected after removal
  event.target.value = '';
}

function removeCommentMedia(index) {
  commentMedia.value = commentMedia.value.filter((_, i) => i !== index);
}

// ── Comments ──

async function submitComment() {
  if (!hasCommentText.value || commentMediaError.value) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.id,
      content: newComment.value,
      type: 'comment',
      media: commentMedia.value,
    });
    newComment.value = '';
    commentMedia.value = [];
    commentMediaError.value = '';
    toast.success('Comment posted.');
    await fetchComments();
  } catch (err) {
    toast.error(err.message || 'Failed to post comment');
  }
}

function openEditComment(comment) {
  editingComment.value = comment;
  editCommentContent.value = comment.content;
  showEditModal.value = true;
}

async function handleUpdateComment() {
  if (!editingComment.value || !htmlHasText(editCommentContent.value)) return;
  try {
    await CommentService.update(authStore.session, editingComment.value.id, {
      content: editCommentContent.value,
    });
    showEditModal.value = false;
    editingComment.value = null;
    toast.success('Comment updated.');
    await fetchComments();
    await fetchQA();
  } catch (err) {
    toast.error(err.message || 'Failed to update comment');
  }
}

async function handleDeleteComment(commentId) {
  try {
    await CommentService.delete(authStore.session, commentId);
    toast.success('Comment deleted.');
    await fetchComments();
    await fetchQA();
  } catch (err) {
    toast.error(err.message || 'Failed to delete comment');
  }
}

// ── Q&A media ──

async function handleQuestionMediaChange(event) {
  questionMediaError.value = '';
  const files = Array.from(event.target.files || []);
  const newItems = [];

  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      questionMediaError.value = `Unsupported file type: ${file.type}`;
      return;
    }
    if (isImage && file.size > IMAGE_MAX_BYTES) {
      questionMediaError.value = `Image "${file.name}" exceeds 2 MB limit`;
      return;
    }
    if (isVideo && file.size > VIDEO_MAX_BYTES) {
      questionMediaError.value = `Video "${file.name}" exceeds 10 MB limit`;
      return;
    }

    const data = await readFileAsDataURL(file);
    newItems.push({ type: isImage ? 'image' : 'video', name: file.name, data });
  }

  questionMedia.value = [...questionMedia.value, ...newItems];
  event.target.value = '';
}

function removeQuestionMedia(index) {
  questionMedia.value = questionMedia.value.filter((_, i) => i !== index);
}

async function handleAnswerMediaChange(qaId, event) {
  answerMediaError[qaId] = '';
  const files = Array.from(event.target.files || []);
  const newItems = [];

  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      answerMediaError[qaId] = `Unsupported file type: ${file.type}`;
      return;
    }
    if (isImage && file.size > IMAGE_MAX_BYTES) {
      answerMediaError[qaId] = `Image "${file.name}" exceeds 2 MB limit`;
      return;
    }
    if (isVideo && file.size > VIDEO_MAX_BYTES) {
      answerMediaError[qaId] = `Video "${file.name}" exceeds 10 MB limit`;
      return;
    }

    const data = await readFileAsDataURL(file);
    newItems.push({ type: isImage ? 'image' : 'video', name: file.name, data });
  }

  answerMedia[qaId] = [...(answerMedia[qaId] || []), ...newItems];
  event.target.value = '';
}

function removeAnswerMedia(qaId, index) {
  answerMedia[qaId] = (answerMedia[qaId] || []).filter((_, i) => i !== index);
}

// ── Q&A ──

async function submitQuestion() {
  if (!hasQuestionText.value) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.id,
      content: newQuestion.value,
      type: 'question',
      media: questionMedia.value,
    });
    newQuestion.value = '';
    questionMedia.value = [];
    questionMediaError.value = '';
    toast.success('Question posted.');
    await fetchQA();
  } catch (err) {
    toast.error(err.message || 'Failed to post question');
  }
}

async function submitAnswer(questionId) {
  if (!hasAnswerText(questionId)) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.id,
      content: answerTexts[questionId],
      type: 'answer',
      parentId: questionId,
      media: answerMedia[questionId] || [],
    });
    answerTexts[questionId] = '';
    answerMedia[questionId] = [];
    answerMediaError[questionId] = '';
    toast.success('Answer posted.');
    await fetchQA();
  } catch (err) {
    toast.error(err.message || 'Failed to post answer');
  }
}

// ── Reports ──

async function submitReport() {
  if (!reportReason.value) return;
  try {
    await ModerationService.createReport(authStore.session, {
      targetId: props.id,
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

// ── Version History ──

function confirmRollback(version) {
  rollbackTarget.value = version;
  showRollbackConfirm.value = true;
}

async function handleRollback() {
  showRollbackConfirm.value = false;
  if (!rollbackTarget.value) return;
  try {
    listing.value = await ListingService.rollback(authStore.session, props.id, rollbackTarget.value.id);
    toast.success('Listing rolled back to selected version.');
    rollbackTarget.value = null;
    await fetchVersions();
  } catch (err) {
    toast.error(err.message || 'Failed to rollback listing');
  }
}

onMounted(() => {
  fetchListing();
  fetchCategories();
  fetchComments();
  fetchQA();
});
</script>
