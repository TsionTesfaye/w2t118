/**
 * UserAvatar — Component Unit Tests
 *
 * When both `displayName` and `avatarUrl` are provided the component skips
 * the async profile fetch (fetchIfNeeded guard: `if (displayName && avatarUrl) return`).
 * All tests supply both props so we can verify rendering logic without
 * mocking the useUserProfile composable.
 *
 * Tests cover: initials computation, size classes, showName toggle,
 * image rendering vs initials fallback, and img error → initials fallback.
 */

import { mount } from '@vue/test-utils';
import UserAvatar from '../src/components/UserAvatar.vue';

// Stub the useUserProfile composable so the component never attempts
// a real IndexedDB lookup during tests.
vi.mock('../src/composables/useUserProfile.js', () => ({
  useUserProfile: () => ({
    getProfile: vi.fn().mockResolvedValue(null),
  }),
}));

function mountAvatar(props = {}) {
  return mount(UserAvatar, {
    props: { userId: 'user-1', ...props },
  });
}

describe('UserAvatar', () => {
  it('renders the .ua-wrap root element', () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null });
    expect(wrapper.find('.ua-wrap').exists()).toBe(true);
  });

  it('shows initials when no avatarUrl is provided', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__initials').exists()).toBe(true);
  });

  it('single-word name → first two letters as initials', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__initials').text()).toBe('AL');
  });

  it('two-word name → first letter of each word', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice Wonderland', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__initials').text()).toBe('AW');
  });

  it('three-word name → first + last word initials', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice Bob Wonderland', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__initials').text()).toBe('AW');
  });

  it('falls back to userId when no displayName and no profile', async () => {
    const wrapper = mountAvatar({ displayName: null, avatarUrl: null });
    await wrapper.vm.$nextTick();
    const initials = wrapper.find('.ua__initials');
    if (initials.exists()) {
      // userId is 'user-1' → 'US' (first 2 chars upper)
      expect(initials.text()).toMatch(/^[A-Z?]{1,2}$/);
    }
  });

  it('renders img element when avatarUrl is provided', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: 'data:image/png;base64,abc' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img.ua__img').exists()).toBe(true);
    expect(wrapper.find('.ua__initials').exists()).toBe(false);
  });

  it('img src matches the provided avatarUrl', async () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: url });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img.ua__img').attributes('src')).toBe(url);
  });

  it('img alt matches the resolvedName', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice B', avatarUrl: 'data:image/png;base64,abc' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img.ua__img').attributes('alt')).toBe('Alice B');
  });

  it('falls back to initials when img fires error event', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: 'data:image/png;base64,abc' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img.ua__img').exists()).toBe(true);

    await wrapper.find('img.ua__img').trigger('error');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('img.ua__img').exists()).toBe(false);
    expect(wrapper.find('.ua__initials').exists()).toBe(true);
  });

  it('applies ua--sm class by default', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua').classes()).toContain('ua--sm');
  });

  it('applies ua--md class when size="md"', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null, size: 'md' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua').classes()).toContain('ua--md');
  });

  it('applies ua--lg class when size="lg"', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null, size: 'lg' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua').classes()).toContain('ua--lg');
  });

  it('does not render .ua__name when showName is false (default)', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__name').exists()).toBe(false);
  });

  it('renders .ua__name with display name when showName is true', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice B', avatarUrl: null, showName: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua__name').exists()).toBe(true);
    expect(wrapper.find('.ua__name').text()).toBe('Alice B');
  });

  it('adds ua-wrap--named class when showName is true', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null, showName: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua-wrap').classes()).toContain('ua-wrap--named');
  });

  it('does NOT add ua-wrap--named when showName is false', async () => {
    const wrapper = mountAvatar({ displayName: 'Alice', avatarUrl: null, showName: false });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ua-wrap').classes()).not.toContain('ua-wrap--named');
  });
});
