/**
 * ListingComments — Component Unit Tests
 *
 * Renders a list of comments plus a submission form. Tests cover:
 * empty-state, comment rendering, owner/moderator action buttons,
 * Post Comment button gating, edit-modal open, and refresh emit.
 *
 * CommentService is mocked (no IndexedDB). Pinia stores are real
 * but pre-seeded with authStore.setSessionData() so we control the
 * current user without touching crypto.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ListingComments from '../src/views/marketplace/components/ListingComments.vue';

vi.mock('../src/services/CommentService.js', () => ({
  CommentService: {
    create: vi.fn().mockResolvedValue({ id: 'new-c', content: 'Posted' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../src/composables/useUserProfile.js', () => ({
  useUserProfile: () => ({ getProfile: vi.fn().mockResolvedValue(null) }),
}));

let pinia;

function makeSession(userId = 'user-1', roles = ['user']) {
  return { userId, roles, token: 'tok', createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeComment(overrides = {}) {
  return {
    id: `c-${Math.random()}`,
    userId: 'user-1',
    content: '<p>A comment</p>',
    createdAt: Date.now(),
    media: [],
    ...overrides,
  };
}

function mountComments(comments = [], sessionOverrides = {}) {
  const auth = useAuthStore();
  auth.setSessionData(makeSession(...Object.values(sessionOverrides)), { id: 'user-1' });

  return mount(ListingComments, {
    props: { listingId: 'listing-1', comments },
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

describe('ListingComments — empty state', () => {
  it('shows "No comments yet" when list is empty', () => {
    const wrapper = mountComments([]);
    expect(wrapper.text()).toContain('No comments yet');
  });

  it('still renders the submission form when empty', () => {
    const wrapper = mountComments([]);
    expect(wrapper.find('form.comment-form').exists()).toBe(true);
  });
});

describe('ListingComments — comment list', () => {
  it('renders one .comment-item per comment', () => {
    const wrapper = mountComments([makeComment(), makeComment()]);
    expect(wrapper.findAll('.comment-item')).toHaveLength(2);
  });

  it('does not show empty-state when comments are present', () => {
    const wrapper = mountComments([makeComment()]);
    expect(wrapper.text()).not.toContain('No comments yet');
  });
});

describe('ListingComments — owner action buttons', () => {
  it('shows Edit and Delete buttons for the comment owner', () => {
    const comment = makeComment({ userId: 'user-1' });
    const wrapper = mountComments([comment]);
    const actions = wrapper.find('.comment-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain('Edit');
    expect(actions.text()).toContain('Delete');
  });

  it('does not show action buttons for comments by other users', () => {
    const comment = makeComment({ userId: 'other-user' });
    const wrapper = mountComments([comment]);
    expect(wrapper.find('.comment-actions').exists()).toBe(false);
  });

  it('shows only Delete button for moderator on others\' comments', () => {
    const comment = makeComment({ userId: 'other-user' });
    const auth = useAuthStore();
    auth.setSessionData(makeSession('mod-1', ['moderator']), {});

    const wrapper = mount(ListingComments, {
      props: { listingId: 'l1', comments: [comment] },
      global: { plugins: [pinia], stubs: { teleport: true } },
    });

    const actions = wrapper.find('.comment-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain('Delete');
    expect(actions.text()).not.toContain('Edit');
  });
});

describe('ListingComments — submission form', () => {
  it('Post Comment button is disabled when editor is empty', () => {
    const wrapper = mountComments([]);
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });
});

describe('ListingComments — delete flow', () => {
  it('calls CommentService.delete and emits refresh on delete', async () => {
    const { CommentService } = await import('../src/services/CommentService.js');
    const comment = makeComment({ userId: 'user-1' });
    const wrapper = mountComments([comment]);

    const deleteBtn = wrapper.findAll('button').find(b => b.text() === 'Delete');
    await deleteBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(CommentService.delete).toHaveBeenCalled();
    // refresh emit is async — allow microtask queue to flush
    await new Promise(r => setTimeout(r, 0));
    expect(wrapper.emitted('refresh')).toBeTruthy();
  });
});

describe('ListingComments — edit modal', () => {
  it('opens edit modal when Edit is clicked', async () => {
    const comment = makeComment({ userId: 'user-1', content: '<p>Original</p>' });
    const wrapper = mountComments([comment]);

    const editBtn = wrapper.findAll('button').find(b => b.text() === 'Edit');
    await editBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // AppModal becomes visible — look for the Cancel button inside it
    expect(wrapper.text()).toContain('Edit Comment');
  });
});
