/**
 * ThreadComposer — Component Unit Tests
 *
 * Pure presentational: a text input + Send button when active,
 * a read-only banner when the thread is locked.
 * No stores, no services, no async calls.
 */

import { mount } from '@vue/test-utils';
import ThreadComposer from '../src/views/messaging/components/ThreadComposer.vue';

function mountComposer(props = {}) {
  return mount(ThreadComposer, { props });
}

describe('ThreadComposer — active thread', () => {
  it('renders the chat-input-area form', () => {
    const wrapper = mountComposer();
    expect(wrapper.find('form.chat-input-area').exists()).toBe(true);
  });

  it('does not render the read-only banner when isReadOnly is false', () => {
    const wrapper = mountComposer({ isReadOnly: false });
    expect(wrapper.find('.alert-warning').exists()).toBe(false);
  });

  it('renders a text input', () => {
    const wrapper = mountComposer();
    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
  });

  it('Send button is disabled when input is empty', () => {
    const wrapper = mountComposer();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('Send button becomes enabled after typing', async () => {
    const wrapper = mountComposer();
    await wrapper.find('input').setValue('Hello');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('emits "send" with the trimmed message on submit', async () => {
    const wrapper = mountComposer();
    await wrapper.find('input').setValue('  Hello world  ');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('send')).toBeTruthy();
    expect(wrapper.emitted('send')[0][0]).toBe('Hello world');
  });

  it('clears the input after submit', async () => {
    const wrapper = mountComposer();
    const input = wrapper.find('input');
    await input.setValue('Hello');
    await wrapper.find('form').trigger('submit');
    expect(input.element.value).toBe('');
  });

  it('does not emit "send" when input is only whitespace', async () => {
    const wrapper = mountComposer();
    await wrapper.find('input').setValue('   ');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('send')).toBeFalsy();
  });

  it('input is disabled when sending=true', () => {
    const wrapper = mountComposer({ sending: true });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
});

describe('ThreadComposer — read-only thread', () => {
  it('shows the read-only banner', () => {
    const wrapper = mountComposer({ isReadOnly: true });
    expect(wrapper.find('.alert-warning').exists()).toBe(true);
  });

  it('does not render the form when read-only', () => {
    const wrapper = mountComposer({ isReadOnly: true });
    expect(wrapper.find('form.chat-input-area').exists()).toBe(false);
  });
});
