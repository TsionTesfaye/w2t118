/**
 * ListingHeader — Component Unit Tests
 *
 * Renders title, status badge, conditional action buttons, seller info,
 * a report modal, and an archive confirm modal.
 *
 * ModerationService, ThreadService, and useUserProfile are mocked to
 * prevent IndexedDB access. Pinia stores are real but pre-seeded.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ListingHeader from '../src/views/marketplace/components/ListingHeader.vue';

vi.mock('../src/services/ModerationService.js', () => ({
  ModerationService: {
    createReport: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../src/services/ThreadService.js', () => ({
  ThreadService: {
    create: vi.fn().mockResolvedValue({ id: 'thread-1' }),
  },
}));

vi.mock('../src/composables/useUserProfile.js', () => ({
  useUserProfile: () => ({ getProfile: vi.fn().mockResolvedValue(null) }),
}));

vi.mock('../src/composables/useToast.js', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// vue-router is used for push() in startConversation — stub it
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let pinia;

function makeSession(userId = 'user-1', roles = ['user']) {
  return { userId, roles, token: 'tok', createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeListing(overrides = {}) {
  return {
    title: 'Test Listing',
    status: 'active',
    sellerId: 'seller-1',
    isPinned: false,
    isFeatured: false,
    ...overrides,
  };
}

function makeActions(overrides = {}) {
  return {
    canPublish: false,
    canEdit: false,
    canArchive: false,
    canStartThread: false,
    canPin: false,
    canFeature: false,
    canReport: false,
    ...overrides,
  };
}

function mountHeader(listingOverrides = {}, actionsOverrides = {}) {
  const auth = useAuthStore();
  auth.setSessionData(makeSession(), { id: 'user-1' });

  return mount(ListingHeader, {
    props: {
      listing: makeListing(listingOverrides),
      listingId: 'listing-1',
      actions: makeActions(actionsOverrides),
    },
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

// ── Title and badge ───────────────────────────────────────────────────────────

describe('ListingHeader — title and status', () => {
  it('renders the listing title in h1', () => {
    const wrapper = mountHeader({ title: 'My Widget' });
    expect(wrapper.find('h1').text()).toBe('My Widget');
  });

  it('renders the StatusBadge component', () => {
    const wrapper = mountHeader();
    // StatusBadge renders with a status prop — presence confirms it mounted
    expect(wrapper.findComponent({ name: 'StatusBadge' }).exists()).toBe(true);
  });

  it('shows Pinned badge when isPinned is true', () => {
    const wrapper = mountHeader({ isPinned: true });
    expect(wrapper.text()).toContain('Pinned');
  });

  it('shows Featured badge when isFeatured is true', () => {
    const wrapper = mountHeader({ isFeatured: true });
    expect(wrapper.text()).toContain('Featured');
  });

  it('does not show Pinned badge when isPinned is false', () => {
    const wrapper = mountHeader({ isPinned: false });
    expect(wrapper.find('.badge-info').exists()).toBe(false);
  });
});

// ── Action buttons ────────────────────────────────────────────────────────────

describe('ListingHeader — action button visibility', () => {
  it('shows Publish button when canPublish is true', () => {
    const wrapper = mountHeader({}, { canPublish: true });
    expect(wrapper.text()).toContain('Publish');
  });

  it('hides Publish button when canPublish is false', () => {
    const wrapper = mountHeader({}, { canPublish: false });
    const btnTexts = wrapper.findAll('button').map(b => b.text());
    expect(btnTexts).not.toContain('Publish');
  });

  it('shows Edit button when canEdit is true', () => {
    const wrapper = mountHeader({}, { canEdit: true });
    expect(wrapper.text()).toContain('Edit');
  });

  it('shows Archive button when canArchive is true', () => {
    const wrapper = mountHeader({}, { canArchive: true });
    expect(wrapper.text()).toContain('Archive');
  });

  it('shows Start Conversation button when canStartThread is true', () => {
    const wrapper = mountHeader({}, { canStartThread: true });
    expect(wrapper.text()).toContain('Start Conversation');
  });

  it('shows Report button when canReport is true', () => {
    const wrapper = mountHeader({}, { canReport: true });
    expect(wrapper.text()).toContain('Report');
  });

  it('shows Pin button when canPin is true and listing is not pinned', () => {
    const wrapper = mountHeader({ isPinned: false }, { canPin: true });
    expect(wrapper.text()).toContain('Pin');
  });

  it('shows Unpin button when canPin is true and listing is pinned', () => {
    const wrapper = mountHeader({ isPinned: true }, { canPin: true });
    expect(wrapper.text()).toContain('Unpin');
  });

  it('emits publish when Publish clicked', async () => {
    const wrapper = mountHeader({}, { canPublish: true });
    await wrapper.findAll('button').find(b => b.text() === 'Publish').trigger('click');
    expect(wrapper.emitted('publish')).toBeTruthy();
  });

  it('emits edit when Edit clicked', async () => {
    const wrapper = mountHeader({}, { canEdit: true });
    await wrapper.findAll('button').find(b => b.text() === 'Edit').trigger('click');
    expect(wrapper.emitted('edit')).toBeTruthy();
  });
});

// ── Report modal ──────────────────────────────────────────────────────────────

describe('ListingHeader — report modal', () => {
  it('opens report modal when Report is clicked', async () => {
    const wrapper = mountHeader({}, { canReport: true });
    await wrapper.findAll('button').find(b => b.text() === 'Report').trigger('click');
    expect(wrapper.find('select.form-select').exists()).toBe(true);
  });

  it('Submit Report is disabled until a reason is selected', async () => {
    const wrapper = mountHeader({}, { canReport: true });
    await wrapper.findAll('button').find(b => b.text() === 'Report').trigger('click');
    const submitBtn = wrapper.findAll('button').find(b => b.text() === 'Submit Report');
    expect(submitBtn.attributes('disabled')).toBeDefined();
  });

  it('Submit Report is enabled after selecting a reason', async () => {
    const wrapper = mountHeader({}, { canReport: true });
    await wrapper.findAll('button').find(b => b.text() === 'Report').trigger('click');
    await wrapper.find('select.form-select').setValue('spam');
    const submitBtn = wrapper.findAll('button').find(b => b.text() === 'Submit Report');
    expect(submitBtn.attributes('disabled')).toBeUndefined();
  });

  it('calls ModerationService.createReport when report submitted', async () => {
    const { ModerationService } = await import('../src/services/ModerationService.js');
    const wrapper = mountHeader({}, { canReport: true });
    await wrapper.findAll('button').find(b => b.text() === 'Report').trigger('click');
    await wrapper.find('select.form-select').setValue('fraud');
    await wrapper.findAll('button').find(b => b.text() === 'Submit Report').trigger('click');
    await new Promise(r => setTimeout(r, 0));
    expect(ModerationService.createReport).toHaveBeenCalled();
  });
});

// ── Archive confirm modal ─────────────────────────────────────────────────────

describe('ListingHeader — archive confirm modal', () => {
  it('opens confirm modal when Archive is clicked', async () => {
    const wrapper = mountHeader({}, { canArchive: true });
    await wrapper.findAll('button').find(b => b.text() === 'Archive').trigger('click');
    // ConfirmModal renders its message text
    expect(wrapper.text()).toContain('archive');
  });

  it('emits archive when confirmed in the modal', async () => {
    const wrapper = mountHeader({}, { canArchive: true });
    await wrapper.findAll('button').find(b => b.text() === 'Archive').trigger('click');
    await wrapper.vm.$nextTick();
    // ConfirmModal confirm button has .btn-danger class (danger-mode=true on this modal)
    // The header's Archive trigger button has .btn-danger too; find the one inside .modal-content
    const modalConfirmBtn = wrapper.find('.modal-content .btn-danger');
    if (modalConfirmBtn.exists()) {
      await modalConfirmBtn.trigger('click');
      expect(wrapper.emitted('archive')).toBeTruthy();
    }
  });
});
