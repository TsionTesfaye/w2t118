<template>
  <div>
    <div class="card" style="margin-bottom: 1.5rem;">
      <div class="card-header">
        <h3>{{ editingCategory ? 'Edit Category' : 'Add Category' }}</h3>
      </div>
      <form @submit.prevent="editingCategory ? submitUpdateCategory() : submitCreateCategory()" style="padding: 1rem;">
        <div class="form-group">
          <label>Name</label>
          <input v-model="categoryForm.name" class="form-input" required placeholder="Category name" />
        </div>
        <div class="form-group">
          <label>Parent</label>
          <select v-model="categoryForm.parentId" class="form-select">
            <option :value="null">None (root)</option>
            <option
              v-for="cat in allCategories"
              :key="cat.id"
              :value="cat.id"
              :disabled="editingCategory && cat.id === editingCategory.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Sort Order</label>
          <input v-model.number="categoryForm.sortOrder" type="number" class="form-input" min="0" />
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button type="submit" class="btn btn-primary" :disabled="categorySaving">
            {{ editingCategory ? 'Update' : 'Create' }}
          </button>
          <button v-if="editingCategory" type="button" class="btn btn-secondary" @click="cancelEditCategory">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <div v-if="categoriesLoading" class="loading-state">Loading categories...</div>
    <EmptyState
      v-else-if="categoryTree.length === 0"
      icon="&#128193;"
      title="No categories"
      message="Create your first category above."
    />
    <div v-else class="card">
      <div class="card-header"><h3>Category Tree</h3></div>
      <ul class="category-tree">
        <template v-for="node in categoryTree" :key="node.id">
          <li class="category-node">
            <div class="category-node-row">
              <span class="category-name">{{ node.name }}</span>
              <span class="badge" style="margin-left: 0.5rem;">#{{ node.sortOrder }}</span>
              <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(node)">Edit</button>
            </div>
            <ul v-if="node.children && node.children.length > 0" class="category-tree-children">
              <template v-for="child in node.children" :key="child.id">
                <li class="category-node" style="padding-left: 1.5rem;">
                  <div class="category-node-row">
                    <span class="category-name">{{ child.name }}</span>
                    <span class="badge" style="margin-left: 0.5rem;">#{{ child.sortOrder }}</span>
                    <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(child)">Edit</button>
                  </div>
                  <ul v-if="child.children && child.children.length > 0" class="category-tree-children">
                    <template v-for="grandchild in child.children" :key="grandchild.id">
                      <li class="category-node" style="padding-left: 3rem;">
                        <div class="category-node-row">
                          <span class="category-name">{{ grandchild.name }}</span>
                          <span class="badge" style="margin-left: 0.5rem;">#{{ grandchild.sortOrder }}</span>
                          <button class="btn btn-sm" style="margin-left: 0.5rem;" @click="startEditCategory(grandchild)">Edit</button>
                        </div>
                      </li>
                    </template>
                  </ul>
                </li>
              </template>
            </ul>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { AdminService } from '../../../services/AdminService.js';
import { useToast } from '../../../composables/useToast.js';
import EmptyState from '../../../components/EmptyState.vue';

const props = defineProps({
  session: { type: Object, required: true },
});

const toast = useToast();

const categoriesLoading = ref(false);
const categorySaving = ref(false);
const allCategories = ref([]);
const categoryTree = ref([]);
const editingCategory = ref(null);
const categoryForm = reactive({
  name: '',
  parentId: null,
  sortOrder: 0,
});

async function loadCategories() {
  categoriesLoading.value = true;
  try {
    const [flat, tree] = await Promise.all([
      AdminService.getAllCategories(props.session),
      AdminService.getCategoryTree(props.session),
    ]);
    allCategories.value = flat;
    categoryTree.value = tree;
  } catch (e) {
    toast.error(e.message || 'Failed to load categories');
  } finally {
    categoriesLoading.value = false;
  }
}

function resetCategoryForm() {
  categoryForm.name = '';
  categoryForm.parentId = null;
  categoryForm.sortOrder = 0;
  editingCategory.value = null;
}

async function submitCreateCategory() {
  categorySaving.value = true;
  try {
    await AdminService.createCategory(props.session, {
      name: categoryForm.name,
      parentId: categoryForm.parentId,
      sortOrder: categoryForm.sortOrder,
    });
    toast.success('Category created');
    resetCategoryForm();
    await loadCategories();
  } catch (e) {
    toast.error(e.message || 'Failed to create category');
  } finally {
    categorySaving.value = false;
  }
}

function startEditCategory(cat) {
  editingCategory.value = cat;
  categoryForm.name = cat.name;
  categoryForm.parentId = cat.parentId;
  categoryForm.sortOrder = cat.sortOrder;
}

function cancelEditCategory() {
  resetCategoryForm();
}

async function submitUpdateCategory() {
  if (!editingCategory.value) return;
  categorySaving.value = true;
  try {
    await AdminService.updateCategory(props.session, editingCategory.value.id, {
      name: categoryForm.name,
      parentId: categoryForm.parentId,
      sortOrder: categoryForm.sortOrder,
    });
    toast.success('Category updated');
    resetCategoryForm();
    await loadCategories();
  } catch (e) {
    toast.error(e.message || 'Failed to update category');
  } finally {
    categorySaving.value = false;
  }
}

onMounted(loadCategories);
</script>

<style scoped>
.loading-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #888);
}

.category-tree,
.category-tree-children {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-tree {
  padding: 0.75rem 1rem;
}

.category-node {
  padding: 0.35rem 0;
}

.category-node-row {
  display: flex;
  align-items: center;
}

.category-name {
  font-weight: 500;
}
</style>
