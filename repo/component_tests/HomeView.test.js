/**
 * HomeView — Component Tests
 *
 * HomeView renders purely from authStore computed state — no services or
 * async I/O. Tests cover displayName rendering and all role-gated cards.
 *
 * Boundaries mocked:
 *   - vue-router (RouterLink, useRouter)  — navigation side effects
 *
 * NOT mocked: repositories, crypto — no service calls are made by HomeView.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../src/app/store/authStore.js';
import HomeView from '../src/views/HomeView.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
  RouterLink: { template: '<a><slot /></a>' },
  RouterView: { template: '<div />' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId, roles) {
  return { userId, roles, createdAt: Date.now(), lastActivityAt: Date.now() };
}

let pinia;

function mountHome() {
  return mount(HomeView, {
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('HomeView', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  // ── Display name ──────────────────────────────────────────────────────────

  it('renders displayName from currentUser', () => {
    const auth = useAuthStore();
    auth.setSessionData(
      makeSession('u1', ['user']),
      { id: 'u1', displayName: 'Alice Trader', username: 'alice' },
    );
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Alice Trader');
  });

  it('falls back to username when displayName is empty', () => {
    const auth = useAuthStore();
    auth.setSessionData(
      makeSession('u1', ['user']),
      { id: 'u1', displayName: '', username: 'alice' },
    );
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('alice');
  });

  it('renders empty string when no user is set', () => {
    // authStore starts with no session — currentUser is null
    const wrapper = mountHome();
    // Should still render without throwing
    expect(wrapper.find('.page-header').exists()).toBe(true);
  });

  // ── Common cards (visible to every authenticated user) ────────────────────

  it('shows Browse Marketplace card for regular user', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user']), { id: 'u1', displayName: 'Alice', username: 'alice' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Browse Marketplace');
    expect(wrapper.text()).toContain('Create Listing');
    expect(wrapper.text()).toContain('My Messages');
    expect(wrapper.text()).toContain('User Center');
  });

  // ── Review Queue (moderator | admin) ─────────────────────────────────────

  it('hides Review Queue for regular user', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user']), { id: 'u1', displayName: 'Alice', username: 'alice' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Review Queue');
  });

  it('shows Review Queue for moderator', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'moderator']), { id: 'u1', displayName: 'Mod', username: 'mod' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Review Queue');
  });

  it('shows Review Queue for admin', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['admin']), { id: 'u1', displayName: 'Admin', username: 'admin' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Review Queue');
  });

  it('hides Review Queue for support_agent', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'support_agent']), { id: 'u1', displayName: 'Support', username: 'support' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Review Queue');
  });

  // ── Complaint Queue (support_agent | admin) ───────────────────────────────

  it('hides Complaint Queue for regular user', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user']), { id: 'u1', displayName: 'Alice', username: 'alice' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Complaint Queue');
  });

  it('shows Complaint Queue for support_agent', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'support_agent']), { id: 'u1', displayName: 'Support', username: 'support' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Complaint Queue');
  });

  it('shows Complaint Queue for admin', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['admin']), { id: 'u1', displayName: 'Admin', username: 'admin' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Complaint Queue');
  });

  it('hides Complaint Queue for moderator', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'moderator']), { id: 'u1', displayName: 'Mod', username: 'mod' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Complaint Queue');
  });

  // ── Admin Dashboard (admin only) ──────────────────────────────────────────

  it('hides Admin Dashboard for regular user', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user']), { id: 'u1', displayName: 'Alice', username: 'alice' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Admin Dashboard');
  });

  it('hides Admin Dashboard for moderator', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'moderator']), { id: 'u1', displayName: 'Mod', username: 'mod' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Admin Dashboard');
  });

  it('hides Admin Dashboard for support_agent', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['user', 'support_agent']), { id: 'u1', displayName: 'Support', username: 'support' });
    const wrapper = mountHome();
    expect(wrapper.text()).not.toContain('Admin Dashboard');
  });

  it('shows Admin Dashboard only for admin', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['admin']), { id: 'u1', displayName: 'Admin', username: 'admin' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Admin Dashboard');
  });

  // ── Admin sees all role-specific cards ────────────────────────────────────

  it('shows all role-specific cards for admin', () => {
    const auth = useAuthStore();
    auth.setSessionData(makeSession('u1', ['admin']), { id: 'u1', displayName: 'Admin', username: 'admin' });
    const wrapper = mountHome();
    expect(wrapper.text()).toContain('Review Queue');
    expect(wrapper.text()).toContain('Complaint Queue');
    expect(wrapper.text()).toContain('Admin Dashboard');
  });
});
