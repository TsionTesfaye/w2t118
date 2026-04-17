/**
 * StatusBadge — Component Unit Tests
 *
 * Tests that the badge renders the correct label and CSS class
 * for each known status value, and falls back gracefully for unknowns.
 */

import { mount } from '@vue/test-utils';
import StatusBadge from '../src/components/StatusBadge.vue';

describe('StatusBadge', () => {
  it('renders a span.badge element', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'active' } });
    expect(wrapper.find('span.badge').exists()).toBe(true);
  });

  it('active → label "Active" and badge-success class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'active' } });
    expect(wrapper.text()).toBe('Active');
    expect(wrapper.classes()).toContain('badge-success');
  });

  it('draft → label "Draft" and badge-neutral class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'draft' } });
    expect(wrapper.text()).toBe('Draft');
    expect(wrapper.classes()).toContain('badge-neutral');
  });

  it('sold → label "Sold" and badge-neutral class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'sold' } });
    expect(wrapper.text()).toBe('Sold');
    expect(wrapper.classes()).toContain('badge-neutral');
  });

  it('archived → label "Archived" and badge-neutral class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'archived' } });
    expect(wrapper.text()).toBe('Archived');
    expect(wrapper.classes()).toContain('badge-neutral');
  });

  it('under_review → label "Under Review" and badge-warning class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'under_review' } });
    expect(wrapper.text()).toBe('Under Review');
    expect(wrapper.classes()).toContain('badge-warning');
  });

  it('rejected → label "Rejected" and badge-danger class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'rejected' } });
    expect(wrapper.text()).toBe('Rejected');
    expect(wrapper.classes()).toContain('badge-danger');
  });

  it('inquiry → label "Inquiry" and badge-info class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'inquiry' } });
    expect(wrapper.text()).toBe('Inquiry');
    expect(wrapper.classes()).toContain('badge-info');
  });

  it('reserved → label "Reserved" and badge-warning class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'reserved' } });
    expect(wrapper.text()).toBe('Reserved');
    expect(wrapper.classes()).toContain('badge-warning');
  });

  it('agreed → label "Agreed" and badge-primary class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'agreed' } });
    expect(wrapper.text()).toBe('Agreed');
    expect(wrapper.classes()).toContain('badge-primary');
  });

  it('completed → label "Completed" and badge-success class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'completed' } });
    expect(wrapper.text()).toBe('Completed');
    expect(wrapper.classes()).toContain('badge-success');
  });

  it('canceled → label "Canceled" and badge-danger class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'canceled' } });
    expect(wrapper.text()).toBe('Canceled');
    expect(wrapper.classes()).toContain('badge-danger');
  });

  it('resolved → label "Resolved" and badge-success class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'resolved' } });
    expect(wrapper.text()).toBe('Resolved');
    expect(wrapper.classes()).toContain('badge-success');
  });

  it('open → label "Open" and badge-info class', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'open' } });
    expect(wrapper.text()).toBe('Open');
    expect(wrapper.classes()).toContain('badge-info');
  });

  it('unknown status → falls back to the raw status string and badge-neutral', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'totally_unknown' } });
    expect(wrapper.text()).toBe('totally_unknown');
    expect(wrapper.classes()).toContain('badge-neutral');
  });

  it('reacts to prop changes (active → sold)', async () => {
    const wrapper = mount(StatusBadge, { props: { status: 'active' } });
    expect(wrapper.text()).toBe('Active');
    await wrapper.setProps({ status: 'sold' });
    expect(wrapper.text()).toBe('Sold');
  });
});
