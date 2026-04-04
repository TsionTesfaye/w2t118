<template>
  <div class="page-content">
    <div class="page-header">
      <h1>{{ isEditMode ? 'Edit Listing' : 'Create Listing' }}</h1>
    </div>

    <div v-if="loading" class="loading-state">Loading...</div>

    <form v-else class="card" @submit.prevent="handleSubmit">
      <div v-if="errors.length > 0" class="alert-danger">
        <ul>
          <li v-for="(err, idx) in errors" :key="idx">{{ err }}</li>
        </ul>
      </div>

      <div class="form-group">
        <label for="title" class="form-label">Title</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          class="form-input"
          placeholder="Listing title"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <RichTextEditor
          v-model="form.description"
          placeholder="Describe your item..."
        />
      </div>

      <div class="form-group">
        <label for="price" class="form-label">Price</label>
        <input
          id="price"
          v-model.number="form.price"
          type="number"
          class="form-input"
          placeholder="0.00"
          min="0"
          step="0.01"
        />
      </div>

      <div class="form-group">
        <label for="category" class="form-label">Category</label>
        <select id="category" v-model="form.categoryId" class="form-select">
          <option value="">Select a category</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="tags" class="form-label">Tags (comma-separated)</label>
        <input
          id="tags"
          v-model="tagsInput"
          type="text"
          class="form-input"
          placeholder="electronics, used, like-new"
        />
      </div>

      <div class="form-group">
        <label class="form-label">Delivery Options</label>
        <div class="checkbox-group">
          <label>
            <input type="checkbox" v-model="form.deliveryOptions.pickup" />
            Pickup
          </label>
          <label>
            <input type="checkbox" v-model="form.deliveryOptions.delivery" />
            Delivery
          </label>
        </div>
      </div>

      <!-- Media Section -->
      <div class="form-group">
        <label class="form-label">Media</label>
        <input
          type="file"
          accept="image/*,video/*"
          multiple
          @change="handleFileSelect"
        />
        <p class="form-hint">Max 2MB per image, max 10MB per video, max 2 videos.</p>
        <div v-if="mediaErrors.length > 0" class="alert-danger">
          <ul>
            <li v-for="(err, idx) in mediaErrors" :key="idx">{{ err }}</li>
          </ul>
        </div>
        <div v-if="form.media.length > 0" class="media-grid">
          <div v-for="(item, idx) in form.media" :key="idx" class="media-thumb-wrapper">
            <img
              v-if="item.type === 'image'"
              :src="item.url"
              alt="Media preview"
              class="media-thumb"
            />
            <video
              v-else
              :src="item.url"
              class="media-thumb"
              controls
            ></video>
            <button type="button" class="btn btn-danger btn-sm" @click="removeMedia(idx)">
              Remove
            </button>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" @click="handleCancel">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" :disabled="submitting">
          {{ submitting ? 'Saving...' : (isEditMode ? 'Update Listing' : 'Create Listing') }}
        </button>
      </div>
    </form>

    <!-- Post-create publish prompt -->
    <AppModal v-model="showPublishPrompt" title="Listing Created">
      <p>Your listing has been saved as a draft. Would you like to publish it now?</p>
      <template #footer>
        <button class="btn btn-secondary" @click="goToDetail(createdListingId)">
          Keep as Draft
        </button>
        <button class="btn btn-primary" @click="publishAndRedirect">
          Publish Now
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ListingService } from '../../services/ListingService.js';
import { AdminService } from '../../services/AdminService.js';
import { RouteNames } from '../../app/router/routeNames.js';
import AppModal from '../../components/AppModal.vue';
import RichTextEditor from '../../components/RichTextEditor.vue';

const props = defineProps({
  id: { type: String, default: null },
});

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const isEditMode = computed(() => !!props.id);

const categories = ref([]);
const loading = ref(false);
const submitting = ref(false);
const errors = ref([]);
const mediaErrors = ref([]);
const showPublishPrompt = ref(false);
const createdListingId = ref(null);
const tagsInput = ref('');

