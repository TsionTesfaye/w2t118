<template>
  <div class="card">
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '../../../app/store/authStore.js';
import { useToast } from '../../../composables/useToast.js';
import { CommentService } from '../../../services/CommentService.js';
import { Roles } from '../../../domain/enums/roles.js';
import { sanitizeHtml } from '../../../utils/sanitizeHtml.js';
import RichTextEditor from '../../../components/RichTextEditor.vue';
import UserAvatar from '../../../components/UserAvatar.vue';
import AppModal from '../../../components/AppModal.vue';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const VIDEO_MAX_BYTES = 10 * 1024 * 1024;

const props = defineProps({
  listingId: { type: String, required: true },
  comments: { type: Array, default: () => [] },
});

const emit = defineEmits(['refresh']);

const authStore = useAuthStore();
const toast = useToast();

const isModerator = computed(() =>
  authStore.roles.includes(Roles.MODERATOR) || authStore.roles.includes(Roles.ADMIN)
);

// ── Rich-text content guard ──
function htmlHasText(html) {
  if (!html) return false;
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent.trim().length > 0;
}

// ── New comment ──
const newComment = ref('');
const commentMedia = ref([]);
const commentMediaError = ref('');
const hasCommentText = computed(() => htmlHasText(newComment.value));

// ── Edit comment ──
const showEditModal = ref(false);
const editingComment = ref(null);
const editCommentContent = ref('');

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
    emit('refresh');
  } catch (err) {
    toast.error(err.message || 'Failed to update comment');
  }
}

async function handleDeleteComment(commentId) {
  try {
    await CommentService.delete(authStore.session, commentId);
    toast.success('Comment deleted.');
    emit('refresh');
  } catch (err) {
    toast.error(err.message || 'Failed to delete comment');
  }
}

// ── Media upload ──
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
  event.target.value = '';
}

function removeCommentMedia(index) {
  commentMedia.value = commentMedia.value.filter((_, i) => i !== index);
}

// ── Submit ──
async function submitComment() {
  if (!hasCommentText.value || commentMediaError.value) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.listingId,
      content: newComment.value,
      type: 'comment',
      media: commentMedia.value,
    });
    newComment.value = '';
    commentMedia.value = [];
    commentMediaError.value = '';
    toast.success('Comment posted.');
    emit('refresh');
  } catch (err) {
    toast.error(err.message || 'Failed to post comment');
  }
}
</script>
