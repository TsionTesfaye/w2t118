<template>
  <div v-if="media && media.length > 0" class="media-grid">
    <template v-for="(item, idx) in media" :key="idx">
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
</template>

<script setup>
defineProps({
  media: { type: Array, default: () => [] },
});

function isVideoMedia(item) {
  if (item.type?.startsWith('video/')) return true;
  const src = item.url || item.data || '';
  return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(src);
}
</script>
