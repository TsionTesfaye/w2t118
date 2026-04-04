<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.self="$emit('update:modelValue', false)">
      <div class="modal-content" :style="maxWidth ? { maxWidth } : {}">
        <div class="modal-header">
          <h3>{{ title }}</h3>
          <button class="btn-icon btn-ghost" @click="$emit('update:modelValue', false)">&times;</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  modelValue: Boolean,
  title: { type: String, default: '' },
  maxWidth: { type: String, default: null },
});
defineEmits(['update:modelValue']);
</script>
