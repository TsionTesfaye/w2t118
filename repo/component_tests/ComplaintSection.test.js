/**
 * ComplaintSection — Component Unit Tests
 *
 * Controls whether the dispute section renders (canFileComplaint),
 * shows an existing complaint status, gates the modal submit button,
 * and emits 'file-complaint' with the correct payload.
 *
 * No stores, no services — all logic is derived from props.
 */

import { mount } from '@vue/test-utils';
import ComplaintSection from '../src/views/messaging/components/ComplaintSection.vue';
import { TransactionStatus } from '../src/domain/enums/statuses.js';

function makeTx(status, buyerId = 'buyer-1', sellerId = 'seller-1') {
  return { id: 'tx-1', status, buyerId, sellerId };
}

function mountSection(props) {
  return mount(ComplaintSection, {
    props,
    global: { stubs: { teleport: true } },
  });
}

// ── canFileComplaint gate ─────────────────────────────────────────────────────

describe('ComplaintSection — visibility gate', () => {
  it('renders nothing when transaction is null', () => {
    const wrapper = mountSection({ transaction: null, currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(false);
  });

  it('renders nothing for INQUIRY status', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.INQUIRY), currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(false);
  });

  it('renders nothing for RESERVED status', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.RESERVED), currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(false);
  });

  it('renders nothing for a non-participant observer', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.AGREED), currentUserId: 'outsider' });
    expect(wrapper.find('.complaint-section').exists()).toBe(false);
  });

  it('renders for buyer when status is AGREED', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.AGREED), currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(true);
  });

  it('renders for seller when status is AGREED', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.AGREED), currentUserId: 'seller-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(true);
  });

  it('renders for buyer when status is COMPLETED', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.COMPLETED), currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(true);
  });

  it('renders nothing when CANCELED status', () => {
    const wrapper = mountSection({ transaction: makeTx(TransactionStatus.CANCELED), currentUserId: 'buyer-1' });
    expect(wrapper.find('.complaint-section').exists()).toBe(false);
  });
});

// ── existingComplaint display ─────────────────────────────────────────────────

describe('ComplaintSection — existing complaint', () => {
  const agreedTx = makeTx(TransactionStatus.AGREED);

  it('shows complaint status when existingComplaint is provided', () => {
    const wrapper = mountSection({
      transaction: agreedTx,
      currentUserId: 'buyer-1',
      existingComplaint: { status: 'open' },
    });
    expect(wrapper.find('.alert-info').text()).toContain('open');
  });

  it('hides File Complaint button when complaint already filed', () => {
    const wrapper = mountSection({
      transaction: agreedTx,
      currentUserId: 'buyer-1',
      existingComplaint: { status: 'open' },
    });
    const btns = wrapper.findAll('button').map(b => b.text());
    expect(btns).not.toContain('File Complaint');
  });

  it('shows File Complaint button when no existing complaint', () => {
    const wrapper = mountSection({ transaction: agreedTx, currentUserId: 'buyer-1' });
    expect(wrapper.find('button').text()).toContain('File Complaint');
  });
});

// ── actionLoading ─────────────────────────────────────────────────────────────

describe('ComplaintSection — actionLoading', () => {
  it('disables File Complaint button when actionLoading is true', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
      actionLoading: true,
    });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('enables File Complaint button when actionLoading is false', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
      actionLoading: false,
    });
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });
});

// ── Modal interaction ─────────────────────────────────────────────────────────

describe('ComplaintSection — modal', () => {
  it('opens modal when File Complaint clicked', async () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
    });
    await wrapper.find('button').trigger('click');
    // Modal content becomes visible (teleport stubbed)
    expect(wrapper.find('select.form-select').exists()).toBe(true);
  });

  it('Submit Complaint is disabled when issue type is empty', async () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
    });
    await wrapper.find('button').trigger('click');
    const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit'));
    expect(submitBtn.attributes('disabled')).toBeDefined();
  });

  it('Submit Complaint is disabled when description is empty even if type is set', async () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
    });
    await wrapper.find('button').trigger('click');
    await wrapper.find('select.form-select').setValue('fraud');
    const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit'));
    expect(submitBtn.attributes('disabled')).toBeDefined();
  });

  it('emits file-complaint with issueType and description when submitted', async () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
    });
    await wrapper.find('button').trigger('click');
    await wrapper.find('select.form-select').setValue('fraud');
    await wrapper.find('textarea.form-textarea').setValue('Seller is fraudulent');
    const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit'));
    await submitBtn.trigger('click');

    expect(wrapper.emitted('file-complaint')).toBeTruthy();
    const payload = wrapper.emitted('file-complaint')[0][0];
    expect(payload.issueType).toBe('fraud');
    expect(payload.description).toBe('Seller is fraudulent');
  });

  it('closes modal and resets form after successful submission', async () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      currentUserId: 'buyer-1',
    });
    await wrapper.find('button').trigger('click');
    await wrapper.find('select.form-select').setValue('other');
    await wrapper.find('textarea.form-textarea').setValue('Some issue');
    const submitBtn = wrapper.findAll('button').find(b => b.text().includes('Submit'));
    await submitBtn.trigger('click');

    // After close the select is no longer in the DOM
    expect(wrapper.find('select.form-select').exists()).toBe(false);
  });
});
