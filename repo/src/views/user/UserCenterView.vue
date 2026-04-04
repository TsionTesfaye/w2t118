<template>
  <div class="page-content">
    <div class="page-header">
      <h1>User Center</h1>
    </div>

    <!-- Tab Navigation -->
    <div class="tabs" data-testid="user-center-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ active: activeTab === t.key }"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- Loading Overlay -->
    <div v-if="loading" class="loading-state">Loading...</div>

    <!-- ===================== PROFILE TAB ===================== -->
    <div v-if="activeTab === 'profile' && !loading">
      <div class="card">
        <h2>Edit Profile</h2>
        <form @submit.prevent="saveProfile" novalidate>
          <div class="form-group">
            <label class="form-label">Username</label>
            <input
              type="text"
              class="form-input"
              :value="profile?.username"
              disabled
            />
            <small class="form-hint">Username cannot be changed.</small>
          </div>

          <div class="form-group">
            <label class="form-label" for="displayName">Display Name</label>
            <input
              id="displayName"
              v-model.trim="profileForm.displayName"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': profileErrors.displayName }"
            />
            <span v-if="profileErrors.displayName" class="form-error">
              {{ profileErrors.displayName }}
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="bio">Bio</label>
            <textarea
              id="bio"
              v-model="profileForm.bio"
              class="form-textarea"
              rows="4"
              placeholder="Tell others about yourself..."
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Avatar</label>
            <div v-if="avatarPreview || profile?.avatar" style="margin-bottom: 0.5rem;">
              <img
                :src="avatarPreview || profile.avatar"
                alt="Avatar preview"
                style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border, #d1d5db);"
              />
            </div>
            <input
              id="avatarUpload"
              type="file"
              accept="image/*"
              class="form-input"
              style="padding: 0.25rem;"
              @change="handleAvatarChange"
            />
            <small class="form-hint">JPG, PNG or GIF · Max 2 MB</small>
            <span v-if="avatarError" class="form-error">{{ avatarError }}</span>
          </div>

          <button type="submit" class="btn btn-primary" :disabled="savingProfile">
            {{ savingProfile ? 'Saving...' : 'Save Profile' }}
          </button>
        </form>
      </div>
    </div>

    <!-- ===================== ADDRESSES TAB ===================== -->
    <div v-if="activeTab === 'addresses' && !loading">
      <div class="card">
        <div class="card-header-row">
          <h2>My Addresses</h2>
          <button class="btn btn-primary" @click="openAddressModal(null)">
            Add Address
          </button>
        </div>

        <div v-if="addresses.length === 0">
          <EmptyState
            icon="📍"
            title="No addresses yet"
            message="Add a shipping address to get started."
          />
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Street</th>
                <th>City</th>
                <th>State</th>
                <th>ZIP</th>
                <th>Phone</th>
                <th>Default</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="addr in addresses" :key="addr.id">
                <td>{{ addr.street }}{{ addr.street2 ? ', ' + addr.street2 : '' }}</td>
                <td>{{ addr.city }}</td>
                <td>{{ addr.state }}</td>
                <td>{{ addr.zipCode }}</td>
                <td>
                  <span v-if="addr.phone">
                    <span>{{ revealedPhones.has(addr.id) ? addr.phone : maskPhone(addr.phone) }}</span>
                    <button
                      class="btn btn-sm btn-ghost"
                      style="margin-left: 0.25rem; padding: 0 0.3rem; font-size: 0.75rem;"
                      @click="togglePhoneReveal(addr.id)"
                      :title="revealedPhones.has(addr.id) ? 'Hide' : 'Reveal'"
                    >{{ revealedPhones.has(addr.id) ? 'Hide' : 'Show' }}</button>
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <span v-if="addr.isDefault" class="badge badge-success">Default</span>
                </td>
                <td class="action-cell">
                  <button
                    v-if="!addr.isDefault"
                    class="btn btn-sm btn-outline"
                    :disabled="addressActionLoading"
                    @click="handleSetDefault(addr.id)"
                  >
                    Set Default
                  </button>
                  <button
                    class="btn btn-sm btn-outline"
                    @click="openAddressModal(addr)"
                  >
                    Edit
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    :disabled="addressActionLoading"
                    @click="handleDeleteAddress(addr.id)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Address Modal -->
      <AppModal
        v-model="showAddressModal"
        :title="editingAddress ? 'Edit Address' : 'Add Address'"
        max-width="560px"
      >
        <form @submit.prevent="saveAddress" novalidate>
          <div class="form-group">
            <label class="form-label" for="addr-street">Street *</label>
            <input
              id="addr-street"
              v-model.trim="addressForm.street"
              type="text"
              class="form-input"
              :class="{ 'form-input-error': addressErrors.street }"
            />
            <span v-if="addressErrors.street" class="form-error">{{ addressErrors.street }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="addr-street2">Street 2</label>
            <input
              id="addr-street2"
              v-model.trim="addressForm.street2"
              type="text"
              class="form-input"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="addr-city">City *</label>
              <input
                id="addr-city"
                v-model.trim="addressForm.city"
                type="text"
                class="form-input"
                :class="{ 'form-input-error': addressErrors.city }"
              />
              <span v-if="addressErrors.city" class="form-error">{{ addressErrors.city }}</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="addr-state">State *</label>
              <select
                id="addr-state"
                v-model="addressForm.state"
                class="form-select"
                :class="{ 'form-input-error': addressErrors.state }"
              >
                <option value="">Select state</option>
                <option v-for="s in US_STATES" :key="s.abbr" :value="s.abbr">
                  {{ s.name }}
                </option>
              </select>
              <span v-if="addressErrors.state" class="form-error">{{ addressErrors.state }}</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="addr-zip">ZIP Code *</label>
              <input
                id="addr-zip"
                v-model.trim="addressForm.zipCode"
                type="text"
                maxlength="5"
                class="form-input"
                :class="{ 'form-input-error': addressErrors.zipCode }"
              />
              <span v-if="addressErrors.zipCode" class="form-error">{{ addressErrors.zipCode }}</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="addr-phone">Phone *</label>
              <input
                id="addr-phone"
                v-model.trim="addressForm.phone"
                type="text"
                maxlength="14"
                placeholder="(555) 123-4567"
                class="form-input"
                :class="{ 'form-input-error': addressErrors.phone }"
              />
              <span v-if="addressErrors.phone" class="form-error">{{ addressErrors.phone }}</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-checkbox">
              <input type="checkbox" v-model="addressForm.isDefault" />
              Set as default address
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-outline" @click="showAddressModal = false">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" :disabled="savingAddress">
              {{ savingAddress ? 'Saving...' : (editingAddress ? 'Update' : 'Add') }}
            </button>
          </div>
        </form>
      </AppModal>
    </div>

    <!-- ===================== TRANSACTIONS TAB ===================== -->
    <div v-if="activeTab === 'transactions' && !loading">
      <div class="card">
        <h2>My Transactions</h2>

        <div v-if="transactions.length === 0">
          <EmptyState
            icon="📦"
            title="No transactions"
            message="Your transaction history will appear here."
          />
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id">
                <td>{{ tx.listingId }}</td>
                <td>{{ tx.buyerId === authStore.userId ? 'Buyer' : 'Seller' }}</td>
                <td><StatusBadge :status="tx.status" /></td>
                <td>{{ formatDate(tx.createdAt) }}</td>
                <td>{{ formatDate(tx.updatedAt) }}</td>
                <td>
                  <router-link
                    :to="{ name: RouteNames.THREAD_DETAIL, params: { id: tx.threadId } }"
                    class="btn btn-sm btn-outline"
                  >
                    View Thread
                  </router-link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ===================== COMPLAINTS TAB ===================== -->
    <div v-if="activeTab === 'complaints' && !loading">
      <div class="card">
        <h2>My Complaints</h2>

        <div v-if="complaints.length === 0">
          <EmptyState
            icon="📋"
            title="No complaints"
            message="You have not filed any complaints. Complaints can be filed from an active transaction thread."
          />
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Issue Type</th>
                <th>Status</th>
                <th>Transaction</th>
                <th>Created</th>
                <th>Resolution</th>
                <th>Refund</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in complaints" :key="c.id">
                <td>{{ c.issueType }}</td>
                <td><StatusBadge :status="c.status" /></td>
                <td>{{ c.transactionId }}</td>
                <td>{{ formatDate(c.createdAt) }}</td>
                <td>{{ c.resolution || '-' }}</td>
                <td>
                  <span v-if="complaintRefunds[c.id]">
                    <StatusBadge :status="complaintRefunds[c.id].status" />
                  </span>
                  <span v-else>-</span>
                </td>
                <td>
                  <button
                    v-if="canRequestRefund(c)"
                    class="btn btn-sm btn-outline"
                    @click="openRefundModal(c)"
                  >
                    Request Refund
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Refund Request Modal -->
      <AppModal v-model="showRefundModal" title="Request Refund" max-width="480px">
        <div class="form-group">
          <label class="form-label">Reason *</label>
          <textarea
            v-model="refundReason"
            class="form-textarea"
            rows="4"
            placeholder="Explain why you are requesting a refund..."
          ></textarea>
        </div>
        <template #footer>
          <button type="button" class="btn btn-secondary" @click="showRefundModal = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!refundReason.trim() || refundSubmitting"
            @click="handleRequestRefund"
          >
            {{ refundSubmitting ? 'Submitting...' : 'Submit Request' }}
          </button>
        </template>
      </AppModal>
    </div>

    <!-- ===================== NOTIFICATIONS TAB ===================== -->
    <div v-if="activeTab === 'notifications' && !loading">
      <div class="card">
        <div class="card-header-row">
          <h2>Notifications</h2>
          <button
            class="btn btn-outline"
            :disabled="markingAllRead"
            @click="handleMarkAllRead"
          >
            {{ markingAllRead ? 'Marking...' : 'Mark All Read' }}
          </button>
        </div>

        <div v-if="notifications.length === 0">
          <EmptyState
            icon="🔔"
            title="No notifications"
            message="You are all caught up."
          />
        </div>

        <ul v-else class="notification-list">
          <li
            v-for="n in notifications"
            :key="n.id"
            class="notification-item"
            :class="{ 'notification-unread': !n.isRead }"
            @click="handleMarkRead(n)"
          >
            <span class="notification-icon">{{ notificationIcon(n.type) }}</span>
            <div class="notification-body">
              <p class="notification-message">{{ n.message }}</p>
              <span class="notification-date">{{ formatDate(n.createdAt) }}</span>
            </div>
            <span v-if="!n.isRead" class="notification-dot" title="Unread"></span>
          </li>
        </ul>
      </div>
    </div>

    <!-- ===================== SETTINGS TAB ===================== -->
    <div v-if="activeTab === 'settings' && !loading">
      <!-- Appearance -->
      <div class="card">
        <h2>Appearance</h2>
        <div class="settings-toggles">
          <label class="toggle-row">
            <span class="toggle-label">Dark Mode</span>
            <input
              type="checkbox"
              :checked="uiPrefs.theme === 'dark'"
              @change="uiPrefs.toggleTheme()"
            />
          </label>
        </div>
      </div>

      <!-- Notification Preferences -->
      <div class="card">
        <h2>Notification Preferences</h2>
        <div class="settings-toggles">
          <label class="toggle-row" v-for="pref in notifPrefKeys" :key="pref">
            <span class="toggle-label">{{ prefLabel(pref) }}</span>
            <input
              type="checkbox"
              :checked="notifPrefs[pref]"
              @change="handleTogglePref(pref, $event)"
            />
          </label>
        </div>
      </div>

      <!-- Change Password -->
      <div class="card">
        <h2>Change Password</h2>
        <form @submit.prevent="handleChangePassword" novalidate>
          <div class="form-group">
            <label class="form-label" for="currentPw">Current Password</label>
            <input
              id="currentPw"
              v-model="passwordForm.current"
              type="password"
              class="form-input"
              :class="{ 'form-input-error': passwordErrors.current }"
              autocomplete="current-password"
            />
            <span v-if="passwordErrors.current" class="form-error">{{ passwordErrors.current }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="newPw">New Password</label>
            <input
              id="newPw"
              v-model="passwordForm.newPassword"
              type="password"
              class="form-input"
              :class="{ 'form-input-error': passwordErrors.newPassword }"
              autocomplete="new-password"
            />
            <span v-if="passwordErrors.newPassword" class="form-error">{{ passwordErrors.newPassword }}</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="confirmPw">Confirm New Password</label>
            <input
              id="confirmPw"
              v-model="passwordForm.confirm"
              type="password"
              class="form-input"
              :class="{ 'form-input-error': passwordErrors.confirm }"
              autocomplete="new-password"
            />
            <span v-if="passwordErrors.confirm" class="form-error">{{ passwordErrors.confirm }}</span>
          </div>

          <div class="password-rules">
            <p class="rules-title">Password requirements:</p>
            <ul>
              <li :class="{ 'rule-pass': passwordForm.newPassword.length >= 12 }">At least 12 characters</li>
              <li :class="{ 'rule-pass': /[A-Z]/.test(passwordForm.newPassword) }">One uppercase letter</li>
              <li :class="{ 'rule-pass': /[a-z]/.test(passwordForm.newPassword) }">One lowercase letter</li>
              <li :class="{ 'rule-pass': /[0-9]/.test(passwordForm.newPassword) }">One number</li>
              <li :class="{ 'rule-pass': /[^A-Za-z0-9]/.test(passwordForm.newPassword) }">One special character</li>
            </ul>
          </div>

          <button type="submit" class="btn btn-primary" :disabled="changingPassword">
            {{ changingPassword ? 'Changing...' : 'Change Password' }}
          </button>
        </form>
      </div>

      <!-- Blocked Users -->
      <div class="card">
        <h2>Blocked Users</h2>

        <div v-if="blockedUsers.length === 0">
          <EmptyState
            icon="🚫"
            title="No blocked users"
            message="You have not blocked anyone."
          />
        </div>

        <div v-else class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Blocked Since</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in blockedUsers" :key="b.id">
                <td>{{ b.blockedId }}</td>
                <td>{{ formatDate(b.createdAt) }}</td>
                <td>
                  <button
                    class="btn btn-sm btn-outline"
                    :disabled="unblockingId === b.blockedId"
                    @click="handleUnblock(b.blockedId)"
                  >
                    {{ unblockingId === b.blockedId ? 'Unblocking...' : 'Unblock' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../app/store/authStore.js';
import { useTransactionStore } from '../../app/store/transactionStore.js';
import { useNotificationStore } from '../../app/store/notificationStore.js';
import { useUiPreferencesStore } from '../../app/store/uiPreferencesStore.js';
import { RouteNames } from '../../app/router/routeNames.js';
import { useToast } from '../../composables/useToast.js';
import { UserService } from '../../services/UserService.js';
import { AddressService } from '../../services/AddressService.js';
import { SupportService } from '../../services/SupportService.js';
import { ComplaintStatus } from '../../domain/enums/statuses.js';
import { maskPhone } from '../../utils/formatting.js';
import { NotificationService } from '../../services/NotificationService.js';
import { AuthService } from '../../services/AuthService.js';
import StatusBadge from '../../components/StatusBadge.vue';
import AppModal from '../../components/AppModal.vue';
import EmptyState from '../../components/EmptyState.vue';

// ── Routing & Stores ──

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const transactionStore = useTransactionStore();
const notificationStore = useNotificationStore();
const uiPrefs = useUiPreferencesStore();
const toast = useToast();

// ── Tab Definitions ──

const tabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'addresses', label: 'Addresses' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'settings', label: 'Settings' },
];

const TAB_ROUTE_MAP = {
  profile: '/user-center/profile',
  addresses: '/user-center/addresses',
  transactions: '/user-center/transactions',
  complaints: '/user-center/complaints',
  notifications: '/user-center/notifications',
  settings: '/user-center/settings',
};

function tabFromPath(path) {
  for (const [key, routePath] of Object.entries(TAB_ROUTE_MAP)) {
    if (path === routePath) return key;
  }
  return 'profile';
}

const activeTab = ref(tabFromPath(route.path));
const loading = ref(false);

function switchTab(tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  router.replace({ name: RouteNames.USER_CENTER, params: { tab } });
}

// ── Session helper ──

function getSession() {
  return authStore.session;
}

// ── Shared date formatter ──

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ══════════════════════════════════════════
//   PROFILE TAB
// ══════════════════════════════════════════

const profile = ref(null);
const profileForm = reactive({ displayName: '', bio: '' });
const profileErrors = reactive({ displayName: '' });
const savingProfile = ref(false);
const avatarPreview = ref(null);
const avatarDataUrl = ref(null);
const avatarError = ref('');

async function loadProfile() {
  loading.value = true;
  try {
    const data = await UserService.getProfile(getSession(), authStore.userId);
    profile.value = data;
    profileForm.displayName = data.displayName || '';
    profileForm.bio = data.bio || '';
    avatarPreview.value = null;
    avatarDataUrl.value = null;
    avatarError.value = '';
  } catch (err) {
    toast.error(err.message || 'Failed to load profile');
  } finally {
    loading.value = false;
  }
}

function handleAvatarChange(event) {
  avatarError.value = '';
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    avatarError.value = 'Only image files are allowed';
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    avatarError.value = 'Image must be 2 MB or less';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    avatarPreview.value = e.target.result;
    avatarDataUrl.value = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveProfile() {
  profileErrors.displayName = '';
  if (!profileForm.displayName) {
    profileErrors.displayName = 'Display name is required';
    return;
  }

  savingProfile.value = true;
  try {
    const payload = { displayName: profileForm.displayName, bio: profileForm.bio };
    if (avatarDataUrl.value) payload.avatar = avatarDataUrl.value;
    const updated = await UserService.updateProfile(getSession(), payload);
    profile.value = updated;
    toast.success('Profile updated');
  } catch (err) {
    toast.error(err.message || 'Failed to update profile');
  } finally {
    savingProfile.value = false;
  }
}

// ══════════════════════════════════════════
//   ADDRESSES TAB
// ══════════════════════════════════════════

const addresses = ref([]);
const showAddressModal = ref(false);
const editingAddress = ref(null);
const savingAddress = ref(false);
const addressActionLoading = ref(false);
// Tracks which address IDs have their phone number revealed
const revealedPhones = ref(new Set());

function togglePhoneReveal(addressId) {
  const set = new Set(revealedPhones.value);
  if (set.has(addressId)) {
    set.delete(addressId);
  } else {
    set.add(addressId);
  }
  revealedPhones.value = set;
}

const addressForm = reactive({
  street: '',
  street2: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  isDefault: false,
});
const addressErrors = reactive({
  street: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
});

const US_STATES = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' }, { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' }, { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' }, { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' }, { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' }, { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' }, { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' }, { abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' }, { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' }, { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' }, { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' }, { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' }, { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' },
  { abbr: 'DC', name: 'District of Columbia' },
];

async function loadAddresses() {
  loading.value = true;
  try {
    addresses.value = await AddressService.getMyAddresses(getSession());
  } catch (err) {
    toast.error(err.message || 'Failed to load addresses');
  } finally {
    loading.value = false;
  }
}

function resetAddressForm() {
  addressForm.street = '';
  addressForm.street2 = '';
  addressForm.city = '';
  addressForm.state = '';
  addressForm.zipCode = '';
  addressForm.phone = '';
  addressForm.isDefault = false;
  Object.keys(addressErrors).forEach(k => { addressErrors[k] = ''; });
}

function openAddressModal(addr) {
  resetAddressForm();
  if (addr) {
    editingAddress.value = addr;
    addressForm.street = addr.street || '';
    addressForm.street2 = addr.street2 || '';
    addressForm.city = addr.city || '';
    addressForm.state = addr.state || '';
    addressForm.zipCode = addr.zipCode || '';
    addressForm.phone = addr.phone || '';
    addressForm.isDefault = addr.isDefault || false;
  } else {
    editingAddress.value = null;
  }
  showAddressModal.value = true;
}

function validateAddressForm() {
  let valid = true;
  Object.keys(addressErrors).forEach(k => { addressErrors[k] = ''; });

  if (!addressForm.street) {
    addressErrors.street = 'Street is required';
    valid = false;
  }
  if (!addressForm.city) {
    addressErrors.city = 'City is required';
    valid = false;
  }
  if (!addressForm.state) {
    addressErrors.state = 'State is required';
    valid = false;
  }
  if (!addressForm.zipCode || !/^\d{5}$/.test(addressForm.zipCode)) {
    addressErrors.zipCode = 'ZIP code must be exactly 5 digits';
    valid = false;
  }
  const digitsOnly = (addressForm.phone || '').replace(/\D/g, '');
  if (!digitsOnly || digitsOnly.length !== 10) {
    addressErrors.phone = 'Phone must be 10 digits';
    valid = false;
  }
  return valid;
}

async function saveAddress() {
  if (!validateAddressForm()) return;

  savingAddress.value = true;
  const data = {
    street: addressForm.street,
    street2: addressForm.street2 || null,
    city: addressForm.city,
    state: addressForm.state,
    zipCode: addressForm.zipCode,
    phone: addressForm.phone.replace(/\D/g, ''),
    isDefault: addressForm.isDefault,
  };

  try {
    if (editingAddress.value) {
      await AddressService.update(getSession(), editingAddress.value.id, data);
      toast.success('Address updated');
    } else {
      await AddressService.create(getSession(), data);
      toast.success('Address added');
    }
    showAddressModal.value = false;
    await loadAddresses();
  } catch (err) {
    toast.error(err.message || 'Failed to save address');
  } finally {
    savingAddress.value = false;
  }
}

async function handleSetDefault(id) {
  addressActionLoading.value = true;
  try {
    await AddressService.setDefault(getSession(), id);
    toast.success('Default address updated');
    await loadAddresses();
  } catch (err) {
    toast.error(err.message || 'Failed to set default');
  } finally {
    addressActionLoading.value = false;
  }
}

async function handleDeleteAddress(id) {
  if (!confirm('Are you sure you want to delete this address?')) return;
  addressActionLoading.value = true;
  try {
    await AddressService.delete(getSession(), id);
    toast.success('Address deleted');
    await loadAddresses();
  } catch (err) {
    toast.error(err.message || 'Failed to delete address');
  } finally {
    addressActionLoading.value = false;
  }
}

// ══════════════════════════════════════════
//   TRANSACTIONS TAB
// ══════════════════════════════════════════

const transactions = computed(() => transactionStore.transactions);

async function loadTransactions() {
  loading.value = true;
  try {
    await transactionStore.fetchForUser(getSession());
  } catch (err) {
    toast.error(err.message || 'Failed to load transactions');
  } finally {
    loading.value = false;
  }
}

// ══════════════════════════════════════════
//   COMPLAINTS TAB
// ══════════════════════════════════════════

const complaints = ref([]);
// Map of complaintId → refund object (or null if none)
const complaintRefunds = ref({});

// Which complaint is being refund-requested
const showRefundModal = ref(false);
const refundTargetComplaint = ref(null);
const refundReason = ref('');
const refundSubmitting = ref(false);

async function loadComplaints() {
  loading.value = true;
  try {
    const data = await SupportService.getMyComplaints(getSession());
    complaints.value = data.sort((a, b) => b.createdAt - a.createdAt);

    // Load associated refunds in parallel
    const refundMap = {};
    await Promise.all(
      data.map(async (c) => {
        try {
          const r = await SupportService.getRefundByComplaint(getSession(), c.id);
          refundMap[c.id] = r;
        } catch {
          refundMap[c.id] = null;
        }
      })
    );
    complaintRefunds.value = refundMap;
  } catch (err) {
    toast.error(err.message || 'Failed to load complaints');
  } finally {
    loading.value = false;
  }
}

function canRequestRefund(complaint) {
  const refundableStates = [ComplaintStatus.INVESTIGATING, ComplaintStatus.RESOLVED];
  return refundableStates.includes(complaint.status) && !complaintRefunds.value[complaint.id];
}

function openRefundModal(complaint) {
  refundTargetComplaint.value = complaint;
  refundReason.value = '';
  showRefundModal.value = true;
}

async function handleRequestRefund() {
  if (!refundTargetComplaint.value || !refundReason.value.trim()) return;
  refundSubmitting.value = true;
  try {
    await SupportService.requestRefund(getSession(), {
      complaintId: refundTargetComplaint.value.id,
      reason: refundReason.value.trim(),
    });
    toast.success('Refund requested successfully.');
    showRefundModal.value = false;
    refundTargetComplaint.value = null;
    await loadComplaints();
  } catch (err) {
    toast.error(err.message || 'Failed to request refund');
  } finally {
    refundSubmitting.value = false;
  }
}

// ══════════════════════════════════════════
//   NOTIFICATIONS TAB
// ══════════════════════════════════════════

const notifications = computed(() => notificationStore.notifications);
const markingAllRead = ref(false);

function notificationIcon(type) {
  const icons = {
    message: '💬',
    transaction: '📦',
    moderation: '🛡️',
    complaint: '📋',
    refund: '💰',
  };
  return icons[type] || '🔔';
}

async function loadNotifications() {
  loading.value = true;
  try {
    await notificationStore.fetchNotifications(getSession());
  } catch (err) {
    toast.error(err.message || 'Failed to load notifications');
  } finally {
    loading.value = false;
  }
}

async function handleMarkRead(n) {
  if (n.isRead) return;
  try {
    await NotificationService.markAsRead(getSession(), n.id);
    n.isRead = true;
    notificationStore.unreadCount = Math.max(0, notificationStore.unreadCount - 1);
  } catch (err) {
    toast.error(err.message || 'Failed to mark as read');
  }
}

async function handleMarkAllRead() {
  markingAllRead.value = true;
  try {
    await notificationStore.markAllRead(getSession());
    toast.success('All notifications marked as read');
  } catch (err) {
    toast.error(err.message || 'Failed to mark all as read');
  } finally {
    markingAllRead.value = false;
  }
}

// ══════════════════════════════════════════
//   SETTINGS TAB
// ══════════════════════════════════════════

// -- Notification Preferences (backed by uiPreferencesStore + IndexedDB) --

const notifPrefKeys = ['messages', 'moderation', 'transactions', 'complaints'];
const notifPrefs = uiPrefs.notificationPrefs;

function prefLabel(key) {
  const labels = {
    messages: 'Messages',
    moderation: 'Moderation updates',
    transactions: 'Transaction updates',
    complaints: 'Complaint updates',
  };
  return labels[key] || key;
}

async function loadSettings() {
  loading.value = true;
  try {
    // Load profile from IndexedDB; use it as source-of-truth for prefs
    const data = await UserService.getProfile(getSession(), authStore.userId);
    if (data.notificationPreferences) {
      // Sync IndexedDB values → localStorage via the store
      uiPrefs.hydrateNotificationPrefs(data.notificationPreferences);
    }
    // Load blocked users
    const blocks = await UserService.getBlockedUsers(getSession());
    blockedUsers.value = blocks;
  } catch (err) {
    toast.error(err.message || 'Failed to load settings');
  } finally {
    loading.value = false;
  }
}

async function handleTogglePref(key, event) {
  const newVal = event.target.checked;
  const oldVal = notifPrefs[key];

  // Optimistic update — localStorage immediate, IndexedDB async
  uiPrefs.setNotificationPref(key, newVal);

  try {
    await UserService.updateNotificationPreferences(getSession(), { [key]: newVal });
    toast.success('Preference updated');
  } catch (err) {
    // Rollback both stores on failure
    uiPrefs.setNotificationPref(key, oldVal);
    toast.error(err.message || 'Failed to update preference');
  }
}

// -- Change Password --

const passwordForm = reactive({ current: '', newPassword: '', confirm: '' });
const passwordErrors = reactive({ current: '', newPassword: '', confirm: '' });
const changingPassword = ref(false);

function validatePasswordForm() {
  let valid = true;
  Object.keys(passwordErrors).forEach(k => { passwordErrors[k] = ''; });

  if (!passwordForm.current) {
    passwordErrors.current = 'Current password is required';
    valid = false;
  }
  if (!passwordForm.newPassword) {
    passwordErrors.newPassword = 'New password is required';
    valid = false;
  } else if (passwordForm.newPassword.length < 12) {
    passwordErrors.newPassword = 'Password must be at least 12 characters';
    valid = false;
  } else if (!/[A-Z]/.test(passwordForm.newPassword)) {
    passwordErrors.newPassword = 'Must contain an uppercase letter';
    valid = false;
  } else if (!/[a-z]/.test(passwordForm.newPassword)) {
    passwordErrors.newPassword = 'Must contain a lowercase letter';
    valid = false;
  } else if (!/[0-9]/.test(passwordForm.newPassword)) {
    passwordErrors.newPassword = 'Must contain a number';
    valid = false;
  } else if (!/[^A-Za-z0-9]/.test(passwordForm.newPassword)) {
    passwordErrors.newPassword = 'Must contain a special character';
    valid = false;
  }
  if (!passwordForm.confirm) {
    passwordErrors.confirm = 'Please confirm your new password';
    valid = false;
  } else if (passwordForm.newPassword !== passwordForm.confirm) {
    passwordErrors.confirm = 'Passwords do not match';
    valid = false;
  }
  return valid;
}

async function handleChangePassword() {
  if (!validatePasswordForm()) return;

  changingPassword.value = true;
  try {
    const result = await AuthService.changePassword(
      getSession(),
      passwordForm.current,
      passwordForm.newPassword,
    );
    toast.success('Password changed successfully');
    if (result.requiresReLogin) {
      await authStore.logout();
      router.push({ name: RouteNames.LOGIN });
    }
  } catch (err) {
    toast.error(err.message || 'Failed to change password');
  } finally {
    changingPassword.value = false;
  }
}

// -- Blocked Users --

const blockedUsers = ref([]);
const unblockingId = ref(null);

async function handleUnblock(targetUserId) {
  unblockingId.value = targetUserId;
  try {
    await UserService.unblockUser(getSession(), targetUserId);
    blockedUsers.value = blockedUsers.value.filter(b => b.blockedId !== targetUserId);
    toast.success('User unblocked');
  } catch (err) {
    toast.error(err.message || 'Failed to unblock user');
  } finally {
    unblockingId.value = null;
  }
}

// ══════════════════════════════════════════
//   TAB DATA LOADING
// ══════════════════════════════════════════

const tabLoaders = {
  profile: loadProfile,
  addresses: loadAddresses,
  transactions: loadTransactions,
  complaints: loadComplaints,
  notifications: loadNotifications,
  settings: loadSettings,
};

watch(activeTab, (tab) => {
  const loader = tabLoaders[tab];
  if (loader) loader();
});

// Also watch route changes (e.g. direct navigation)
watch(() => route.path, (path) => {
  const tab = tabFromPath(path);
  if (tab !== activeTab.value) {
    activeTab.value = tab;
  }
});

onMounted(() => {
  const tab = tabFromPath(route.path);
  activeTab.value = tab;
  const loader = tabLoaders[tab];
  if (loader) loader();
});
</script>

<style scoped>
/* ── Layout ── */

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--color-text-secondary, #6b7280);
  font-size: 0.95rem;
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.card-header-row h2 {
  margin: 0;
}

/* ── Action cell ── */

.action-cell {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

/* ── Small buttons ── */

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--color-border, #d1d5db);
  color: var(--color-text, #111827);
}

.btn-outline:hover {
  background: var(--color-bg-hover, #f3f4f6);
}

/* ── Form hints ── */

.form-hint {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8rem;
  color: var(--color-text-secondary, #6b7280);
}

.form-checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

/* ── Modal actions ── */

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

/* ── Notification list ── */

.notification-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0.5rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  cursor: pointer;
  transition: background 0.15s;
}

.notification-item:hover {
  background: var(--color-bg-hover, #f9fafb);
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-unread {
  background: var(--color-bg-accent, #eff6ff);
}

.notification-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.1rem;
}

.notification-body {
  flex: 1;
  min-width: 0;
}

.notification-message {
  margin: 0 0 0.25rem;
  line-height: 1.4;
}

.notification-date {
  font-size: 0.8rem;
  color: var(--color-text-secondary, #6b7280);
}

.notification-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  flex-shrink: 0;
  margin-top: 0.4rem;
}

/* ── Settings toggles ── */

.settings-toggles {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;
  cursor: pointer;
}

.toggle-label {
  font-size: 0.95rem;
}

/* ── Password rules ── */

.password-rules {
  margin: 0.75rem 0 1rem;
  padding: 0.75rem;
  background: var(--color-bg-subtle, #f9fafb);
  border-radius: 0.375rem;
  font-size: 0.85rem;
}

.password-rules .rules-title {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.password-rules ul {
  margin: 0;
  padding-left: 1.25rem;
}

.password-rules li {
  line-height: 1.6;
  color: var(--color-text-secondary, #6b7280);
}

.password-rules li.rule-pass {
  color: var(--color-success, #059669);
}

/* ── Mobile responsive ── */

@media (max-width: 640px) {
  /* Tabs: allow horizontal scroll instead of overflowing the viewport */
  .tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    flex-wrap: nowrap;
    scrollbar-width: none; /* Firefox */
  }
  .tabs::-webkit-scrollbar { display: none; } /* Chrome/Safari */

  /* Each tab must not shrink so it retains its full padding */
  .tab {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Card header row (title + button) wraps on narrow screens */
  .card-header-row {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Modal actions row also needs to wrap */
  .modal-actions {
    flex-wrap: wrap;
  }
}
</style>
