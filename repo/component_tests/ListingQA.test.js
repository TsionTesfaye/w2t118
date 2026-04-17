/**
 * ListingQA — Component Integration Tests
 *
 * Renders Q&A threads plus submission forms for questions and answers.
 * Tests cover: empty state, thread rendering, owner/moderator action
 * buttons, answer form visibility rules, form button gating,
 * edit modal open, and delete flow.
 *
 * Real CommentService runs against in-memory repository stubs.
 * useUserProfile is also real (returns null for unknown users, which is fine).
 * No service or composable mocks — only IndexedDB is replaced.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import ListingQA from '../src/views/marketplace/components/ListingQA.vue';

// ── In-memory repository stubs ────────────────────────────────────────────────
let _comments = [];
let _listings = [];
let _sensitiveWords = [];
let _moderationCases = [];
let _auditLogs = [];
let _reportEntries = [];

vi.mock('../src/repositories/index.js', () => ({
  commentRepository: {
    getById: async (id) => _comments.find(c => c.id === id) || null,
    getByIdOrFail: async (id) => {
      const c = _comments.find(c => c.id === id);
      if (!c) { const e = new Error(`Comment ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return c;
    },
    create: async (comment) => { _comments.push({ ...comment }); return comment; },
    update: async (comment) => {
      const idx = _comments.findIndex(c => c.id === comment.id);
      if (idx >= 0) _comments[idx] = { ...comment };
      return comment;
    },
    getByListingId: async (listingId) => _comments.filter(c => c.listingId === listingId),
  },
  listingRepository: {
    getById: async (id) => _listings.find(l => l.id === id) || null,
    getByIdOrFail: async (id) => {
      const l = _listings.find(l => l.id === id);
      if (!l) { const e = new Error(`Listing ${id} not found`); e.name = 'NotFoundError'; throw e; }
      return l;
    },
    getAll: async () => [..._listings],
  },
  // preScreenContent reads sensitive words — empty list = no flagged content
  sensitiveWordRepository: {
    getAll: async () => [..._sensitiveWords],
  },
  moderationCaseRepository: {
    create: async (c) => { _moderationCases.push({ ...c }); return c; },
    getAll: async () => [..._moderationCases],
  },
  auditLogRepository: {
    create: async (log) => { _auditLogs.push({ ...log }); return log; },
    getAll: async () => [..._auditLogs],
  },
  reportRepository: {
    getById: async (id) => _reportEntries.find(r => r.id === id) || null,
  },
  // useUserProfile → UserService.getProfile → userRepository.getByIdOrFail
  // Returns null for unknown users (useUserProfile catches errors silently)
  userRepository: {
    getById: async () => null,
    getByIdOrFail: async (id) => {
      const e = new Error(`User ${id} not found`); e.name = 'NotFoundError'; throw e;
    },
  },
  // UserService imports blockRepository (unused in getProfile path)
  blockRepository: {},
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

let pinia;

function makeSession(userId = 'user-1', roles = ['user']) {
  return { userId, roles, token: 'tok', createdAt: Date.now(), lastActivityAt: Date.now() };
}

function makeQA(overrides = {}) {
  return {
    id: `qa-${Math.random()}`,
    userId: 'user-1',
    content: '<p>A question</p>',
    createdAt: Date.now(),
    media: [],
    answers: [],
    ...overrides,
  };
}

function mountQA(qaItems = [], props = {}) {
  const auth = useAuthStore();
  auth.setSessionData(makeSession(props.userId || 'user-1', props.roles || ['user']), { id: props.userId || 'user-1' });

  return mount(ListingQA, {
    props: {
      listingId: 'listing-1',
      qaItems,
      isOwner: props.isOwner ?? false,
    },
    global: {
      plugins: [pinia],
      stubs: { teleport: true },
    },
  });
}

beforeEach(() => {
  _comments = [];
  _listings = [{ id: 'listing-1', sellerId: 'seller-1', status: 'active' }];
  _sensitiveWords = [];
  _moderationCases = [];
  _auditLogs = [];
  _reportEntries = [];
  pinia = createPinia();
  setActivePinia(pinia);
  vi.clearAllMocks();
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('ListingQA — empty state', () => {
  it('shows "No questions yet" when qaItems is empty', () => {
    const wrapper = mountQA([]);
    expect(wrapper.text()).toContain('No questions yet');
  });

  it('always renders the question submission form', () => {
    const wrapper = mountQA([]);
    expect(wrapper.find('form.comment-form').exists()).toBe(true);
  });

  it('Ask Question button is disabled when editor is empty', () => {
    const wrapper = mountQA([]);
    const btn = wrapper.find('button[type="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });
});

// ── Thread rendering ──────────────────────────────────────────────────────────

describe('ListingQA — thread list', () => {
  it('renders one .qa-thread per qa item', () => {
    const wrapper = mountQA([makeQA(), makeQA()]);
    expect(wrapper.findAll('.qa-thread')).toHaveLength(2);
  });

  it('does not show empty-state when qa items are present', () => {
    const wrapper = mountQA([makeQA()]);
    expect(wrapper.text()).not.toContain('No questions yet');
  });

  it('renders answers inside the qa thread', () => {
    const qa = makeQA({
      answers: [{ id: 'a1', userId: 'user-1', content: '<p>Answer</p>', createdAt: Date.now(), media: [] }],
    });
    const wrapper = mountQA([qa]);
    expect(wrapper.find('.qa-answers').exists()).toBe(true);
    expect(wrapper.find('.qa-answer').exists()).toBe(true);
  });
});

// ── Owner action buttons ──────────────────────────────────────────────────────

describe('ListingQA — owner action buttons', () => {
  it('shows Edit and Delete for the question owner', () => {
    const qa = makeQA({ userId: 'user-1' });
    const wrapper = mountQA([qa]);
    const actions = wrapper.find('.comment-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain('Edit');
    expect(actions.text()).toContain('Delete');
  });

  it('shows no action buttons for questions by other users (regular user)', () => {
    const qa = makeQA({ userId: 'other-user' });
    const wrapper = mountQA([qa]);
    expect(wrapper.find('.comment-actions').exists()).toBe(false);
  });

  it("shows Delete button for moderator on another user's question", () => {
    const qa = makeQA({ userId: 'other-user' });
    const auth = useAuthStore();
    auth.setSessionData(makeSession('mod-1', ['moderator']), {});

    const wrapper = mount(ListingQA, {
      props: { listingId: 'listing-1', qaItems: [qa], isOwner: false },
      global: { plugins: [pinia], stubs: { teleport: true } },
    });

    const actions = wrapper.find('.comment-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.text()).toContain('Delete');
    expect(actions.text()).not.toContain('Edit');
  });
});

// ── Answer form visibility ────────────────────────────────────────────────────

describe('ListingQA — answer form visibility', () => {
  it('shows answer form for listing owner on unanswered questions', () => {
    const qa = makeQA({ answers: [] });
    const wrapper = mountQA([qa], { isOwner: true });
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('hides answer form for non-owner', () => {
    const qa = makeQA({ answers: [] });
    const wrapper = mountQA([qa], { isOwner: false });
    const submitBtns = wrapper.findAll('button[type="submit"]');
    const answerBtns = submitBtns.filter(b => b.text().includes('Answer'));
    expect(answerBtns).toHaveLength(0);
  });

  it('hides answer form when question already has answers', () => {
    const qa = makeQA({
      answers: [{ id: 'a1', userId: 'seller-1', content: '<p>Already answered</p>', createdAt: Date.now(), media: [] }],
    });
    const wrapper = mountQA([qa], { isOwner: true });
    const submitBtns = wrapper.findAll('button[type="submit"]');
    const answerBtns = submitBtns.filter(b => b.text().includes('Answer'));
    expect(answerBtns).toHaveLength(0);
  });

  it('Answer button is disabled when editor is empty', () => {
    const qa = makeQA({ answers: [] });
    const wrapper = mountQA([qa], { isOwner: true });
    const answerBtn = wrapper.findAll('button[type="submit"]').find(b => b.text().includes('Answer'));
    expect(answerBtn.attributes('disabled')).toBeDefined();
  });
});

// ── Edit modal ────────────────────────────────────────────────────────────────

describe('ListingQA — edit modal', () => {
  it('opens edit modal when Edit is clicked', async () => {
    const qa = makeQA({ userId: 'user-1', content: '<p>Original question</p>' });
    const wrapper = mountQA([qa]);

    const editBtn = wrapper.findAll('button').find(b => b.text() === 'Edit');
    await editBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Edit Comment');
  });
});

// ── Delete flow (real CommentService — requires CONTENT_DELETE) ───────────────

describe('ListingQA — delete flow', () => {
  it('emits refresh after delete is confirmed (moderator session)', async () => {
    // Moderator role has CONTENT_DELETE permission
    const auth = useAuthStore();
    auth.setSessionData(makeSession('mod-1', ['moderator']), { id: 'mod-1' });

    // Seed a comment owned by 'user-1' in the in-memory store so
    // CommentService.delete can find it via commentRepository.getByIdOrFail
    const qa = makeQA({ id: 'qa-target', userId: 'user-1' });
    _comments.push({
      id: 'qa-target',
      listingId: 'listing-1',
      userId: 'user-1',
      type: 'question',
      content: '<p>A question</p>',
      media: [],
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const wrapper = mount(ListingQA, {
      props: { listingId: 'listing-1', qaItems: [qa], isOwner: false },
      global: { plugins: [pinia], stubs: { teleport: true } },
    });

    const deleteBtn = wrapper.findAll('button').find(b => b.text() === 'Delete');
    await deleteBtn.trigger('click');
    await new Promise(r => setTimeout(r, 0));

    expect(wrapper.emitted('refresh')).toBeTruthy();
    // Comment is soft-deleted in the in-memory store
    expect(_comments.find(c => c.id === 'qa-target')?.isDeleted).toBe(true);
  });
});
