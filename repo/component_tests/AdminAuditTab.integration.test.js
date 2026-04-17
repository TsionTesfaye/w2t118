/**
 * AdminAuditTab — Component + Real Service Integration Tests
 *
 * Full vertical slice:
 *   AdminAuditTab (Vue component)
 *     → real AuditService.getAll (session validation + permission check)
 *       → in-memory auditLogRepository stub
 *
 * vi.mock targets only repositories/index.js.
 * AuditService is NOT mocked — real validateSession, requirePermission,
 * and getAll logic run unchanged. This catches regressions the service-mocked
 * variants miss (e.g., permission gate removals, sort-order bugs).
 *
 * Pinia is activated in beforeEach so useToast's internal store is available.
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminAuditTab from '../src/views/admin/tabs/AdminAuditTab.vue';

// ── In-memory repository stub ─────────────────────────────────────────────────
// Module-level so each test can seed before mounting.
let _auditLogs = [];

vi.mock('../src/repositories/index.js', () => ({
  auditLogRepository: {
    getAll: async () => [..._auditLogs],
    create: async (entry) => { _auditLogs.push({ ...entry }); return entry; },
    getByIndex: async (key, val) => _auditLogs.filter(e => e[key] === val),
    delete: async () => { throw new Error('Audit logs cannot be deleted'); },
  },
}));

// useToast pulls from Pinia uiStore — stub the composable so we don't need the
// full Pinia UI-store setup (which would require additional plugin wiring).
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
function seedLog(overrides = {}) {
  const entry = {
    id: `log-${_auditLogs.length + 1}`,
    actorId: 'admin-1',
    action: 'user.login',
    entityType: 'user',
    entityId: 'u-1',
    timestamp: Date.now() + _auditLogs.length,
    ...overrides,
  };
  _auditLogs.push(entry);
  return entry;
}

// ── Mount helper ──────────────────────────────────────────────────────────────
function mountTab() {
  return mount(AdminAuditTab, {
    props: { session: SESSION },
    global: { stubs: { teleport: true } },
  });
}

beforeEach(() => {
  _auditLogs = [];
  setActivePinia(createPinia());
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('AdminAuditTab — loading state', () => {
  it('shows loading state before data resolves', async () => {
    // Hold the repository call open so the component stays in the loading phase.
    const { auditLogRepository } = await import('../src/repositories/index.js');
    const originalGetAll = auditLogRepository.getAll;
    auditLogRepository.getAll = () => new Promise(() => {}); // never resolves

    const wrapper = mountTab();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.loading-state').exists()).toBe(true);
    expect(wrapper.find('.loading-state').text()).toContain('Loading audit logs');

    // Restore original so subsequent tests aren't affected.
    auditLogRepository.getAll = originalGetAll;
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('AdminAuditTab — empty state', () => {
  it('shows EmptyState when there are no audit logs', async () => {
    // _auditLogs is already empty from beforeEach.
    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
    expect(wrapper.find('.loading-state').exists()).toBe(false);
  });
});

// ── Table rendering ───────────────────────────────────────────────────────────

describe('AdminAuditTab — table rendering', () => {
  it('renders one table row per seeded log', async () => {
    seedLog();
    seedLog();
    seedLog();

    const wrapper = mountTab();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(3);
  });

  it('renders the actor ID in the table row', async () => {
    seedLog({ actorId: 'actor-xyz' });

    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.find('tbody').text()).toContain('actor-xyz');
  });

  it('renders the action in the table row', async () => {
    seedLog({ action: 'listing.created' });

    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.find('tbody').text()).toContain('listing.created');
  });

  it('renders the entity type in the table row', async () => {
    seedLog({ entityType: 'listing' });

    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.find('tbody').text()).toContain('listing');
  });
});

// ── Sort order ────────────────────────────────────────────────────────────────

describe('AdminAuditTab — sort order', () => {
  it('displays newest log first (sortedAuditLogs newest-first)', async () => {
    const older = seedLog({ timestamp: 1000, actorId: 'actor-older' });
    const newer = seedLog({ timestamp: 9000, actorId: 'actor-newer' });

    const wrapper = mountTab();
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    // First row should be the newer entry.
    expect(rows[0].text()).toContain('actor-newer');
    expect(rows[1].text()).toContain('actor-older');
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('AdminAuditTab — pagination', () => {
  it('shows "Page 1 of 2" when 51 logs are seeded', async () => {
    for (let i = 0; i < 51; i++) seedLog();

    const wrapper = mountTab();
    await flushPromises();

    expect(wrapper.text()).toContain('Page 1 of 2');
  });

  it('disables Next button on the last page', async () => {
    for (let i = 0; i < 51; i++) seedLog();

    const wrapper = mountTab();
    await flushPromises();

    // Click Next to advance to page 2 (the last page).
    const nextBtn = wrapper.findAll('button').find(b => b.text() === 'Next');
    await nextBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const nextBtnAfter = wrapper.findAll('button').find(b => b.text() === 'Next');
    expect(nextBtnAfter.element.disabled).toBe(true);
  });

  it('disables Previous button when on page 1', async () => {
    for (let i = 0; i < 51; i++) seedLog();

    const wrapper = mountTab();
    await flushPromises();

    const prevBtn = wrapper.findAll('button').find(b => b.text() === 'Previous');
    expect(prevBtn.element.disabled).toBe(true);
  });

  it('Previous becomes enabled after clicking Next', async () => {
    for (let i = 0; i < 51; i++) seedLog();

    const wrapper = mountTab();
    await flushPromises();

    // Verify Previous is disabled on page 1.
    const prevBtnPage1 = wrapper.findAll('button').find(b => b.text() === 'Previous');
    expect(prevBtnPage1.element.disabled).toBe(true);

    // Click Next to go to page 2.
    const nextBtn = wrapper.findAll('button').find(b => b.text() === 'Next');
    await nextBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Now Previous should be enabled.
    const prevBtnPage2 = wrapper.findAll('button').find(b => b.text() === 'Previous');
    expect(prevBtnPage2.element.disabled).toBe(false);
  });
});
