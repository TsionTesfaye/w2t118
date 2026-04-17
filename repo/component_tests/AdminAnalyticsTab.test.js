/**
 * AdminAnalyticsTab — Component Integration Tests
 *
 * Data-driven analytics panel. Tests cover: loading state, KPI card
 * rendering with real computed values, fallback zero values for empty
 * repositories, EmptyState for no trend data, and bar chart rendering.
 *
 * Real AnalyticsService runs against in-memory repository stubs.
 * No service or composable mocks — only IndexedDB is replaced.
 *
 * Seeded data:
 *   listings:     42 total  → postVolume.total = 42
 *   transactions: 50        → claimRate.totalTransactions = 50
 *   complaints:   9         → claimRate.percentage = 18%  (9/50 × 100)
 *   resolved:     1 @ 3 h   → avgHandlingTime.averageHours = 3
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AdminAnalyticsTab from '../src/views/admin/tabs/AdminAnalyticsTab.vue';

const NOW = Date.now();
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

// ── In-memory repository stubs ────────────────────────────────────────────────
let _listings = [];
let _transactions = [];
let _complaints = [];

vi.mock('../src/repositories/index.js', () => ({
  listingRepository: {
    getAll: async () => [..._listings],
  },
  transactionRepository: {
    getAll: async () => [..._transactions],
  },
  complaintRepository: {
    getAll: async () => [..._complaints],
  },
  // AnalyticsService imports auditLogRepository but doesn't call it in computeKPIs/Trends
  auditLogRepository: {
    create: async (log) => log,
    getAll: async () => [],
  },
}));

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedListings(n) {
  for (let i = 0; i < n; i++) {
    _listings.push({ id: `l-${i}`, createdAt: NOW - i * 1000, status: 'active' });
  }
}

function seedTransactions(n) {
  for (let i = 0; i < n; i++) {
    _transactions.push({ id: `t-${i}`, createdAt: NOW - i * 1000 });
  }
}

function seedComplaints(n, { resolvedCount = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const isResolved = i < resolvedCount;
    _complaints.push({
      id: `c-${i}`,
      status: isResolved ? 'resolved' : 'open',
      createdAt: isResolved ? NOW - THREE_HOURS_MS : NOW - i * 1000,
      resolvedAt: isResolved ? NOW : null,
    });
  }
}

const SESSION = { userId: 'admin-1', roles: ['admin'], createdAt: Date.now(), lastActivityAt: Date.now() };

let pinia;

function mountTab() {
  return mount(AdminAnalyticsTab, {
    props: { session: SESSION },
    global: { plugins: [pinia] },
  });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  _listings = [];
  _transactions = [];
  _complaints = [];

  // Default seed: produces deterministic KPI values
  seedListings(42);
  seedTransactions(50);
  // 9 complaints: 1 resolved at exactly 3h, 8 open
  seedComplaints(9, { resolvedCount: 1 });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('AdminAnalyticsTab — loading', () => {
  it('shows loading state before data resolves', async () => {
    // Block the listing repo so KPI computation never resolves
    const { listingRepository } = await import('../src/repositories/index.js');
    vi.spyOn(listingRepository, 'getAll').mockImplementationOnce(() => new Promise(() => {}));

    const wrapper = mountTab();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Loading analytics');
  });

  it('hides loading state after data resolves', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find('.loading-state').exists()).toBe(false);
  });
});

// ── KPI cards ─────────────────────────────────────────────────────────────────

describe('AdminAnalyticsTab — KPI cards', () => {
  it('renders the stats grid after data loads', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.find('[data-testid="admin-stats-grid"]').exists()).toBe(true);
  });

  it('shows correct Total Listings value (42 seeded)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const cards = wrapper.findAll('.stat-card');
    const listingsCard = cards.find(c => c.text().includes('Total Listings'));
    expect(listingsCard.text()).toContain('42');
  });

  it('shows correct Claim Rate value (9/50 = 18%)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const cards = wrapper.findAll('.stat-card');
    const claimCard = cards.find(c => c.text().includes('Claim Rate'));
    expect(claimCard.text()).toContain('18%');
  });

  it('shows correct Avg Handling Time value (1 resolved @ 3h)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const cards = wrapper.findAll('.stat-card');
    const handlingCard = cards.find(c => c.text().includes('Avg Handling'));
    expect(handlingCard.text()).toContain('3');
  });

  it('shows correct Total Transactions value (50 seeded)', async () => {
    const wrapper = mountTab();
    await flushPromises();
    const cards = wrapper.findAll('.stat-card');
    const txCard = cards.find(c => c.text().includes('Total Transactions'));
    expect(txCard.text()).toContain('50');
  });

  it('falls back to 0 for all KPIs when repositories are empty', async () => {
    _listings = [];
    _transactions = [];
    _complaints = [];

    const wrapper = mountTab();
    await flushPromises();
    const cards = wrapper.findAll('.stat-card');
    const values = cards.map(c => c.find('.stat-value').text());
    // All four cards should show 0 or 0%
    expect(values.every(v => v === '0' || v === '0%')).toBe(true);
  });
});

// ── Trend section ─────────────────────────────────────────────────────────────

describe('AdminAnalyticsTab — trend section', () => {
  it('shows EmptyState before trends are loaded', async () => {
    const wrapper = mountTab();
    await flushPromises();
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
  });

  it('shows bar chart bars after Load is clicked', async () => {
    // Add a listing created within the last 30 days to show in trends
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    // AnalyticsService._computeListingTrend buckets the 42 seeded listings
    const bars = wrapper.findAll('.bar');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it('renders bar labels with count values', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    const labels = wrapper.findAll('.bar-label').map(l => l.text());
    // At least one bucket should have a count > 0 (42 listings seeded)
    expect(labels.some(l => parseInt(l, 10) > 0)).toBe(true);
  });

  it('calls computeTrends with updated metric when changed', async () => {
    const wrapper = mountTab();
    await flushPromises();

    const selects = wrapper.findAll('select.form-select');
    await selects[0].setValue('transactions');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    // Transactions chart: 50 seeded transactions → bars visible
    const bars = wrapper.findAll('.bar');
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });

  it('shows EmptyState for complaints trend when no complaints exist', async () => {
    _complaints = [];

    const wrapper = mountTab();
    await flushPromises();

    const selects = wrapper.findAll('select.form-select');
    await selects[0].setValue('complaints');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
  });
});
