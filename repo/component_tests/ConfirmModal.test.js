/**
 * ConfirmModal — Component Unit Tests
 *
 * Tests message rendering, confirm/cancel button behaviour,
 * dangerMode class toggling, and event emissions.
 */

import { mount } from '@vue/test-utils';
import ConfirmModal from '../src/components/ConfirmModal.vue';

function mountConfirm(props = {}) {
  return mount(ConfirmModal, {
    props: { modelValue: true, ...props },
    global: { stubs: { teleport: true } },
  });
}

describe('ConfirmModal', () => {
  it('renders the message text', () => {
    const wrapper = mountConfirm({ message: 'Do you want to proceed?' });
    expect(wrapper.find('.modal-body p').text()).toBe('Do you want to proceed?');
  });

  it('uses default "Are you sure?" message when none provided', () => {
    const wrapper = mountConfirm();
    expect(wrapper.find('.modal-body p').text()).toBe('Are you sure?');
  });

  it('renders the title via AppModal', () => {
    const wrapper = mountConfirm({ title: 'Delete Item' });
    expect(wrapper.find('.modal-header h3').text()).toBe('Delete Item');
  });

  it('renders the confirm button with default text', () => {
    const wrapper = mountConfirm();
    const buttons = wrapper.findAll('.modal-footer .btn');
    const confirmBtn = buttons.find(b => b.text() === 'Confirm');
    expect(confirmBtn).toBeTruthy();
  });

  it('renders the confirm button with custom confirmText', () => {
    const wrapper = mountConfirm({ confirmText: 'Delete forever' });
    const buttons = wrapper.findAll('.modal-footer .btn');
    const confirmBtn = buttons.find(b => b.text() === 'Delete forever');
    expect(confirmBtn).toBeTruthy();
  });

  it('confirm button has btn-primary class by default', () => {
    const wrapper = mountConfirm();
    const buttons = wrapper.findAll('.modal-footer .btn');
    const confirmBtn = buttons.find(b => b.text() === 'Confirm');
    expect(confirmBtn.classes()).toContain('btn-primary');
    expect(confirmBtn.classes()).not.toContain('btn-danger');
  });

  it('confirm button has btn-danger class when dangerMode is true', () => {
    const wrapper = mountConfirm({ dangerMode: true, confirmText: 'Delete' });
    const buttons = wrapper.findAll('.modal-footer .btn');
    const confirmBtn = buttons.find(b => b.text() === 'Delete');
    expect(confirmBtn.classes()).toContain('btn-danger');
    expect(confirmBtn.classes()).not.toContain('btn-primary');
  });

  it('clicking confirm button emits "confirm" event', async () => {
    const wrapper = mountConfirm({ confirmText: 'Yes' });
    const buttons = wrapper.findAll('.modal-footer .btn');
    const confirmBtn = buttons.find(b => b.text() === 'Yes');
    await confirmBtn.trigger('click');
    expect(wrapper.emitted('confirm')).toBeTruthy();
  });

  it('clicking cancel button emits update:modelValue with false', async () => {
    const wrapper = mountConfirm();
    const cancelBtn = wrapper.findAll('.modal-footer .btn').find(b => b.text() === 'Cancel');
    await cancelBtn.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false]);
  });

  it('not visible when modelValue is false', () => {
    const wrapper = mount(ConfirmModal, {
      props: { modelValue: false },
      global: { stubs: { teleport: true } },
    });
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });
});