const form = reactive({
  title: '',
  description: '',
  price: 0,
  categoryId: '',
  tagIds: [],
  media: [],
  deliveryOptions: {
    pickup: true,
    delivery: false,
  },
});

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;   // 2MB
const MAX_VIDEO_SIZE = 10 * 1024 * 1024;   // 10MB
const MAX_VIDEOS = 2;

function validate() {
  const errs = [];
  if (!form.title.trim()) errs.push('Title is required.');
  if (!form.description.trim()) errs.push('Description is required.');
  if (form.price == null || form.price < 0) errs.push('Price must be zero or greater.');
  if (!form.categoryId) errs.push('Category is required.');
  if (!form.deliveryOptions.pickup && !form.deliveryOptions.delivery) {
    errs.push('Select at least one delivery option.');
  }
  return errs;
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  mediaErrors.value = [];
  const currentVideoCount = form.media.filter(m => m.type === 'video').length;
  let newVideoCount = 0;

  for (const file of files) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      mediaErrors.value.push(`"${file.name}" is not a supported file type.`);
      continue;
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      mediaErrors.value.push(`"${file.name}" exceeds the 2MB image size limit.`);
      continue;
    }

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      mediaErrors.value.push(`"${file.name}" exceeds the 10MB video size limit.`);
      continue;
    }

    if (isVideo) {
      if (currentVideoCount + newVideoCount >= MAX_VIDEOS) {
        mediaErrors.value.push(`"${file.name}" not added. Maximum of ${MAX_VIDEOS} videos allowed.`);
        continue;
      }
      newVideoCount++;
    }

    const reader = new FileReader();
    const fileSize = file.size;
    reader.onload = (e) => {
      form.media.push({
        url: e.target.result,
        type: isVideo ? 'video' : 'image',
        name: file.name,
        size: fileSize,
      });
    };
    reader.readAsDataURL(file);
  }

  event.target.value = '';
}

function removeMedia(index) {
  form.media.splice(index, 1);
}

async function handleSubmit() {
  errors.value = validate();
  if (errors.value.length > 0) return;

  form.tagIds = tagsInput.value
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  submitting.value = true;
  try {
    const payload = {
      title: form.title,
      description: form.description,
      price: form.price,
      categoryId: form.categoryId,
      tagIds: form.tagIds,
      media: form.media,
      deliveryOptions: { ...form.deliveryOptions },
    };

    if (isEditMode.value) {
      await ListingService.update(authStore.session, props.id, payload);
      toast.success('Listing updated.');
      goToDetail(props.id);
    } else {
      const created = await ListingService.create(authStore.session, payload);
      createdListingId.value = created.id;
      showPublishPrompt.value = true;
    }
  } catch (err) {
    toast.error(err.message || 'Failed to save listing');
  } finally {
    submitting.value = false;
  }
}

async function publishAndRedirect() {
  showPublishPrompt.value = false;
  try {
    const result = await ListingService.publish(authStore.session, createdListingId.value);
    if (result.flagged) {
      toast.warning('Listing submitted for review due to content screening.');
    } else {
      toast.success('Listing published.');
    }
  } catch (err) {
    toast.error(err.message || 'Failed to publish listing');
  }
  goToDetail(createdListingId.value);
}

function goToDetail(listingId) {
  router.push({ name: RouteNames.LISTING_DETAIL, params: { id: listingId } });
}

function handleCancel() {
  router.back();
}

async function loadExistingListing() {
  loading.value = true;
  try {
    const listing = await ListingService.getById(authStore.session, props.id);
    form.title = listing.title;
    form.description = listing.description;
    form.price = listing.price;
    form.categoryId = listing.categoryId;
    form.tagIds = listing.tagIds || [];
    form.media = listing.media || [];
    form.deliveryOptions = listing.deliveryOptions || { pickup: true, delivery: false };
    tagsInput.value = form.tagIds.join(', ');
  } catch (err) {
    toast.error(err.message || 'Failed to load listing');
  } finally {
    loading.value = false;
  }
}

async function fetchCategories() {
  try {
    categories.value = await AdminService.getAllCategories(authStore.session);
  } catch (err) {
    toast.error(err.message || 'Failed to load categories');
  }
}

onMounted(() => {
  fetchCategories();
  if (isEditMode.value) {
    loadExistingListing();
  }
});
</script>
