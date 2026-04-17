/**
 * ToastContainer — Component Unit Tests
 *
 * Mounts the component against a real Pinia uiStore to verify
 * that toasts added to the store are rendered in the DOM and
 * that the close button removes them.
 */

import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../src/app/store/uiStore.js';
import ToastContainer from '../src/components/ToastContainer.vue';

let pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

function mountToasts() {
  return mount(ToastContainer, { global: { plugins: [pinia] } });
}

describe('ToastContainer', () => {
  it('renders nothing when the toast queue is empty', () => {
    const wrapper = mountToasts();
    expect(wrapper.findAll('.toast')).toHaveLength(0);
  });

  it('renders a toast when one is added to the store', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.addToast('Hello world', 'info', 0);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.toast')).toHaveLength(1);
    expect(wrapper.find('.toast-msg').text()).toBe('Hello world');
  });

  it('renders one element per toast', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.success('First');
    ui.showError('Second');
    ui.warning('Third');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.toast')).toHaveLength(3);
  });

  it('applies toast-success class for success toasts', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.success('Saved');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.toast').classes()).toContain('toast-success');
  });

  it('applies toast-error class for error toasts', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.showError('Failed');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.toast').classes()).toContain('toast-error');
  });

  it('applies toast-warning class for warning toasts', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.warning('Careful');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.toast').classes()).toContain('toast-warning');
  });

  it('applies toast-info class for info toasts', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.info('Note');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.toast').classes()).toContain('toast-info');
  });

  it('close button removes the toast from the DOM', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.addToast('Dismissible', 'info', 0);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.toast')).toHaveLength(1);

    await wrapper.find('button').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.toast')).toHaveLength(0);
  });

  it('closing one toast leaves others intact', async () => {
    const ui = useUiStore();
    const wrapper = mountToasts();

    ui.addToast('Keep me', 'success', 0);
    ui.addToast('Close me', 'error', 0);
    await wrapper.vm.$nextTick();

    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.toast')).toHaveLength(1);
    expect(wrapper.find('.toast-msg').text()).toBe('Keep me');
  });
});
