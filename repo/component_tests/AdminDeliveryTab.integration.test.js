/**
 * AdminDeliveryTab — Component + Real Service Integration Tests
 *
 * Full vertical slice:
 *   AdminDeliveryTab (Vue component)
 *     → real DeliveryService.getAllCoverage / addCoveragePrefix / removeCoveragePrefix
 *         (session validation, permission checks, duplicate detection)
 *       → in-memory coverageZipRepository + auditLogRepository stubs
 *
 * vi.mock targets only repositories/index.js.
 * DeliveryService and AuditService are NOT mocked — all real service logic
 * runs: validateSession, requirePermission, prefix format validation,
 * duplicate-prefix detection, and AuditService.log side-effects.
 *
 * Pinia is activated in beforeEach so useToast can resolve its store.
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

// Import before vi.mock so the hoisted factory can reference module-level vars.
import AdminDeliveryTab from '../src/views/admin/tabs/AdminDeliveryTab.vue';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _coverage = [];
let _auditLogs = [];

vi.mock('../src/repositories/index.js', () => ({
  coverageZipRepository: {
    getAll: async () => [..._coverage],
    getByPrefix: async (prefix) => _coverage.find(e => e.prefix === prefix) || null,
    getOneByIndex: async (key, val) => _coverage.find(e => e[key] === val) || null,
    create: async (entry) => { _coverage.push({ ...entry }); return entry; },
    delete: async (id) => { _coverage = _coverage.filter(e => e.id !== id); },
  },
  auditLogRepository: {
    create: async (entry) => { _auditLogs.push({ ...entry }); return entry; },
  },
}));

// useToast depends on Pinia uiStore — stub the composable to keep tests focused
// on service/component behaviour rather than toast infrastructure.
vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

// ── Session ───────────────────────────────────────────────────────────────────
const SESSION = {
  userId: 'admin-1',
  roles: ['admin'],
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
};

// ── Seed helper ───────────────────────────────────────────────────────────────
let _nextId = 1;

function seedCoverage(prefix, overrides = {}) {
  const entry = {
    id: `cov-${_nextId++}`,
    prefix,
    createdAt: Date.now(),
    ...overrides,
  };
  _coverage.push(entry);
  return entry;
}

// ── Mount helper ──────────────────────────────────────────────────────────────
function mountTab() {
  return mount(AdminDeliveryTab, {
    props: { session: SESSION },
    global: { stubs: { teleport: true } },
  });
}

beforeEach(() => {
  _coverage = [];
  _auditLogs = [];
  _nextId = 1;
  setActivePinia(createPinia());
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('AdminDeliveryTab — loading state', () => {
  it('shows loading state before data resolves', async () => {
    const { coverageZipRepository } = await import('../src/repositories/index.js');
    const originalGetAll = coverageZipRepository.getAll;
    coverageZipRepository.getAll = () => new Promise(() => {}); // never resolves

    const wrapper = mountTab();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.loading-state').exists()).toBe(true);
    expect(wrapper.find('.loading-state').text()).toContain('Loading coverage data');

    coverageZipRepository.getAll = originalGetAll;
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('AdminDeliveryTab — empty state', () => {
  it('shows EmptyState when no coverage prefixes exist', async () => {
    // _coverage is empty from beforeEach.
    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
    expect(wrapper.find('.loading-state').exists()).toBe(false);
  });
});

// ── Table rendering ───────────────────────────────────────────────────────────

describe('AdminDeliveryTab — table rendering', () => {
  it('renders one table row per seeded coverage prefix', async () => {
    seedCoverage('100');
    seedCoverage('200');

    const wrapper = mountTab();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
  });

  it('renders the prefix code inside a <code> element', async () => {
    seedCoverage('350');

    const wrapper = mountTab();
    await flushPromises();

    const code = wrapper.find('tbody code');
    expect(code.exists()).toBe(true);
    expect(code.text()).toBe('350');
  });
});

// ── Add prefix ────────────────────────────────────────────────────────────────

describe('AdminDeliveryTab — add prefix form', () => {
  it('adds a new row to the table when a valid 3-digit prefix is submitted', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // Type a valid prefix into the form input.
    const input = wrapper.find('input.form-input');
    await input.setValue('100');

    // Submit the form.
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(1);
    expect(wrapper.find('tbody code').text()).toBe('100');
  });

  it('shows a client-side validation error when an invalid prefix is submitted', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // "abc" does not match /^\d{3}$/
    const input = wrapper.find('input.form-input');
    await input.setValue('abc');

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    // The component sets prefixError which renders the .alert-error paragraph.
    expect(wrapper.find('p.alert-error').exists()).toBe(true);
    expect(wrapper.find('p.alert-error').text()).toContain('3 digits');

    // No row should have been added.
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
  });
});

// ── Remove prefix ─────────────────────────────────────────────────────────────

describe('AdminDeliveryTab — remove prefix', () => {
  it('removes the row from the table when Remove is clicked', async () => {
    seedCoverage('400');

    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.findAll('tbody tr')).toHaveLength(1);

    const removeBtn = wrapper.find('button.btn-danger');
    await removeBtn.trigger('click');
    await flushPromises();

    // After removal the table is gone; EmptyState is shown.
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
    expect(wrapper.findAll('tbody tr')).toHaveLength(0);
  });
});

// ── Duplicate prefix ──────────────────────────────────────────────────────────

describe('AdminDeliveryTab — duplicate prefix', () => {
  it('does not add a second row when the same prefix is submitted twice', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // Add "200" the first time — should succeed.
    const input = wrapper.find('input.form-input');
    await input.setValue('200');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.findAll('tbody tr')).toHaveLength(1);

    // Attempt to add "200" again — service throws ValidationError which the
    // component catches and forwards to toast.error. The table stays at 1 row.
    await input.setValue('200');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    // Verify the in-memory store was not mutated beyond the first entry.
    expect(_coverage.filter(e => e.prefix === '200')).toHaveLength(1);
  });
});
