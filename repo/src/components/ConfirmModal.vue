<template>
  <AppModal :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)" :title="title">
    <p>{{ message }}</p>
    <template #footer>
      <button class="btn btn-secondary" @click="$emit('update:modelValue', false)">Cancel</button>
      <button :class="['btn', dangerMode ? 'btn-danger' : 'btn-primary']" @click="$emit('confirm')">
        {{ confirmText }}
      </button>
    </template>
  </AppModal>
</template>

<script setup>
import AppModal from './AppModal.vue';
defineProps({
  modelValue: Boolean,
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  confirmText: { type: String, default: 'Confirm' },
  dangerMode: { type: Boolean, default: false },
});
defineEmits(['update:modelValue', 'confirm']);
</script>
