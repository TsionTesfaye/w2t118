<template>
  <span :class="['ua-wrap', showName && 'ua-wrap--named']">
    <span :class="['ua', `ua--${size}`]" :title="resolvedName">
      <img
        v-if="resolvedAvatar"
        :src="resolvedAvatar"
        :alt="resolvedName"
        class="ua__img"
        @error="onImgError"
      />
      <span v-else class="ua__initials" aria-hidden="true">{{ initials }}</span>
    </span>
    <span v-if="showName" class="ua__name">{{ resolvedName }}</span>
  </span>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useUserProfile } from '../composables/useUserProfile.js';

const props = defineProps({
  /** User whose avatar to display. */
  userId: { type: String, required: true },
  /** Pre-resolved display name (skips profile fetch if provided with avatarUrl). */
  displayName: { type: String, default: null },
  /** Pre-resolved avatar URL / data-URL (skips profile fetch if provided with displayName). */
  avatarUrl: { type: String, default: null },
  /** sm (28px) | md (40px) | lg (56px) */
  size: { type: String, default: 'sm' },
  /** Render display name next to avatar. */
  showName: { type: Boolean, default: false },
});

const { getProfile } = useUserProfile();
const fetchedProfile = ref(null);
const imgBroken = ref(false);

const resolvedName = computed(() =>
  props.displayName
    || fetchedProfile.value?.displayName
    || fetchedProfile.value?.username
    || props.userId
);

const resolvedAvatar = computed(() => {
  if (imgBroken.value) return null;
  return props.avatarUrl || fetchedProfile.value?.avatar || null;
});

const initials = computed(() => {
  const name = resolvedName.value || '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
});

function onImgError() {
  imgBroken.value = true;
}

async function fetchIfNeeded() {
  // Skip network call when caller already supplied both pieces
  if (props.displayName && props.avatarUrl) return;
  fetchedProfile.value = await getProfile(props.userId);
}

onMounted(fetchIfNeeded);
watch(() => props.userId, () => {
  fetchedProfile.value = null;
  imgBroken.value = false;
  fetchIfNeeded();
});
</script>

<style scoped>
.ua-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  vertical-align: middle;
}

.ua {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-primary-muted, #e0e7ff);
  color: var(--color-primary, #4f46e5);
  font-weight: 600;
  flex-shrink: 0;
  user-select: none;
}

.ua--sm  { width: 28px; height: 28px; font-size: 0.65rem; }
.ua--md  { width: 40px; height: 40px; font-size: 0.875rem; }
.ua--lg  { width: 56px; height: 56px; font-size: 1.125rem; }

.ua__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ua__name {
  font-size: 0.875rem;
  color: var(--color-text, #111827);
}
</style>
