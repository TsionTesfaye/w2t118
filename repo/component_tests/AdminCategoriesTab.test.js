/**
 * AdminCategoriesTab — Component Integration Tests
 *
 * Category management: create/edit form and category tree.
 * Tests cover: form elements, empty state, tree node rendering,
 * edit mode (form header changes), Create/Update button state,
 * and Cancel reverts to add mode.
 *
 * Real AdminService runs against in-memory repository stubs.
 * No service or composable mocks — only IndexedDB is replaced.
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminCategoriesTab from '../src/views/admin/tabs/AdminCategoriesTab.vue';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _categories = [];
let _auditLogs = [];

vi.mock('../src/repositories/index.js', () => ({
  categoryRepository: {
    getAll: async () => [..._categories],
    getById: async (id) => _categories.find(c => c.id === id) || null,
    getByIdOrFail: async (id) => {
      const c = _categories.find(c => c.id === id);
      if (!c) { const e = new Error(`Category ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return c;
    },
    create: async (cat) => { _categories.push({ ...cat }); return cat; },
    update: async (cat) => {
      const idx = _categories.findIndex(c => c.id === cat.id);
      if (idx >= 0) _categories[idx] = { ...cat };
      return cat;
    },
  },
  auditLogRepository: {
    create: async (log) => { _auditLogs.push({ ...log }); return log; },
    getAll: async () => [..._auditLogs],
  },
}));

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_CATEGORIES = [
  { id: 'cat-1', name: 'Electronics', parentId: null, sortOrder: 1, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-2', name: 'Clothing', parentId: null, sortOrder: 2, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 'cat-3', name: 'Shirts', parentId: 'cat-2', sortOrder: 1, createdAt: Date.now(), updatedAt: Date.now() },
];

const SESSION = { userId: 'admin-1', roles: ['admin'], createdAt: Date.now(), lastActivityAt: Date.now() };

let pinia;

function mountTab() {
  return mount(AdminCategoriesTab, {
    props: { session: SESSION },
    global: { plugins: [pinia] },
  });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  _categories = SEED_CATEGORIES.map(c => ({ ...c }));
  _auditLogs = [];
});

// ── Create form ───────────────────────────────────────────────────────────────

describe('AdminCategoriesTab — create form', () => {
  it('shows "Add Category" heading by default', () => {
    const wrapper = mountTab();
    expect(wrapper.text()).toContain('Add Category');
  });

  it('renders the category name input', () => {
    const wrapper = mountTab();
    expect(wrapper.find('input.form-input').exists()).toBe(true);
  });

  it('renders the Create button when not editing', () => {
    const wrapper = mountTab();
    expect(wrapper.find('button[type="submit"]').text()).toBe('Create');
  });

  it('renders the parent category select', () => {
    const wrapper = mountTab();
    expect(wrapper.find('select.form-select').exists()).toBe(true);
  });
});

// ── Category tree ─────────────────────────────────────────────────────────────

describe('AdminCategoriesTab — category tree', () => {
  it('shows loading state before data resolves', async () => {
    const { categoryRepository } = await import('../src/repositories/index.js');
    vi.spyOn(categoryRepository, 'getAll').mockImplementationOnce(() => new Promise(() => {}));
    const wrapper = mountTab();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Loading categories');
  });

  it('shows EmptyState when category tree is empty', async () => {
    _categories = [];
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
  });

  it('renders root category nodes', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const nodes = wrapper.findAll('.category-node');
    expect(nodes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders category names in the tree', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('Electronics');
    expect(wrapper.text()).toContain('Clothing');
  });

  it('renders child categories', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.text()).toContain('Shirts');
  });

  it('renders an Edit button per visible category node', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const editBtns = wrapper.findAll('button.btn-sm').filter(b => b.text() === 'Edit');
    // Electronics + Clothing + Shirts = at least 3
    expect(editBtns.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Edit mode ─────────────────────────────────────────────────────────────────

describe('AdminCategoriesTab — edit mode', () => {
  it('switches to "Edit Category" heading when an Edit button is clicked', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const editBtn = wrapper.findAll('button.btn-sm').find(b => b.text() === 'Edit');
    await editBtn.trigger('click');
    expect(wrapper.text()).toContain('Edit Category');
  });

  it('changes submit button text to "Update" in edit mode', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.findAll('button.btn-sm').find(b => b.text() === 'Edit').trigger('click');
    expect(wrapper.find('button[type="submit"]').text()).toBe('Update');
  });

  it('shows Cancel button in edit mode', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.findAll('button.btn-sm').find(b => b.text() === 'Edit').trigger('click');
    const cancelBtn = wrapper.findAll('button').find(b => b.text() === 'Cancel');
    expect(cancelBtn).toBeDefined();
  });

  it('reverts to "Add Category" mode after Cancel clicked', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.findAll('button.btn-sm').find(b => b.text() === 'Edit').trigger('click');
    const cancelBtn = wrapper.findAll('button').find(b => b.text() === 'Cancel');
    await cancelBtn.trigger('click');
    expect(wrapper.text()).toContain('Add Category');
  });

  it('populates the name input with the category being edited', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.findAll('button.btn-sm').find(b => b.text() === 'Edit').trigger('click');
    const nameInput = wrapper.find('input.form-input');
    // First node is Electronics (sortOrder=1)
    expect(nameInput.element.value).toBe('Electronics');
  });
});
