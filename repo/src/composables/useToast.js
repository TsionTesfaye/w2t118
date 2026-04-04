import { useUiStore } from '../app/store/uiStore.js';

export function useToast() {
  const ui = useUiStore();
  return {
    success: ui.success,
    error: ui.showError,
    warning: ui.warning,
    info: ui.info,
  };
}
