<template>
  <div ref="messagesContainer" class="chat-messages">
    <div
      v-for="msg in messages"
      :key="msg.id"
      :class="['chat-bubble', msg.senderId === currentUserId ? 'mine' : 'theirs']"
    >
      <div v-if="msg.senderId !== currentUserId" class="chat-sender">
        <UserAvatar :userId="msg.senderId" show-name size="sm" />
      </div>
      <p>{{ msg.content }}</p>
      <span class="chat-time">{{ formatTime12h(msg.createdAt) }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { formatTime12h } from '../../../utils/time.js';
import UserAvatar from '../../../components/UserAvatar.vue';

defineProps({
  messages: { type: Array, required: true },
  currentUserId: { type: String, required: true },
});

const messagesContainer = ref(null);

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

defineExpose({ scrollToBottom });
</script>
