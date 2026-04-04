import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router, installRouterGuard } from './app/router/vueRouter.js';
import { useAuthStore } from './app/store/authStore.js';
import { useUiPreferencesStore } from './app/store/uiPreferencesStore.js';
import { bootstrapApp } from './app/bootstrap/index.js';
import './assets/design-system.css';

async function init() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  // Pinia must be installed before using any store
  const authStore = useAuthStore();

  // Hydrate UI preferences from localStorage immediately (theme applied to DOM)
  useUiPreferencesStore();

  installRouterGuard(authStore);

  app.use(router);

  try {
    await bootstrapApp();
    authStore.restoreSession();
  } catch (e) {
    console.error('Bootstrap failed:', e);
  }

  app.mount('#app');
}

init();
