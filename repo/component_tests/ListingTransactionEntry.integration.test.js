/**
 * ListingTransactionEntry — Component + Real Service Integration Tests
 *
 * Full vertical slice:
 *   ListingTransactionEntry (Vue component)
 *     → real ThreadService.create (session validation + permission check)
 *       → in-memory repository stubs (threadRepository, listingRepository,
 *         auditLogRepository, notificationRepository, userRepository,
 *         messageRepository, blockRepository)
 *
 * Only the repository boundary is stubbed. ThreadService, AuditService, and
 * NotificationService all run their real logic. vue-router and useToast are
 * mocked because navigation and toast are side effects outside the unit under
 * test.
 *
 * Pinia is used for real so authStore.session is wired through the component
 * as it would be at runtime.
 */

import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ListingTransactionEntry from '../src/views/marketplace/components/ListingTransactionEntry.vue';

// ── In-memory repository state ─────────────────────────────────────────────────
// Declared at module level so each test can seed before mounting and inspect
// after the component's async handler completes.

let _threads = [];
let _listings = [];
let _auditLogs = [];
let _notifications = [];
let _users = [];

// ── Repository stubs ──────────────────────────────────────────────────────────

vi.mock('../src/repositories/index.js', () => ({
  threadRepository: {
    create: async (t) => { _threads.push({ ...t }); return t; },
    getByListingId: async (lid) => _threads.filter(t => t.listingId === lid),
    getByIdOrFail: async (id) => {
      const t = _threads.find(x => x.id === id);
      if (!t) throw new Error('Not found');
      return t;
    },
    getByBuyerId: async (uid) => _threads.filter(t => t.buyerId === uid),
    getBySellerId: async (uid) => _threads.filter(t => t.sellerId === uid),
    update: async (t) => t,
  },
  listingRepository: {
    getByIdOrFail: async (id) => {
      const l = _listings.find(x => x.id === id);
      if (!l) throw new Error('Listing not found');
      return l;
    },
  },
  auditLogRepository: {
    create: async (entry) => { _auditLogs.push({ ...entry }); return entry; },
    getAll: async () => [..._auditLogs],
    getByIndex: async (key, val) => _auditLogs.filter(e => e[key] === val),
  },
  notificationRepository: {
    getByUserId: async (uid) => _notifications.filter(n => n.userId === uid),
    getUnreadByUserId: async (uid) => _notifications.filter(n => n.userId === uid && !n.isRead),
    findUnread: async () => null,
    create: async (n) => { _notifications.push({ ...n }); return n; },
    update: async (n) => n,
    countUnreadByUserId: async (uid) => _notifications.filter(n => n.userId === uid && !n.isRead).length,
    getByIdOrFail: async (id) => {
      const n = _notifications.find(x => x.id === id);
      if (!n) throw new Error('Notification not found');
      return n;
    },
  },
  userRepository: {
    getById: async (id) => _users.find(u => u.id === id) || null,
  },
  messageRepository: {
    create: async (m) => m,
    getByThreadId: async () => [],
  },
}));

vi.mock('../src/repositories/BlockRepository.js', () => ({
  blockRepository: {
    isEitherBlocked: async () => false,
  },
}));

// ── Router mock ───────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ── Toast mock ────────────────────────────────────────────────────────────────

const mockToastError = vi.fn();

vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: mockToastError }),
}));

// ── Pinia + authStore setup ───────────────────────────────────────────────────

let pinia;

beforeEach(() => {
  // Reset in-memory stores.
  _threads = [];
  _listings = [];
  _auditLogs = [];
  _notifications = [];
  _users = [];

  mockPush.mockClear();
  mockToastError.mockClear();

  pinia = createPinia();
  setActivePinia(pinia);
});

// ── Seed helper ───────────────────────────────────────────────────────────────

function seedListing() {
  const listing = {
    id: 'listing-1',
    sellerId: 'seller-1',
    status: 'active',
    title: 'Test',
    deliveryOptions: { pickup: true, delivery: false },
  };
  _listings.push(listing);
  return listing;
}

// ── Mount helper ──────────────────────────────────────────────────────────────

function mountEntry(props = {}) {
  const auth = useAuthStore();
  auth.setSessionData(
    { userId: 'buyer-1', roles: ['user'], createdAt: Date.now(), lastActivityAt: Date.now() },
    { id: 'buyer-1' },
  );
  return mount(ListingTransactionEntry, {
    props: { listingId: 'listing-1', canStartThread: true, ...props },
    global: { plugins: [pinia] },
  });
}

// ── Rendering tests ───────────────────────────────────────────────────────────

describe('ListingTransactionEntry — rendering', () => {
  it('renders nothing when canStartThread is false', () => {
    seedListing();
    const wrapper = mountEntry({ canStartThread: false });
    expect(wrapper.find('.transaction-entry').exists()).toBe(false);
  });

  it('renders .transaction-entry card when canStartThread is true', () => {
    seedListing();
    const wrapper = mountEntry({ canStartThread: true });
    expect(wrapper.find('.transaction-entry').exists()).toBe(true);
  });

  it('renders "Interested in this listing?" heading', () => {
    seedListing();
    const wrapper = mountEntry();
    expect(wrapper.find('h3').text()).toBe('Interested in this listing?');
  });

  it('renders "Start Conversation" button', () => {
    seedListing();
    const wrapper = mountEntry();
    const btn = wrapper.find('button');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toBe('Start Conversation');
  });
});

// ── Click — happy path ────────────────────────────────────────────────────────

describe('ListingTransactionEntry — Start Conversation (happy path)', () => {
  it('clicking Start Conversation populates _threads via ThreadService.create', async () => {
    seedListing();
    const wrapper = mountEntry();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(_threads).toHaveLength(1);
    expect(_threads[0].listingId).toBe('listing-1');
    expect(_threads[0].buyerId).toBe('buyer-1');
    expect(_threads[0].sellerId).toBe('seller-1');
  });

  it('clicking Start Conversation calls router.push for navigation', async () => {
    seedListing();
    const wrapper = mountEntry();

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(mockPush).toHaveBeenCalledOnce();
    // Should navigate to the thread detail with the new thread's id.
    const callArg = mockPush.mock.calls[0][0];
    expect(callArg).toMatchObject({ params: { id: _threads[0].id } });
  });
});

// ── Click — error path ────────────────────────────────────────────────────────

describe('ListingTransactionEntry — Start Conversation (error path)', () => {
  it('shows toast.error when the listing does not exist', async () => {
    // _listings is empty — listing-1 was never seeded.
    const wrapper = mountEntry({ listingId: 'listing-1', canStartThread: true });

    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
    expect(_threads).toHaveLength(0);
  });
});
