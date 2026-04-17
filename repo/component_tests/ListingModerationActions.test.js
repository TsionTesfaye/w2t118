/**
 * ListingModerationActions — Component Unit Tests
 *
 * Version history panel for listing owners. Tests cover:
 * hidden when not owner, empty-state, version list rendering,
 * rollback confirm modal open, and rollback emit after confirmation.
 *
 * ListingService is mocked. Pinia authStore is real but pre-seeded.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ListingModerationActions from '../src/views/marketplace/components/ListingModerationActions.vue';

vi.mock('../src/services/ListingService.js', () => ({
  ListingService: {
    rollback: vi.fn().mockResolvedValue({ id: 'listing-1', title: 'Rolled back' }),
  },
}));

vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

let pinia;

function makeSession(userId = 'user-1') {
  return { userId, roles: ['user'], token: 'tok', createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeVersion(overrides = {}) {
  return {
    id: `v-${Math.random()}`,
    createdAt: Date.now(),
    snapshot: { title: 'Version Title' },
    ...overrides,
  };
}

function mountComponent(versions = [], isOwner = true) {
  const auth = useAuthStore();
  auth.setSessionData(makeSession(), { id: 'user-1' });

  return mount(ListingModerationActions, {
    props: { listingId: 'listing-1', versions, isOwner },
    global: {
      plugins: [pinia],
      stubs: { teleport: true },
    },
  });
}

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.clearAllMocks();
});

// ── Visibility gate ───────────────────────────────────────────────────────────

describe('ListingModerationActions — visibility', () => {
  it('renders nothing when isOwner is false', () => {
    const wrapper = mountComponent([], false);
    expect(wrapper.find('.card').exists()).toBe(false);
  });

  it('renders the version history card when isOwner is true', () => {
    const wrapper = mountComponent([], true);
    expect(wrapper.find('.card').exists()).toBe(true);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('ListingModerationActions — empty state', () => {
  it('shows "No version history available" when versions is empty', () => {
    const wrapper = mountComponent([], true);
    expect(wrapper.text()).toContain('No version history available');
  });
});

// ── Version list ──────────────────────────────────────────────────────────────

describe('ListingModerationActions — version list', () => {
  it('renders one .version-item per version', () => {
    const wrapper = mountComponent([makeVersion(), makeVersion()], true);
    expect(wrapper.findAll('.version-item')).toHaveLength(2);
  });

  it('renders the snapshot title for each version', () => {
    const wrapper = mountComponent([makeVersion({ snapshot: { title: 'Draft v1' } })], true);
    expect(wrapper.text()).toContain('Draft v1');
  });

  it('renders a Rollback button for each version', () => {
    const wrapper = mountComponent([makeVersion(), makeVersion()], true);
    const rollbackBtns = wrapper.findAll('button').filter(b => b.text() === 'Rollback');
    expect(rollbackBtns).toHaveLength(2);
  });
});

// ── Rollback flow ─────────────────────────────────────────────────────────────

describe('ListingModerationActions — rollback flow', () => {
  it('opens confirm modal when Rollback is clicked', async () => {
    const wrapper = mountComponent([makeVersion()], true);
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Rollback Listing');
  });

  it('calls ListingService.rollback and emits rollback after confirmation', async () => {
    const { ListingService } = await import('../src/services/ListingService.js');
    const version = makeVersion();
    const wrapper = mountComponent([version], true);

    // Open confirm modal
    await wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    // The ConfirmModal confirm button has .btn-primary class (dangerMode not set)
    // The version list Rollback button has .btn-secondary — use class to distinguish
    const confirmBtn = wrapper.find('.btn-primary');
    await confirmBtn.trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(ListingService.rollback).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'listing-1',
      version.id,
    );
    expect(wrapper.emitted('rollback')).toBeTruthy();
  });
});
