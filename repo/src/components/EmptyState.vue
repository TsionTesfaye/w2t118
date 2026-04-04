<template>
  <div class="empty-state">
    <div class="empty-state-icon">{{ icon }}</div>
    <h3>{{ title }}</h3>
    <p v-if="message">{{ message }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: '📭' },
  title: { type: String, default: 'Nothing here yet' },
  message: { type: String, default: '' },
});
</script>
