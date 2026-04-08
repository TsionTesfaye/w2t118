<template>
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
</template>

<script setup>
import { formatCurrency } from '../../../utils/formatting.js';
import { sanitizeHtml } from '../../../utils/sanitizeHtml.js';

defineProps({
  listing: { type: Object, required: true },
  categoryName: { type: String, default: 'Uncategorized' },
});
</script>
