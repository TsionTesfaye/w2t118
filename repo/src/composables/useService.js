import { ref } from 'vue';
import { useAuthStore } from '../app/store/authStore.js';
import { useToast } from './useToast.js';

/**
 * Composable for calling service methods with loading/error state and session injection.
 */
export function useService() {
  const loading = ref(false);
  const error = ref(null);
  const authStore = useAuthStore();
  const toast = useToast();

  async function call(serviceFn, ...args) {
    loading.value = true;
    error.value = null;
    try {
      const result = await serviceFn(...args);
      return result;
    } catch (e) {
      error.value = e.message || 'An error occurred';
      toast.error(e.message || 'An error occurred');
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Call a service method that expects session as first arg.
   */
  async function callWithSession(serviceFn, ...args) {
    return call(serviceFn, authStore.session, ...args);
  }

  return { loading, error, call, callWithSession };
}
