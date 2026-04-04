<template>
  <div class="page-content">
    <div class="page-header">
      <h1>Marketplace</h1>
      <router-link :to="{ name: RouteNames.CREATE_LISTING }" class="btn btn-primary">
        Create Listing
      </router-link>
    </div>

    <div class="pill-tabs">
      <button
        class="pill-tab"
        :class="{ active: activeTab === 'browse' }"
        @click="switchTab('browse')"
      >
        Browse All
      </button>
      <button
        class="pill-tab"
        :class="{ active: activeTab === 'mine' }"
        @click="switchTab('mine')"
      >
        My Listings
      </button>
    </div>

    <div class="marketplace-filters">
      <div class="form-group">
        <input
          v-model="searchQuery"
          type="text"
          class="form-input"
          placeholder="Search listings by title..."
        />
      </div>
      <div class="form-group">
        <select v-model="selectedCategory" class="form-select">
          <option value="">All Categories</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <select v-model="sortOption" class="form-select">
          <option value="newest">Newest First</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading-state">Loading listings...</div>

    <EmptyState
      v-else-if="filteredListings.length === 0"
      icon="🏪"
      title="No listings found"
      :message="activeTab === 'mine' ? 'You have not created any listings yet.' : 'No listings match your search criteria.'"
    >
      <router-link v-if="activeTab === 'mine'" :to="{ name: RouteNames.CREATE_LISTING }" class="btn btn-primary">
        Create Your First Listing
      </router-link>
    </EmptyState>

    <div v-else class="listing-grid">
      <div
        v-for="listing in filteredListings"
        :key="listing.id"
        class="card listing-card"
        @click="goToDetail(listing.id)"
      >
        <div class="listing-card-thumb">
          <img
            v-if="listing.media && listing.media.length > 0"
            :src="listing.media[0].url || listing.media[0]"
            alt="Listing thumbnail"
            class="media-thumb"
          />
          <div v-else class="media-thumb media-thumb-placeholder">No Image</div>
        </div>
        <div class="listing-card-body">
          <h3 class="listing-card-title">{{ listing.title }}</h3>
          <p class="listing-card-price">{{ formatCurrency(listing.price) }}</p>
          <p class="listing-card-category">{{ getCategoryName(listing.categoryId) }}</p>
          <p class="listing-card-seller">Seller: {{ listing.sellerId }}</p>
          <StatusBadge :status="listing.status" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { ListingService } from '../../services/ListingService.js';
import { AdminService } from '../../services/AdminService.js';
import { formatCurrency } from '../../utils/formatting.js';
import { RouteNames } from '../../app/router/routeNames.js';
import StatusBadge from '../../components/StatusBadge.vue';
import EmptyState from '../../components/EmptyState.vue';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const listings = ref([]);
const categories = ref([]);
const loading = ref(false);
const activeTab = ref('browse');
const searchQuery = ref('');
const selectedCategory = ref('');
const sortOption = ref('newest');

const filteredListings = computed(() => {
  let result = [...listings.value];

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(l => l.title.toLowerCase().includes(query));
  }

  if (selectedCategory.value) {
    result = result.filter(l => l.categoryId === selectedCategory.value);
  }

  if (sortOption.value === 'newest') {
    result.sort((a, b) => b.createdAt - a.createdAt);
  } else if (sortOption.value === 'price_asc') {
    result.sort((a, b) => a.price - b.price);
  } else if (sortOption.value === 'price_desc') {
    result.sort((a, b) => b.price - a.price);
  }

  return result;
});

function getCategoryName(categoryId) {
  const cat = categories.value.find(c => c.id === categoryId);
  return cat ? cat.name : 'Uncategorized';
}

function goToDetail(id) {
  router.push({ name: RouteNames.LISTING_DETAIL, params: { id } });
}

async function fetchListings() {
  loading.value = true;
  try {
    if (activeTab.value === 'browse') {
      listings.value = await ListingService.getActiveListings(authStore.session);
    } else {
      listings.value = await ListingService.getMyListings(authStore.session);
    }
  } catch (err) {
    toast.error(err.message || 'Failed to load listings');
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

function switchTab(tab) {
  activeTab.value = tab;
  fetchListings();
}

onMounted(() => {
  fetchListings();
  fetchCategories();
});
</script>
