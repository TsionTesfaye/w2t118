<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Recover Password</h1>
      <p class="auth-subtitle">
        {{ step === 1 ? 'Enter your username to begin' : 'Verify your identity and set a new password' }}
      </p>

      <div v-if="errorMessage" class="alert-danger">
        <span>{{ errorMessage }}</span>
        <span v-if="retrySeconds > 0" class="lockout-timer">
          Try again in {{ retrySeconds }}s
        </span>
      </div>

      <!-- Step 1: Username -->
      <form v-if="step === 1" @submit.prevent="goToStep2" novalidate>
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
          />
          <span v-if="submitted && !username" class="form-error">
            Username is required
          </span>
        </div>

        <button type="submit" class="btn btn-primary btn-block">
          Continue
        </button>
      </form>

      <!-- Step 2: Security answers + new password -->
      <form v-else @submit.prevent="handleRecovery" novalidate>
        <p v-if="loadingQuestions" class="form-hint">Loading security questions...</p>
        <p v-else-if="fetchQuestionsError" class="form-error">{{ fetchQuestionsError }}</p>

        <div v-for="(question, idx) in securityQuestions" :key="idx" class="form-group">
          <label :for="`answer${idx}`" class="form-label">{{ question }}</label>
          <input
            :id="`answer${idx}`"
            v-model.trim="answers[idx]"
            type="text"
            class="form-input"
            :class="{ 'form-input-error': submitted && !answers[idx] }"
            placeholder="Your answer"
            :disabled="isLocked"
          />
          <span v-if="submitted && !answers[idx]" class="form-error">
            Answer is required
          </span>
        </div>

        <div class="form-group">
          <label for="newPassword" class="form-label">New Password</label>
          <input
            id="newPassword"
            v-model="newPassword"
            type="password"
            class="form-input"
            :class="{ 'form-input-error': submitted && !passwordValid }"
            placeholder="Enter a new password"
            autocomplete="new-password"
            :disabled="isLocked"
          />
          <ul class="password-rules">
            <li :class="rules.minLength ? 'rule-pass' : 'rule-fail'">
              At least 12 characters
            </li>
            <li :class="rules.uppercase ? 'rule-pass' : 'rule-fail'">
              At least 1 uppercase letter
            </li>
            <li :class="rules.lowercase ? 'rule-pass' : 'rule-fail'">
              At least 1 lowercase letter
            </li>
            <li :class="rules.number ? 'rule-pass' : 'rule-fail'">
              At least 1 number
            </li>
            <li :class="rules.symbol ? 'rule-pass' : 'rule-fail'">
              At least 1 symbol
            </li>
          </ul>
        </div>

        <div class="form-group">
          <label for="confirmPassword" class="form-label">Confirm New Password</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            class="form-input"
            :class="{ 'form-input-error': submitted && confirmPassword !== newPassword }"
            placeholder="Confirm your new password"
            autocomplete="new-password"
            :disabled="isLocked"
          />
          <span
            v-if="submitted && confirmPassword !== newPassword"
            class="form-error"
          >
            Passwords do not match
          </span>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            @click="backToStep1"
          >
            Back
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="authStore.isLoading || isLocked"
          >
            <span v-if="authStore.isLoading">Recovering...</span>
            <span v-else>Reset Password</span>
          </button>
        </div>
      </form>

      <div class="auth-links">
        <router-link :to="{ name: RouteNames.LOGIN }" class="auth-link">
          Back to Sign In
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { RouteNames } from '../../app/router/routeNames.js';
import { useToast } from '../../composables/useToast.js';
import { AuthService } from '../../services/AuthService.js';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const step = ref(1);
const username = ref('');
const answers = ref(['', '']);
const securityQuestions = ref([]);
const loadingQuestions = ref(false);
const fetchQuestionsError = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const submitted = ref(false);
const errorMessage = ref('');
const retrySeconds = ref(0);
const isLocked = ref(false);

let lockoutTimer = null;

const rules = computed(() => ({
  minLength: newPassword.value.length >= 12,
  uppercase: /[A-Z]/.test(newPassword.value),
  lowercase: /[a-z]/.test(newPassword.value),
  number: /[0-9]/.test(newPassword.value),
  symbol: /[^A-Za-z0-9]/.test(newPassword.value),
}));

const passwordValid = computed(() =>
  Object.values(rules.value).every(Boolean),
);

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

async function goToStep2() {
  submitted.value = true;
  errorMessage.value = '';

  if (!username.value) return;

  loadingQuestions.value = true;
  fetchQuestionsError.value = '';
  try {
    securityQuestions.value = await AuthService.getSecurityQuestions(username.value);
    answers.value = securityQuestions.value.map(() => '');
    submitted.value = false;
    step.value = 2;
  } catch (err) {
    fetchQuestionsError.value = err.message || 'Unable to load recovery form. Please try again.';
  } finally {
    loadingQuestions.value = false;
  }
}

function backToStep1() {
  step.value = 1;
  submitted.value = false;
  errorMessage.value = '';
  answers.value = ['', ''];
  securityQuestions.value = [];
  fetchQuestionsError.value = '';
  newPassword.value = '';
  confirmPassword.value = '';
  isLocked.value = false;
  retrySeconds.value = 0;
  clearInterval(lockoutTimer);
  lockoutTimer = null;
}

async function handleRecovery() {
  submitted.value = true;
  errorMessage.value = '';

  if (!answers.value[0] || !answers.value[1]) return;
  if (!passwordValid.value) return;
  if (confirmPassword.value !== newPassword.value) return;

  try {
    await authStore.recoverPassword(
      username.value,
      answers.value,
      newPassword.value,
    );
    toast.success('Password reset successfully. Please sign in with your new password.');
    router.push({ name: RouteNames.LOGIN });
  } catch (err) {
    const msg = err.message || 'Recovery failed. Please try again.';
    errorMessage.value = msg;

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
