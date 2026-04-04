<template>
  <div class="rte-wrapper">
    <div class="rte-toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" class="rte-btn" title="Bold" @mousedown.prevent="exec('bold')">
        <strong>B</strong>
      </button>
      <button type="button" class="rte-btn" title="Italic" @mousedown.prevent="exec('italic')">
        <em>I</em>
      </button>
      <button type="button" class="rte-btn" title="Bullet list" @mousedown.prevent="exec('insertUnorderedList')">
        &#8226; List
      </button>
      <button type="button" class="rte-btn" title="Numbered list" @mousedown.prevent="exec('insertOrderedList')">
        1. List
      </button>
      <button type="button" class="rte-btn" title="Insert link" @mousedown.prevent="insertLink">
        Link
      </button>
      <button type="button" class="rte-btn" title="Remove link" @mousedown.prevent="exec('unlink')">
        Unlink
      </button>
    </div>
    <div
      ref="editorEl"
      class="rte-content form-textarea"
      contenteditable="true"
      :aria-placeholder="placeholder"
      @input="onInput"
      @blur="onInput"
    ></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const editorEl = ref(null);

onMounted(() => {
  if (editorEl.value && props.modelValue) {
    editorEl.value.innerHTML = props.modelValue;
  }
});

// Sync external modelValue changes (e.g. when form resets or populates for edit)
watch(() => props.modelValue, (val) => {
  if (editorEl.value && editorEl.value.innerHTML !== val) {
    editorEl.value.innerHTML = val || '';
  }
});

function onInput() {
  emit('update:modelValue', editorEl.value.innerHTML);
}

function exec(command) {
  editorEl.value?.focus();
  document.execCommand(command, false, null);
  onInput();
}

function insertLink() {
  const url = window.prompt('Enter URL:');
  if (!url) return;
  editorEl.value?.focus();
  document.execCommand('createLink', false, url);
  // Make links open in a new tab — walk newly created anchors
  editorEl.value?.querySelectorAll('a:not([target])').forEach(a => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  onInput();
}
</script>

<style scoped>
.rte-wrapper {
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  overflow: hidden;
}

.rte-toolbar {
  display: flex;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  background: var(--color-surface-alt, #f9fafb);
  border-bottom: 1px solid var(--color-border, #d1d5db);
}

.rte-btn {
  padding: 0.2rem 0.5rem;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  cursor: pointer;
  font-size: 0.875rem;
  line-height: 1.25;
}

.rte-btn:hover {
  background: var(--color-hover, #f3f4f6);
}

.rte-content {
  min-height: 6rem;
  padding: 0.5rem 0.75rem;
  outline: none;
  border: none;
  border-radius: 0;
  resize: vertical;
  overflow-y: auto;
}

.rte-content:empty::before {
  content: attr(aria-placeholder);
  color: var(--color-text-muted, #9ca3af);
  pointer-events: none;
}
</style>
