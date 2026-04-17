/**
 * AdminDataTab — Component Unit Tests
 *
 * Focus: pure UI state before any service calls fire (form state, button
 * disabled rules, conditional rendering). The only service method exercised
 * for real is ExportImportService.getAvailableStores() which is synchronous
 * and reads from a constant — no IndexedDB is touched.
 *
 * All async service methods are mocked. useToast and ConfirmModal (via
 * teleport stub) are also mocked so mounting stays self-contained.
 */

import { mount, flushPromises } from '@vue/test-utils';
import AdminDataTab from '../src/views/admin/tabs/AdminDataTab.vue';

// ── Service mocks ─────────────────────────────────────────────────────────────

vi.mock('../src/services/ExportImportService.js', () => ({
  ExportImportService: {
    getAvailableStores: () => ['users', 'listings', 'threads', 'transactions', 'notifications'],
    exportRedactedSnapshot: vi.fn().mockResolvedValue({ _meta: { mode: 'redacted' } }),
    exportRestorableSnapshot: vi.fn().mockResolvedValue({ _meta: { mode: 'restorable' } }),
    exportFiltered: vi.fn().mockResolvedValue({ listings: [] }),
    exportCSV: vi.fn(),
    toCSV: vi.fn().mockReturnValue('csv,data'),
    exportReports: vi.fn().mockResolvedValue({ _meta: { totalRecords: 0 }, reports: [] }),
    exportReportsCSV: vi.fn().mockResolvedValue('csv'),
    exportAnalytics: vi.fn().mockResolvedValue({ kpis: {} }),
    importSnapshot: vi.fn().mockResolvedValue({ importedStores: [], usersRestored: false }),
  },
}));

vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION = {
  userId: 'admin-1',
  roles: ['admin'],
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
};

function mountTab() {
  return mount(AdminDataTab, {
    props: { session: SESSION },
    global: { stubs: { teleport: true } },
  });
}

// ── Redacted Snapshot section ─────────────────────────────────────────────────

describe('AdminDataTab — Redacted Snapshot section', () => {
  it('renders "Redacted Snapshot" heading', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const headings = wrapper.findAll('h3');
    const found = headings.some(h => h.text().includes('Redacted Snapshot'));
    expect(found).toBe(true);
  });

  it('Export Redacted Snapshot button is enabled by default', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Redacted Snapshot'));
    expect(btn).toBeDefined();
    expect(btn.element.disabled).toBe(false);
  });
});

// ── Restorable Snapshot section ───────────────────────────────────────────────

describe('AdminDataTab — Restorable Snapshot section', () => {
  it('renders "Restorable Snapshot" heading', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const headings = wrapper.findAll('h3');
    const found = headings.some(h => h.text().includes('Restorable Snapshot'));
    expect(found).toBe(true);
  });

  it('renders a password input for the passphrase', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
  });

  it('Export Restorable button is disabled when passphrase is empty', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Restorable Snapshot'));
    expect(btn).toBeDefined();
    expect(btn.element.disabled).toBe(true);
  });

  it('Export Restorable button is disabled when passphrase has fewer than 8 characters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('input[type="password"]').setValue('1234567');
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Restorable Snapshot'));
    expect(btn.element.disabled).toBe(true);
  });

  it('Export Restorable button is enabled when passphrase has exactly 8 characters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('input[type="password"]').setValue('12345678');
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Restorable Snapshot'));
    expect(btn.element.disabled).toBe(false);
  });

  it('Export Restorable button is enabled when passphrase has more than 8 characters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('input[type="password"]').setValue('a-very-long-passphrase');
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Restorable Snapshot'));
    expect(btn.element.disabled).toBe(false);
  });
});

// ── Filtered Store Export section ─────────────────────────────────────────────

describe('AdminDataTab — Filtered Store Export section', () => {
  it('renders a checkbox for the "users" store', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find('input[type="checkbox"][value="users"]').exists()).toBe(true);
  });

  it('renders a checkbox for the "listings" store', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find('input[type="checkbox"][value="listings"]').exists()).toBe(true);
  });

  it('Export Filtered JSON button is disabled when no stores are selected', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export Filtered JSON'));
    expect(btn).toBeDefined();
    expect(btn.element.disabled).toBe(true);
  });

  it('Export as CSV button is disabled when no stores are selected', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export as CSV'));
    expect(btn).toBeDefined();
    expect(btn.element.disabled).toBe(true);
  });

  it('Export as CSV button is disabled when 2 stores are selected (requires exactly 1)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('input[type="checkbox"][value="users"]').setChecked(true);
    await wrapper.find('input[type="checkbox"][value="listings"]').setChecked(true);
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export as CSV'));
    expect(btn.element.disabled).toBe(true);
  });

  it('Export as CSV button is enabled when exactly 1 store is selected', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('input[type="checkbox"][value="listings"]').setChecked(true);
    const btn = wrapper.findAll('button').find(b => b.text().includes('Export as CSV'));
    expect(btn.element.disabled).toBe(false);
  });

  it('users hint appears when the "users" store is checked', async () => {
    const wrapper = mountTab();
    await flushPromises();

    // Hint should not be visible before checking the users box.
    const hintsBefore = wrapper.findAll('p.hint');
    const usersHintBefore = hintsBefore.find(p => p.text().includes('user credential fields'));
    expect(usersHintBefore).toBeUndefined();

    await wrapper.find('input[type="checkbox"][value="users"]').setChecked(true);

    const hintsAfter = wrapper.findAll('p.hint');
    const usersHintAfter = hintsAfter.find(p => p.text().includes('user credential fields'));
    expect(usersHintAfter).toBeDefined();
  });
});

// ── Report Export section ─────────────────────────────────────────────────────

describe('AdminDataTab — Report Export section', () => {
  it('renders "Export Reports" heading', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const headings = wrapper.findAll('h3');
    const found = headings.some(h => h.text().includes('Export Reports'));
    expect(found).toBe(true);
  });

  it('renders the Status select in the report filters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const selects = wrapper.findAll('select');
    // The Status select has an "All" option and status-specific options.
    const statusSelect = selects.find(s =>
      s.findAll('option').some(o => o.text() === 'Open') &&
      s.findAll('option').some(o => o.text() === 'Resolved')
    );
    expect(statusSelect).toBeDefined();
  });

  it('renders the Target Type select in the report filters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const selects = wrapper.findAll('select');
    const targetTypeSelect = selects.find(s =>
      s.findAll('option').some(o => o.text() === 'Listing') &&
      s.findAll('option').some(o => o.text() === 'User')
    );
    expect(targetTypeSelect).toBeDefined();
  });

  it('renders the Reason text input in the report filters', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const inputs = wrapper.findAll('input[type="text"]');
    const reasonInput = inputs.find(i => i.attributes('placeholder')?.includes('spam'));
    expect(reasonInput).toBeDefined();
  });
});

// ── Import section ────────────────────────────────────────────────────────────

describe('AdminDataTab — Import section', () => {
  it('Import Snapshot button is disabled when no file is selected (importData is null)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Import Snapshot'));
    expect(btn).toBeDefined();
    expect(btn.element.disabled).toBe(true);
  });

  it('Import Snapshot button text is "Import Snapshot" in normal (non-loading) state', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const btn = wrapper.findAll('button').find(b => b.text().includes('Import Snapshot'));
    expect(btn.text()).toBe('Import Snapshot');
  });
});
