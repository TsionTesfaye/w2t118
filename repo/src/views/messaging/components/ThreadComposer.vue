<template>
  <div v-if="isReadOnly" class="alert-warning">
    This conversation is read-only.
  </div>
  <form v-else class="chat-input-area" @submit.prevent="onSubmit">
    <input
      v-model="text"
      type="text"
      class="form-input"
      placeholder="Type a message..."
      :disabled="sending"
    />
    <button type="submit" class="btn btn-primary" :disabled="!text.trim() || sending">
      Send
    </button>
  </form>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  isReadOnly: { type: Boolean, default: false },
  sending: { type: Boolean, default: false },
});

const emit = defineEmits(['send']);

const text = ref('');

function onSubmit() {
  const content = text.value.trim();
  if (!content) return;
  emit('send', content);
  text.value = '';
}
</script>
