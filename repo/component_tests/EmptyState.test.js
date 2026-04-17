/**
 * EmptyState — Component Unit Tests
 *
 * Tests props (icon, title, message), default values, and slot projection.
 */

import { mount } from '@vue/test-utils';
import EmptyState from '../src/components/EmptyState.vue';

describe('EmptyState', () => {
  it('renders the root .empty-state div', () => {
    const wrapper = mount(EmptyState);
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });

  it('shows default icon 📭 when no icon prop provided', () => {
    const wrapper = mount(EmptyState);
    expect(wrapper.find('.empty-state-icon').text()).toBe('📭');
  });

  it('shows default title "Nothing here yet" when no title prop provided', () => {
    const wrapper = mount(EmptyState);
    expect(wrapper.find('h3').text()).toBe('Nothing here yet');
  });

  it('does not render message paragraph when message prop is empty', () => {
    const wrapper = mount(EmptyState, { props: { message: '' } });
    expect(wrapper.find('p').exists()).toBe(false);
  });

  it('renders custom icon via prop', () => {
    const wrapper = mount(EmptyState, { props: { icon: '🚀' } });
    expect(wrapper.find('.empty-state-icon').text()).toBe('🚀');
  });

  it('renders custom title via prop', () => {
    const wrapper = mount(EmptyState, { props: { title: 'No results found' } });
    expect(wrapper.find('h3').text()).toBe('No results found');
  });

  it('renders message paragraph when message prop is provided', () => {
    const wrapper = mount(EmptyState, { props: { message: 'Try adjusting your search.' } });
    const p = wrapper.find('p');
    expect(p.exists()).toBe(true);
    expect(p.text()).toBe('Try adjusting your search.');
  });

  it('renders slot content', () => {
    const wrapper = mount(EmptyState, {
      slots: { default: '<button class="cta-btn">Go back</button>' },
    });
    expect(wrapper.find('.cta-btn').exists()).toBe(true);
    expect(wrapper.find('.cta-btn').text()).toBe('Go back');
  });

  it('renders both message and slot content simultaneously', () => {
    const wrapper = mount(EmptyState, {
      props: { message: 'Nothing to see.' },
      slots: { default: '<a href="#">Browse listings</a>' },
    });
    expect(wrapper.find('p').text()).toBe('Nothing to see.');
    expect(wrapper.find('a').exists()).toBe(true);
  });
});
