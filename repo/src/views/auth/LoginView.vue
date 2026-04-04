<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Sign In</h1>
      <p class="auth-subtitle">Welcome back to TradeLoop</p>

      <div v-if="errorMessage" class="alert-danger">
        <span>{{ errorMessage }}</span>
        <span v-if="retrySeconds > 0" class="lockout-timer">
          Try again in {{ retrySeconds }}s
        </span>
      </div>

      <form @submit.prevent="handleLogin" novalidate>
        <div class="form-group">
          <label for="username" class="form-label">Username</label>
          <input
            id="username"
            v-model.trim="username"
            type="text"
            class="form-input"
            :class="{ 'form-input-error': submitted && !username }"
            placeholder="Enter your username"
            autocomplete="username"
            :disabled="isLocked"
          />
          <span v-if="submitted && !username" class="form-error">
            Username is required
          </span>
        </div>

        <div class="form-group">
          <label for="password" class="form-label">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            :class="{ 'form-input-error': submitted && !password }"
            placeholder="Enter your password"
            autocomplete="current-password"
            :disabled="isLocked"
          />
          <span v-if="submitted && !password" class="form-error">
            Password is required
          </span>
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-block"
          :disabled="authStore.isLoading || isLocked"
        >
          <span v-if="authStore.isLoading">Signing in...</span>
          <span v-else>Sign In</span>
        </button>
      </form>

      <div class="auth-links">
        <router-link :to="{ name: RouteNames.RECOVER_PASSWORD }" class="auth-link">
          Forgot your password?
        </router-link>
        <router-link :to="{ name: RouteNames.REGISTER }" class="auth-link">
          Don't have an account? Register
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { RouteNames } from '../../app/router/routeNames.js';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const username = ref('');
const password = ref('');
const submitted = ref(false);
const errorMessage = ref('');
const retrySeconds = ref(0);
const isLocked = ref(false);

let lockoutTimer = null;

function startLockoutCountdown(seconds) {
  retrySeconds.value = seconds;
  isLocked.value = true;
  clearInterval(lockoutTimer);
  lockoutTimer = setInterval(() => {
    retrySeconds.value--;
    if (retrySeconds.value <= 0) {
      clearInterval(lockoutTimer);
      lockoutTimer = null;
      isLocked.value = false;
    }
  }, 1000);
}

async function handleLogin() {
  submitted.value = true;
  errorMessage.value = '';

  if (!username.value || !password.value) {
    return;
  }

  try {
    await authStore.login(username.value, password.value);
    toast.success('Signed in successfully');
    router.push({ name: RouteNames.HOME });
  } catch (err) {
    const msg = err.message || 'Login failed. Please try again.';
    errorMessage.value = msg;

    // Use structured retryAfter (ms) from RateLimitError — never parse message text
    if (err.details?.retryAfter) {
      startLockoutCountdown(Math.ceil(err.details.retryAfter / 1000));
    }
  }
}

onBeforeUnmount(() => {
  if (lockoutTimer) {
    clearInterval(lockoutTimer);
  }
});
</script>
