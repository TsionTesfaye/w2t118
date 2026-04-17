/**
 * AppModal — Component Unit Tests
 *
 * Tests show/hide behaviour, title rendering, close-button emit,
 * overlay click emit, default slot, and footer slot.
 *
 * Teleport is stubbed so content is inspectable inline in the test DOM.
 */

import { mount } from '@vue/test-utils';
import AppModal from '../src/components/AppModal.vue';

// Helper: mount with teleport stubbed so Teleport renders inline
function mountModal(props = {}, slots = {}) {
  return mount(AppModal, {
    props,
    slots,
    global: { stubs: { teleport: true } },
  });
}

describe('AppModal', () => {
  it('is not visible when modelValue is false', () => {
    const wrapper = mountModal({ modelValue: false, title: 'Test' });
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });

  it('is visible when modelValue is true', () => {
    const wrapper = mountModal({ modelValue: true, title: 'Test' });
    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
  });

  it('renders the title inside .modal-header', () => {
    const wrapper = mountModal({ modelValue: true, title: 'Confirm Action' });
    expect(wrapper.find('.modal-header h3').text()).toBe('Confirm Action');
  });

  it('renders default slot content in .modal-body', () => {
    const wrapper = mountModal(
      { modelValue: true, title: 'Modal' },
      { default: '<p class="body-content">Hello world</p>' },
    );
    expect(wrapper.find('.modal-body .body-content').exists()).toBe(true);
    expect(wrapper.find('.modal-body .body-content').text()).toBe('Hello world');
  });

  it('does not render .modal-footer when no footer slot is provided', () => {
    const wrapper = mountModal({ modelValue: true, title: 'Modal' });
    expect(wrapper.find('.modal-footer').exists()).toBe(false);
  });

  it('renders footer slot content in .modal-footer', () => {
    const wrapper = mountModal(
      { modelValue: true, title: 'Modal' },
      { footer: '<button class="ok-btn">OK</button>' },
    );
    expect(wrapper.find('.modal-footer .ok-btn').exists()).toBe(true);
  });

  it('close button emits update:modelValue with false', async () => {
    const wrapper = mountModal({ modelValue: true, title: 'Close me' });
    await wrapper.find('.modal-header .btn-icon').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false]);
  });

  it('clicking the overlay emits update:modelValue with false', async () => {
    const wrapper = mountModal({ modelValue: true, title: 'Overlay click' });
    // Trigger click directly on .modal-overlay (the self-click handler)
    await wrapper.find('.modal-overlay').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false]);
  });

  it('applies custom maxWidth style when prop is provided', () => {
    const wrapper = mountModal({ modelValue: true, title: 'Narrow', maxWidth: '400px' });
    const content = wrapper.find('.modal-content');
    expect(content.attributes('style')).toContain('max-width: 400px');
  });

  it('applies no inline style when maxWidth is not provided', () => {
    const wrapper = mountModal({ modelValue: true, title: 'Default width' });
    const content = wrapper.find('.modal-content');
    // style attribute should be absent or empty
    const style = content.attributes('style');
    expect(!style || style === '').toBe(true);
  });

  it('shows empty title gracefully when title is not provided', () => {
    const wrapper = mountModal({ modelValue: true });
    // Should render without throwing; title h3 should be empty
    expect(wrapper.find('.modal-header h3').text()).toBe('');
  });
});
