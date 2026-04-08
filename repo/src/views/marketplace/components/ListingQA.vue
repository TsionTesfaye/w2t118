<template>
  <div class="card">
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

    <!-- Edit Comment Modal (shared for Q/A edits) -->
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
import { ref, computed, reactive } from 'vue';
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
  qaItems: { type: Array, default: () => [] },
  isOwner: { type: Boolean, default: false },
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

// ── New question ──
const newQuestion = ref('');
const questionMedia = ref([]);
const questionMediaError = ref('');
const hasQuestionText = computed(() => htmlHasText(newQuestion.value));

// ── Answer state (keyed by question id) ──
const answerTexts = reactive({});
const answerMedia = reactive({});
const answerMediaError = reactive({});

function hasAnswerText(qaId) {
  return htmlHasText(answerTexts[qaId]);
}

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

// ── Media helpers ──
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processMediaFiles(files) {
  const items = [];
  let error = '';

  for (const file of files) {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      error = `Unsupported file type: ${file.type}`;
      return { items: [], error };
    }
    if (isImage && file.size > IMAGE_MAX_BYTES) {
      error = `Image "${file.name}" exceeds 2 MB limit`;
      return { items: [], error };
    }
    if (isVideo && file.size > VIDEO_MAX_BYTES) {
      error = `Video "${file.name}" exceeds 10 MB limit`;
      return { items: [], error };
    }

    const data = await readFileAsDataURL(file);
    items.push({ type: isImage ? 'image' : 'video', name: file.name, data });
  }

  return { items, error };
}

async function handleQuestionMediaChange(event) {
  questionMediaError.value = '';
  const files = Array.from(event.target.files || []);
  const { items, error } = await processMediaFiles(files);

  if (error) {
    questionMediaError.value = error;
    return;
  }

  questionMedia.value = [...questionMedia.value, ...items];
  event.target.value = '';
}

function removeQuestionMedia(index) {
  questionMedia.value = questionMedia.value.filter((_, i) => i !== index);
}

async function handleAnswerMediaChange(qaId, event) {
  answerMediaError[qaId] = '';
  const files = Array.from(event.target.files || []);
  const { items, error } = await processMediaFiles(files);

  if (error) {
    answerMediaError[qaId] = error;
    return;
  }

  answerMedia[qaId] = [...(answerMedia[qaId] || []), ...items];
  event.target.value = '';
}

function removeAnswerMedia(qaId, index) {
  answerMedia[qaId] = (answerMedia[qaId] || []).filter((_, i) => i !== index);
}

// ── Submit ──
async function submitQuestion() {
  if (!hasQuestionText.value) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.listingId,
      content: newQuestion.value,
      type: 'question',
      media: questionMedia.value,
    });
    newQuestion.value = '';
    questionMedia.value = [];
    questionMediaError.value = '';
    toast.success('Question posted.');
    emit('refresh');
  } catch (err) {
    toast.error(err.message || 'Failed to post question');
  }
}

async function submitAnswer(questionId) {
  if (!hasAnswerText(questionId)) return;
  try {
    await CommentService.create(authStore.session, {
      listingId: props.listingId,
      content: answerTexts[questionId],
      type: 'answer',
      parentId: questionId,
      media: answerMedia[questionId] || [],
    });
    answerTexts[questionId] = '';
    answerMedia[questionId] = [];
    answerMediaError[questionId] = '';
    toast.success('Answer posted.');
    emit('refresh');
  } catch (err) {
    toast.error(err.message || 'Failed to post answer');
  }
}
</script>
