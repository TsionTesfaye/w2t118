<template>
  <div>
    <div v-if="usersLoading" class="loading-state">Loading users...</div>
    <EmptyState
      v-else-if="users.length === 0"
      icon="&#128100;"
      title="No users"
      message="No user accounts found."
    />
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Display Name</th>
            <th>Roles</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.username }}</td>
            <td>{{ user.displayName || '-' }}</td>
            <td>
              <span v-for="role in user.roles" :key="role" class="badge" style="margin-right: 0.25rem;">
                {{ role }}
              </span>
            </td>
            <td>{{ formatDate(user.createdAt) }}</td>
            <td>
              <button class="btn btn-sm" @click="openRoleModal(user)">Manage Roles</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Role Management Modal -->
    <AppModal v-model="roleModalOpen" title="Manage Roles" max-width="420px">
      <div v-if="roleTarget">
        <p style="margin-bottom: 1rem;">
          Editing roles for <strong>{{ roleTarget.username }}</strong>
        </p>
        <div v-for="role in ALL_ROLES" :key="role" class="form-group" style="margin-bottom: 0.5rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input
              type="checkbox"
              :checked="roleSelections[role]"
              @change="roleSelections[role] = $event.target.checked"
            />
            {{ role }}
          </label>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="roleModalOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="roleSaving" @click="saveRoles">
          {{ roleSaving ? 'Saving...' : 'Save Roles' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { UserService } from '../../../services/UserService.js';
import { useToast } from '../../../composables/useToast.js';
import { ALL_ROLES } from '../../../domain/enums/roles.js';
import AppModal from '../../../components/AppModal.vue';
import EmptyState from '../../../components/EmptyState.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

const usersLoading = ref(false);
const users = ref([]);
const roleModalOpen = ref(false);
const roleTarget = ref(null);
const roleSelections = reactive({});
const roleSaving = ref(false);

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString();
}

async function loadUsers() {
  usersLoading.value = true;
  try {
    users.value = await UserService.getAllUsers(props.session);
  } catch (e) {
    toast.error(e.message || 'Failed to load users');
  } finally {
    usersLoading.value = false;
  }
}

function openRoleModal(user) {
  roleTarget.value = user;
  for (const role of ALL_ROLES) {
    roleSelections[role] = user.roles.includes(role);
  }
  roleModalOpen.value = true;
}

async function saveRoles() {
  if (!roleTarget.value) return;
  roleSaving.value = true;
  try {
    const currentRoles = new Set(roleTarget.value.roles);
    const desiredRoles = new Set(ALL_ROLES.filter(r => roleSelections[r]));

    // Roles to add
    for (const role of desiredRoles) {
      if (!currentRoles.has(role)) {
        await UserService.assignRole(props.session, roleTarget.value.id, role);
      }
    }
    // Roles to remove
    for (const role of currentRoles) {
      if (!desiredRoles.has(role)) {
        await UserService.removeRole(props.session, roleTarget.value.id, role);
      }
    }

    toast.success('Roles updated successfully');
    roleModalOpen.value = false;
    await loadUsers();
  } catch (e) {
    toast.error(e.message || 'Failed to update roles');
  } finally {
    roleSaving.value = false;
  }
}

onMounted(loadUsers);
</script>

<style scoped>
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #888);
}
</style>
