<template>
  <div class="setup-page">
    <div class="setup-container">
      <div class="setup-header">
        <h1 class="setup-title">TradeLoop</h1>
        <p class="setup-subtitle">First-Run Setup</p>
      </div>

      <!-- Step indicator -->
      <div class="setup-steps">
        <div class="step" :class="{ active: step === 1, done: step > 1 }">
          <span class="step-number">1</span>
          <span class="step-label">Create Admin</span>
        </div>
        <div class="step-connector"></div>
        <div class="step" :class="{ active: step === 2, done: step > 2 }">
          <span class="step-number">2</span>
          <span class="step-label">Categories</span>
        </div>
      </div>

      <!-- ── STEP 1: Create admin account ── -->
      <div v-if="step === 1" class="setup-card">
        <h2>Create Administrator Account</h2>
        <p class="setup-description">
          This account will have full administrative access to the system.
        </p>

        <form @submit.prevent="handleCreateAdmin" novalidate>
          <div class="form-group">
            <label class="form-label" for="username">Username</label>
            <input
              id="username"
              v-model.trim="adminForm.username"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': errors.username }"
              autocomplete="username"
              placeholder="admin"
            />
            <span v-if="errors.username" class="form-error">{{ errors.username }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="displayName">Display Name</label>
            <input
              id="displayName"
              v-model.trim="adminForm.displayName"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': errors.displayName }"
              placeholder="Administrator"
            />
            <span v-if="errors.displayName" class="form-error">{{ errors.displayName }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="password">Password</label>
            <input
              id="password"
              v-model="adminForm.password"
              type="password"
              class="form-input"
              :class="{ 'form-input-error': errors.password }"
              autocomplete="new-password"
            />
            <span v-if="errors.password" class="form-error">{{ errors.password }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirmPassword">Confirm Password</label>
            <input
              id="confirmPassword"
              v-model="adminForm.confirmPassword"
              type="password"
              class="form-input"
              :class="{ 'form-input-error': errors.confirmPassword }"
              autocomplete="new-password"
            />
            <span v-if="errors.confirmPassword" class="form-error">{{ errors.confirmPassword }}</span>
          </div>

          <div class="password-rules">
            <p class="rules-title">Password requirements:</p>
            <ul>
              <li :class="{ 'rule-pass': adminForm.password.length >= 12 }">At least 12 characters</li>
              <li :class="{ 'rule-pass': /[A-Z]/.test(adminForm.password) }">One uppercase letter</li>
              <li :class="{ 'rule-pass': /[a-z]/.test(adminForm.password) }">One lowercase letter</li>
              <li :class="{ 'rule-pass': /[0-9]/.test(adminForm.password) }">One number</li>
              <li :class="{ 'rule-pass': /[^A-Za-z0-9]/.test(adminForm.password) }">One special character</li>
            </ul>
          </div>

          <h3 style="margin-top: 1.5rem;">Security Questions</h3>
          <p class="setup-description">These are used for account recovery.</p>

          <div v-for="(sq, i) in adminForm.securityQuestions" :key="i" class="security-question-group">
            <div class="form-group">
              <label class="form-label">Question {{ i + 1 }}</label>
              <select v-model="sq.question" class="form-select">
                <option value="">Select a question...</option>
                <option v-for="q in securityQuestionOptions" :key="q" :value="q">{{ q }}</option>
              </select>
              <span v-if="errors[`sq${i}q`]" class="form-error">{{ errors[`sq${i}q`] }}</span>
            </div>
            <div class="form-group">
              <label class="form-label">Answer</label>
              <input
                v-model.trim="sq.answer"
                type="text"
                class="form-input"
                :class="{ 'form-input-error': errors[`sq${i}a`] }"
                placeholder="Your answer"
              />
              <span v-if="errors[`sq${i}a`]" class="form-error">{{ errors[`sq${i}a`] }}</span>
            </div>
          </div>

          <div v-if="globalError" class="alert alert-error">{{ globalError }}</div>

          <button
            type="submit"
            class="btn btn-primary btn-full"
            :disabled="submitting"
          >
            {{ submitting ? 'Creating account...' : 'Create Admin Account' }}
          </button>
        </form>
      </div>

      <!-- ── STEP 2: Baseline categories ── -->
      <div v-if="step === 2" class="setup-card">
        <h2>Initialize Categories</h2>
        <p class="setup-description">
          Review the starter categories below. You can rename or remove them.
          Categories can be changed later from the Admin dashboard.
        </p>

        <div class="category-list">
          <div
            v-for="(cat, i) in categories"
            :key="i"
            class="category-row"
          >
            <input
              v-model="cat.name"
              type="text"
              class="form-input"
              placeholder="Category name"
            />
            <button
              class="btn btn-ghost btn-icon"
              type="button"
              @click="removeCategory(i)"
              title="Remove category"
            >
              ✕
            </button>
          </div>
        </div>

        <button
          class="btn btn-secondary"
          type="button"
          style="margin-top: 0.75rem;"
          @click="addCategory"
        >
          + Add Category
        </button>

        <div v-if="catError" class="alert alert-error" style="margin-top: 1rem;">{{ catError }}</div>

        <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem;">
          <button
            class="btn btn-primary btn-full"
            :disabled="submittingCats"
            @click="handleCreateCategories"
          >
            {{ submittingCats ? 'Setting up...' : 'Confirm & Finish Setup' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { InitService } from '../../services/InitService.js';
import { AuthService } from '../../services/AuthService.js';
import { markSystemInitialized } from '../../app/bootstrap/index.js';
import { RouteNames } from '../../app/router/routeNames.js';
import { useAuthStore } from '../../app/store/authStore.js';

const router = useRouter();
const authStore = useAuthStore();

const step = ref(1);
const submitting = ref(false);
const globalError = ref('');

// ── Step 1: Admin creation ──

const adminForm = reactive({
  username: '',
  displayName: '',
  password: '',
  confirmPassword: '',
  securityQuestions: [
    { question: '', answer: '' },
    { question: '', answer: '' },
  ],
});

const errors = reactive({});

const securityQuestionOptions = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What was the make of your first car?",
  "What is the name of the street you grew up on?",
];

// Holds the admin session after step 1 login
let adminSession = null;

function validateStep1() {
  Object.keys(errors).forEach(k => delete errors[k]);
  let valid = true;

  if (!adminForm.username) {
    errors.username = 'Username is required';
    valid = false;
  }
  if (!adminForm.displayName) {
    errors.displayName = 'Display name is required';
    valid = false;
  }
  if (!adminForm.password) {
    errors.password = 'Password is required';
    valid = false;
  } else if (adminForm.password !== adminForm.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
    valid = false;
  }
  adminForm.securityQuestions.forEach((sq, i) => {
    if (!sq.question) {
      errors[`sq${i}q`] = 'Select a security question';
      valid = false;
    }
    if (!sq.answer) {
      errors[`sq${i}a`] = 'Answer is required';
      valid = false;
    }
    if (i > 0 && sq.question === adminForm.securityQuestions[0].question) {
      errors[`sq${i}q`] = 'Questions must be different';
      valid = false;
    }
  });

  return valid;
}

async function handleCreateAdmin() {
  globalError.value = '';
  if (!validateStep1()) return;

  submitting.value = true;
  try {
    await InitService.createInitialAdmin({
      username: adminForm.username,
      password: adminForm.password,
      displayName: adminForm.displayName,
      securityQuestions: adminForm.securityQuestions,
    });

    // Auto-login so we have an admin session for step 2
    const result = await AuthService.login(adminForm.username, adminForm.password);
    adminSession = result.session;

    // Advance to category setup
    step.value = 2;
  } catch (e) {
    globalError.value = e.message || 'Setup failed. Please try again.';
  } finally {
    submitting.value = false;
  }
}

// ── Step 2: Categories ──

const categories = ref(InitService.defaultCategories().map(c => ({ name: c.name })));
const submittingCats = ref(false);
const catError = ref('');

function addCategory() {
  categories.value.push({ name: '' });
}

function removeCategory(i) {
  categories.value.splice(i, 1);
}

async function handleCreateCategories() {
  catError.value = '';
  const valid = categories.value.filter(c => c.name.trim());
  if (valid.length === 0) {
    catError.value = 'At least one category is required.';
    return;
  }

  submittingCats.value = true;
  try {
    await InitService.createBaselineCategories(adminSession, valid);

    // Mark system as initialized so the guard unlocks all routes
    markSystemInitialized();

    // Set session in the auth store so we go directly to HOME
    const { UserService } = await import('../../services/UserService.js');
    const user = await UserService.getProfile(adminSession, adminSession.userId);
    authStore.setSessionData(adminSession, user);

    router.push({ name: RouteNames.HOME });
  } catch (e) {
    catError.value = e.message || 'Failed to create categories.';
  } finally {
    submittingCats.value = false;
  }
}
</script>

<style scoped>
.setup-page {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  background: var(--color-bg, #f9fafb);
}

.setup-container {
  width: 100%;
  max-width: 520px;
}

.setup-header {
  text-align: center;
  margin-bottom: 2rem;
}

.setup-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary, #3b82f6);
  margin-bottom: 0.25rem;
}

.setup-subtitle {
  color: var(--color-muted, #6b7280);
  font-size: 1rem;
}

.setup-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2rem;
  gap: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.step-number {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-border, #e5e7eb);
  color: var(--color-muted, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
}

.step.active .step-number {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}

.step.done .step-number {
  background: var(--color-success, #10b981);
  color: #fff;
}

.step-label {
  font-size: 0.75rem;
  color: var(--color-muted, #6b7280);
}

.step.active .step-label {
  color: var(--color-text, #111827);
  font-weight: 600;
}

.step-connector {
  flex: 1;
  height: 2px;
  background: var(--color-border, #e5e7eb);
  margin: 0 0.5rem;
  margin-bottom: 1rem;
  min-width: 3rem;
}

.setup-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  padding: 2rem;
}

.setup-card h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.setup-description {
  color: var(--color-muted, #6b7280);
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.security-question-group {
  background: var(--color-bg, #f9fafb);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.btn-full {
  width: 100%;
  justify-content: center;
}

.alert {
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
}

.alert-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.category-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.category-row .form-input {
  flex: 1;
}

.btn-icon {
  padding: 0.5rem;
  min-width: 2rem;
  flex-shrink: 0;
}
</style>
