/**
 * RichTextEditor — Component Unit Tests
 *
 * Tests structure, prop initialisation, modelValue sync, and
 * update:modelValue emission. execCommand is not available in
 * jsdom so toolbar-button tests stay structural only.
 */

import { mount } from '@vue/test-utils';
import RichTextEditor from '../src/components/RichTextEditor.vue';

function mountEditor(props = {}) {
  return mount(RichTextEditor, { props: { modelValue: '', ...props } });
}

describe('RichTextEditor', () => {
  it('renders the .rte-wrapper root element', () => {
    const wrapper = mountEditor();
    expect(wrapper.find('.rte-wrapper').exists()).toBe(true);
  });

  it('renders the toolbar', () => {
    const wrapper = mountEditor();
    expect(wrapper.find('.rte-toolbar').exists()).toBe(true);
  });

  it('renders the content editable area', () => {
    const wrapper = mountEditor();
    expect(wrapper.find('.rte-content').exists()).toBe(true);
  });

  it('content area is marked as contenteditable', () => {
    const wrapper = mountEditor();
    expect(wrapper.find('.rte-content').attributes('contenteditable')).toBe('true');
  });

  it('renders 6 toolbar buttons', () => {
    const wrapper = mountEditor();
    expect(wrapper.findAll('.rte-btn')).toHaveLength(6);
  });

  it('toolbar contains a Bold button', () => {
    const wrapper = mountEditor();
    const buttons = wrapper.findAll('.rte-btn');
    expect(buttons.some(b => b.attributes('title') === 'Bold')).toBe(true);
  });

  it('toolbar contains an Italic button', () => {
    const wrapper = mountEditor();
    const buttons = wrapper.findAll('.rte-btn');
    expect(buttons.some(b => b.attributes('title') === 'Italic')).toBe(true);
  });

  it('toolbar contains a Link button', () => {
    const wrapper = mountEditor();
    const buttons = wrapper.findAll('.rte-btn');
    expect(buttons.some(b => b.attributes('title') === 'Insert link')).toBe(true);
  });

  it('sets placeholder via aria-placeholder attribute', () => {
    const wrapper = mountEditor({ placeholder: 'Type something…' });
    expect(wrapper.find('.rte-content').attributes('aria-placeholder')).toBe('Type something…');
  });

  it('empty placeholder when prop not provided', () => {
    const wrapper = mountEditor();
    expect(wrapper.find('.rte-content').attributes('aria-placeholder')).toBe('');
  });

  it('emits update:modelValue with innerHTML on input event', async () => {
    const wrapper = mountEditor();
    const content = wrapper.find('.rte-content');

    // Simulate user typing by setting innerHTML and firing input
    content.element.innerHTML = '<p>Hello</p>';
    await content.trigger('input');

    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0][0]).toBe('<p>Hello</p>');
  });

  it('emits update:modelValue on blur', async () => {
    const wrapper = mountEditor();
    const content = wrapper.find('.rte-content');
    content.element.innerHTML = 'Blurred content';
    await content.trigger('blur');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('updates content area when modelValue prop changes', async () => {
    const wrapper = mountEditor({ modelValue: 'Initial' });
    await wrapper.setProps({ modelValue: '<b>Updated</b>' });
    expect(wrapper.find('.rte-content').element.innerHTML).toBe('<b>Updated</b>');
  });
});
