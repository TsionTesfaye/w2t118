<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Create Account</h1>
      <p class="auth-subtitle">Join the TradeLoop community</p>

      <div v-if="errorMessage" class="alert-danger">
        {{ errorMessage }}
      </div>

      <form @submit.prevent="handleRegister" novalidate>
        <div class="form-group">
          <label for="username" class="form-label">Username</label>
          <input
            id="username"
            v-model.trim="form.username"
            type="text"
            class="form-input"
            :class="{ 'form-input-error': submitted && !form.username }"
            placeholder="Choose a username"
            autocomplete="username"
          />
          <span v-if="submitted && !form.username" class="form-error">
            Username is required
          </span>
        </div>

        <div class="form-group">
          <label for="displayName" class="form-label">Display Name</label>
          <input
            id="displayName"
            v-model.trim="form.displayName"
            type="text"
            class="form-input"
            :class="{ 'form-input-error': submitted && !form.displayName }"
            placeholder="Your display name"
            autocomplete="name"
          />
          <span v-if="submitted && !form.displayName" class="form-error">
            Display name is required
          </span>
        </div>

        <div class="form-group">
          <label for="password" class="form-label">Password</label>
          <input
            id="password"
            v-model="form.password"
            type="password"
            class="form-input"
            :class="{ 'form-input-error': submitted && !passwordValid }"
            placeholder="Create a password"
            autocomplete="new-password"
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
          <label for="confirmPassword" class="form-label">Confirm Password</label>
          <input
            id="confirmPassword"
            v-model="form.confirmPassword"
            type="password"
            class="form-input"
            :class="{ 'form-input-error': submitted && form.confirmPassword !== form.password }"
            placeholder="Confirm your password"
            autocomplete="new-password"
          />
          <span
            v-if="submitted && form.confirmPassword !== form.password"
            class="form-error"
          >
            Passwords do not match
          </span>
        </div>

        <fieldset class="form-fieldset">
          <legend class="form-legend">Security Questions</legend>
          <p class="form-hint">
            These will be used to recover your account if you forget your password.
          </p>

          <div class="form-group">
            <label for="sq1-question" class="form-label">Question 1</label>
            <input
              id="sq1-question"
              v-model.trim="form.securityQuestions[0].question"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': submitted && !form.securityQuestions[0].question }"
              placeholder="e.g. What was your first pet's name?"
            />
            <span
              v-if="submitted && !form.securityQuestions[0].question"
              class="form-error"
            >
              Security question is required
            </span>
          </div>

          <div class="form-group">
            <label for="sq1-answer" class="form-label">Answer 1</label>
            <input
              id="sq1-answer"
              v-model.trim="form.securityQuestions[0].answer"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': submitted && !form.securityQuestions[0].answer }"
              placeholder="Your answer"
            />
            <span
              v-if="submitted && !form.securityQuestions[0].answer"
              class="form-error"
            >
              Answer is required
            </span>
          </div>

          <div class="form-group">
            <label for="sq2-question" class="form-label">Question 2</label>
            <input
              id="sq2-question"
              v-model.trim="form.securityQuestions[1].question"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': submitted && !form.securityQuestions[1].question }"
              placeholder="e.g. What city were you born in?"
            />
            <span
              v-if="submitted && !form.securityQuestions[1].question"
              class="form-error"
            >
              Security question is required
            </span>
          </div>

          <div class="form-group">
            <label for="sq2-answer" class="form-label">Answer 2</label>
            <input
              id="sq2-answer"
              v-model.trim="form.securityQuestions[1].answer"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': submitted && !form.securityQuestions[1].answer }"
              placeholder="Your answer"
            />
            <span
              v-if="submitted && !form.securityQuestions[1].answer"
              class="form-error"
            >
              Answer is required
            </span>
          </div>
        </fieldset>

        <button
          type="submit"
          class="btn btn-primary btn-block"
          :disabled="authStore.isLoading"
        >
          <span v-if="authStore.isLoading">Creating account...</span>
          <span v-else>Create Account</span>
        </button>
      </form>

      <div class="auth-links">
        <router-link :to="{ name: RouteNames.LOGIN }" class="auth-link">
          Already have an account? Sign in
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useToast } from '../../composables/useToast.js';
import { RouteNames } from '../../app/router/routeNames.js';

const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();

const submitted = ref(false);
const errorMessage = ref('');

const form = reactive({
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  securityQuestions: [
    { question: '', answer: '' },
    { question: '', answer: '' },
  ],
});

const rules = computed(() => ({
  minLength: form.password.length >= 12,
  uppercase: /[A-Z]/.test(form.password),
  lowercase: /[a-z]/.test(form.password),
  number: /[0-9]/.test(form.password),
  symbol: /[^A-Za-z0-9]/.test(form.password),
}));

const passwordValid = computed(() =>
  Object.values(rules.value).every(Boolean),
);

const securityQuestionsValid = computed(() =>
  form.securityQuestions.every((sq) => sq.question && sq.answer),
);

function validate() {
  if (!form.username) return false;
  if (!form.displayName) return false;
  if (!passwordValid.value) return false;
  if (form.confirmPassword !== form.password) return false;
  if (!securityQuestionsValid.value) return false;
  return true;
}

async function handleRegister() {
  submitted.value = true;
  errorMessage.value = '';

  if (!validate()) {
    return;
  }

  try {
    await authStore.register({
      username: form.username,
      password: form.password,
      displayName: form.displayName,
      securityQuestions: form.securityQuestions,
    });
    toast.success('Account created successfully. Please sign in.');
    router.push({ name: RouteNames.LOGIN });
  } catch (err) {
    errorMessage.value = err.message || 'Registration failed. Please try again.';
  }
}
</script>
