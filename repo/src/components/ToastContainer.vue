<template>
  <div class="toast-container">
    <div v-for="t in toasts" :key="t.id" :class="['toast', `toast-${t.type}`]">
      <span class="toast-icon">{{ icon(t.type) }}</span>
      <span class="toast-msg">{{ t.message }}</span>
      <button class="btn-icon btn-ghost" @click="ui.removeToast(t.id)" style="margin-left:auto;font-size:16px">&times;</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore } from '../app/store/uiStore.js';
const ui = useUiStore();
const toasts = computed(() => ui.toasts);
const icon = (type) => ({ success: '\u2713', error: '\u2717', warning: '\u26A0', info: '\u2139' }[type] || '\u2139');
</script>
