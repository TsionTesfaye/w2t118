/**
 * ThreadMessageList — Component Unit Tests
 *
 * Renders a scrollable list of chat bubbles. Tests cover:
 * bubble count, mine/theirs class assignment, sender avatar
 * visibility, message content, and timestamp rendering.
 *
 * UserAvatar's composable fetch is mocked to prevent IndexedDB access.
 */

import { mount } from '@vue/test-utils';
import ThreadMessageList from '../src/views/messaging/components/ThreadMessageList.vue';

vi.mock('../src/composables/useUserProfile.js', () => ({
  useUserProfile: () => ({ getProfile: vi.fn().mockResolvedValue(null) }),
}));

const NOW = 1_700_000_000_000;

function makeMessages(overrides = []) {
  return [
    { id: 'm1', threadId: 't1', senderId: 'user-1', content: 'Hello!', createdAt: NOW },
    { id: 'm2', threadId: 't1', senderId: 'user-2', content: 'Hey there', createdAt: NOW + 1000 },
    ...overrides,
  ];
}

function mountList(messages, currentUserId = 'user-1') {
  return mount(ThreadMessageList, {
    props: { messages, currentUserId },
  });
}

describe('ThreadMessageList — structure', () => {
  it('renders the .chat-messages container', () => {
    const wrapper = mountList([]);
    expect(wrapper.find('.chat-messages').exists()).toBe(true);
  });

  it('renders no bubbles when messages array is empty', () => {
    const wrapper = mountList([]);
    expect(wrapper.findAll('.chat-bubble')).toHaveLength(0);
  });

  it('renders one bubble per message', () => {
    const wrapper = mountList(makeMessages());
    expect(wrapper.findAll('.chat-bubble')).toHaveLength(2);
  });
});

describe('ThreadMessageList — mine / theirs', () => {
  it('applies .mine class to messages sent by currentUserId', () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    const bubbles = wrapper.findAll('.chat-bubble');
    expect(bubbles[0].classes()).toContain('mine');
  });

  it('applies .theirs class to messages from other senders', () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    const bubbles = wrapper.findAll('.chat-bubble');
    expect(bubbles[1].classes()).toContain('theirs');
  });

  it('every message is exactly mine or theirs, never both', () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    wrapper.findAll('.chat-bubble').forEach(b => {
      const hasMine = b.classes().includes('mine');
      const hasTheirs = b.classes().includes('theirs');
      expect(hasMine !== hasTheirs).toBe(true);
    });
  });
});

describe('ThreadMessageList — sender avatar', () => {
  it('shows sender avatar for theirs messages', async () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    await wrapper.vm.$nextTick();
    // The second bubble (theirs) should have .chat-sender
    const bubbles = wrapper.findAll('.chat-bubble');
    expect(bubbles[1].find('.chat-sender').exists()).toBe(true);
  });

  it('does not show sender avatar for mine messages', async () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    await wrapper.vm.$nextTick();
    const bubbles = wrapper.findAll('.chat-bubble');
    expect(bubbles[0].find('.chat-sender').exists()).toBe(false);
  });
});

describe('ThreadMessageList — content', () => {
  it('renders message content text', () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    const bubbles = wrapper.findAll('.chat-bubble');
    expect(bubbles[0].find('p').text()).toBe('Hello!');
    expect(bubbles[1].find('p').text()).toBe('Hey there');
  });

  it('renders a timestamp for each message', () => {
    const wrapper = mountList(makeMessages(), 'user-1');
    const times = wrapper.findAll('.chat-time');
    expect(times).toHaveLength(2);
    times.forEach(t => expect(t.text().length).toBeGreaterThan(0));
  });
});

describe('ThreadMessageList — all-mine thread', () => {
  it('all bubbles get .mine when every message is from currentUserId', () => {
    const allMine = [
      { id: 'a', senderId: 'me', content: 'One', createdAt: NOW },
      { id: 'b', senderId: 'me', content: 'Two', createdAt: NOW + 1 },
    ];
    const wrapper = mountList(allMine, 'me');
    wrapper.findAll('.chat-bubble').forEach(b => expect(b.classes()).toContain('mine'));
  });
});
