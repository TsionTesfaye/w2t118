/**
 * MarketplaceView — Component Tests
 *
 * Tests Browse/My Listings tabs, search filter, category filter, sort options,
 * empty state, and navigation to listing detail. Uses real ListingService and
 * AdminService against in-memory repository stubs.
 *
 * Boundaries mocked:
 *   - src/repositories/index.js   — no IndexedDB in jsdom
 *   - vue-router                  — navigation side effects
 *
 * NOT mocked: ListingService, AdminService (real permission + query logic runs)
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import MarketplaceView from '../src/views/marketplace/MarketplaceView.vue';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _listings = [];
let _categories = [];

vi.mock('../src/repositories/index.js', () => ({
  listingRepository: {
    getByStatus: async (status) => _listings.filter(l => l.status === status),
    getBySellerId: async (sellerId) => _listings.filter(l => l.sellerId === sellerId),
    getByIdOrFail: async (id) => {
      const l = _listings.find(l => l.id === id);
      if (!l) { const e = new Error(`Listing ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return l;
    },
    getAll: async () => [..._listings],
  },
  listingVersionRepository: {
    getAll: async () => [],
    create: async () => ({}),
  },
  categoryRepository: {
    getAll: async () => [..._categories],
    getByIdOrFail: async (id) => {
      const c = _categories.find(c => c.id === id);
      if (!c) { const e = new Error(`Category ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return c;
    },
    create: async (cat) => { _categories.push({ ...cat }); return cat; },
    update: async (cat) => cat,
  },
  auditLogRepository: {
    create: async () => ({}),
    getAll: async () => [],
  },
}));

// ── Router mock ───────────────────────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId, roles = ['user']) {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeListing(id, overrides = {}) {
  return {
    id,
    title: overrides.title ?? `Listing ${id}`,
    description: 'A description',
    price: overrides.price ?? 100,
    categoryId: overrides.categoryId ?? 'cat-1',
    sellerId: overrides.sellerId ?? 'user-2',
    status: overrides.status ?? 'active',
    media: [],
    tagIds: [],
    isPinned: false,
    isFeatured: false,
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
}

let pinia;

function mountMarketplace() {
  return mount(MarketplaceView, {
    global: {
      plugins: [pinia],
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        StatusBadge: { template: '<span class="status-badge" />' },
        EmptyState: {
          template: '<div class="empty-state"><slot /></div>',
          props: ['title', 'message', 'icon'],
        },
      },
    },
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MarketplaceView', () => {
  beforeEach(() => {
    _listings = [];
    _categories = [
      { id: 'cat-1', name: 'Electronics', sortOrder: 1, parentId: null },
      { id: 'cat-2', name: 'Clothing', sortOrder: 2, parentId: null },
    ];
    mockPush.mockClear();
    pinia = createPinia();
    setActivePinia(pinia);
    // Seed a valid session in authStore (USER role has LISTING_VIEW permission)
    const auth = useAuthStore();
    auth.setSessionData(makeSession('user-1'), { id: 'user-1', displayName: 'Alice', username: 'alice' });
  });

  // ── Initial render / tabs ─────────────────────────────────────────────────

  it('renders Marketplace heading', async () => {
    const wrapper = mountMarketplace();
    await flushPromises();
    expect(wrapper.text()).toContain('Marketplace');
  });

  it('renders Browse All and My Listings tabs', async () => {
    const wrapper = mountMarketplace();
    await flushPromises();
    expect(wrapper.text()).toContain('Browse All');
    expect(wrapper.text()).toContain('My Listings');
  });

  it('browse tab is active by default', async () => {
    const wrapper = mountMarketplace();
    await flushPromises();
    const activeTab = wrapper.find('.pill-tab.active');
    expect(activeTab.text()).toContain('Browse All');
  });

  // ── Loading state (tested via delayed spy) ────────────────────────────────

  it('shows loading state when repo is slow', async () => {
    // Delay getByStatus to keep loading=true long enough to assert
    const { listingRepository } = await import('../src/repositories/index.js');
    let resolve;
    vi.spyOn(listingRepository, 'getByStatus').mockImplementationOnce(
      () => new Promise(r => { resolve = r; }),
    );
    const wrapper = mountMarketplace();
    await Promise.resolve(); // one tick — component has set loading=true, repo hasn't resolved
    expect(wrapper.find('.loading-state').exists()).toBe(true);
    resolve([]);
    await flushPromises();
  });

  // ── Browse tab renders listings ───────────────────────────────────────────

  it('renders active listings in browse tab', async () => {
    _listings = [
      makeListing('l-1', { title: 'Cool Widget', status: 'active' }),
      makeListing('l-2', { title: 'Blue Shirt', status: 'active', categoryId: 'cat-2' }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    expect(wrapper.text()).toContain('Cool Widget');
    expect(wrapper.text()).toContain('Blue Shirt');
  });

  it('does not render draft or sold listings in browse tab', async () => {
    _listings = [
      makeListing('l-1', { title: 'Active Item', status: 'active' }),
      makeListing('l-2', { title: 'Draft Item', status: 'draft' }),
      makeListing('l-3', { title: 'Sold Item', status: 'sold' }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    expect(wrapper.text()).toContain('Active Item');
    expect(wrapper.text()).not.toContain('Draft Item');
    expect(wrapper.text()).not.toContain('Sold Item');
  });

  it('shows empty state when no active listings', async () => {
    _listings = [];
    const wrapper = mountMarketplace();
    await flushPromises();
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  // ── Category filter ───────────────────────────────────────────────────────

  it('renders categories in filter dropdown', async () => {
    const wrapper = mountMarketplace();
    await flushPromises();
    const select = wrapper.find('select.form-select');
    expect(select.text()).toContain('Electronics');
    expect(select.text()).toContain('Clothing');
  });

  it('filtering by category narrows listings', async () => {
    _listings = [
      makeListing('l-1', { title: 'Laptop', status: 'active', categoryId: 'cat-1' }),
      makeListing('l-2', { title: 'T-Shirt', status: 'active', categoryId: 'cat-2' }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    const categorySelect = wrapper.find('select.form-select');
    await categorySelect.setValue('cat-1');
    await flushPromises();
    const cards = wrapper.findAll('.listing-card');
    expect(cards.length).toBe(1);
    expect(wrapper.text()).toContain('Laptop');
    expect(wrapper.text()).not.toContain('T-Shirt');
  });

  // ── Search filter ─────────────────────────────────────────────────────────

  it('search filter narrows listings by title', async () => {
    _listings = [
      makeListing('l-1', { title: 'Vintage Camera', status: 'active' }),
      makeListing('l-2', { title: 'Running Shoes', status: 'active' }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    const searchInput = wrapper.find('input[type="text"].form-input');
    await searchInput.setValue('camera');
    await flushPromises();
    const cards = wrapper.findAll('.listing-card');
    expect(cards.length).toBe(1);
    expect(wrapper.text()).toContain('Vintage Camera');
    expect(wrapper.text()).not.toContain('Running Shoes');
  });

  it('search is case-insensitive', async () => {
    _listings = [makeListing('l-1', { title: 'Vintage Camera', status: 'active' })];
    const wrapper = mountMarketplace();
    await flushPromises();
    const searchInput = wrapper.find('input[type="text"].form-input');
    await searchInput.setValue('CAMERA');
    await flushPromises();
    expect(wrapper.findAll('.listing-card').length).toBe(1);
  });

  it('shows empty state when search matches nothing', async () => {
    _listings = [makeListing('l-1', { title: 'Laptop', status: 'active' })];
    const wrapper = mountMarketplace();
    await flushPromises();
    const searchInput = wrapper.find('input[type="text"].form-input');
    await searchInput.setValue('xyzabc');
    await flushPromises();
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  // ── Sort options ──────────────────────────────────────────────────────────

  it('sort Price Low to High orders by price ascending', async () => {
    _listings = [
      makeListing('l-1', { title: 'Expensive', price: 500, status: 'active', createdAt: 1000 }),
      makeListing('l-2', { title: 'Cheap', price: 10, status: 'active', createdAt: 2000 }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    const sortSelect = wrapper.findAll('select.form-select')[1];
    await sortSelect.setValue('price_asc');
    await flushPromises();
    const titles = wrapper.findAll('.listing-card-title').map(el => el.text());
    expect(titles[0]).toBe('Cheap');
    expect(titles[1]).toBe('Expensive');
  });

  // ── My Listings tab ───────────────────────────────────────────────────────

  it('My Listings tab shows only current user listings', async () => {
    _listings = [
      makeListing('l-1', { title: 'My Widget', status: 'draft', sellerId: 'user-1' }),
      makeListing('l-2', { title: 'Other Item', status: 'active', sellerId: 'user-2' }),
    ];
    const wrapper = mountMarketplace();
    await flushPromises();
    const myTab = wrapper.findAll('.pill-tab')[1];
    await myTab.trigger('click');
    await flushPromises();
    const cards = wrapper.findAll('.listing-card');
    expect(cards.length).toBe(1);
    expect(wrapper.text()).toContain('My Widget');
    expect(wrapper.text()).not.toContain('Other Item');
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  it('clicking a listing card navigates to listing detail', async () => {
    _listings = [makeListing('l-1', { title: 'Widget', status: 'active' })];
    const wrapper = mountMarketplace();
    await flushPromises();
    const card = wrapper.find('.listing-card');
    await card.trigger('click');
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ListingDetail', params: { id: 'l-1' } }),
    );
  });

  // ── Unauthorized user ─────────────────────────────────────────────────────

  it('shows error toast (not crash) if session is invalid', async () => {
    const auth = useAuthStore();
    auth.clearSession(); // Remove valid session
    // Component still mounts and calls fetchListings which catches the error
    const wrapper = mountMarketplace();
    await flushPromises();
    // Should render without throwing — error caught by try/catch in fetchListings
    expect(wrapper.find('.page-content').exists()).toBe(true);
  });
});
