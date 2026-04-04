import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const toasts = ref([]);
  let toastId = 0;

  function addToast(message, type = 'info', duration = 4000) {
    const id = ++toastId;
    toasts.value.push({ id, message, type });
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }

  function removeToast(id) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  function success(msg) { addToast(msg, 'success'); }
  function showError(msg) { addToast(msg, 'error', 6000); }
  function warning(msg) { addToast(msg, 'warning'); }
  function info(msg) { addToast(msg, 'info'); }

  return { toasts, addToast, removeToast, success, showError, warning, info };
});
