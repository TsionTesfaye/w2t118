/**
 * TransactionPanel — Component Unit Tests
 *
 * Data-driven panel that derives all button visibility from
 * getTransactionActions() (action policy) and transaction state.
 *
 * Tests cover: null-transaction state, buyer Start Transaction button,
 * status badge rendering, action-button visibility per role/state,
 * terminal-state message, cancel modal open/close/emit, and
 * reservation-countdown rendering.
 */

import { mount } from '@vue/test-utils';
import TransactionPanel from '../src/views/messaging/components/TransactionPanel.vue';
import { TransactionStatus } from '../src/domain/enums/statuses.js';

const THIRTY_MIN_MS = 30 * 60 * 1000;

function mountPanel(props) {
  return mount(TransactionPanel, {
    props,
    global: { stubs: { teleport: true } },
  });
}

function makeTx(overrides = {}) {
  return {
    id: 'tx-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: TransactionStatus.INQUIRY,
    reservedAt: null,
    agreedAt: null,
    completedAt: null,
    canceledAt: null,
    cancellationReason: null,
    ...overrides,
  };
}

// ── No transaction ───────────────────────────────────────────────────────────

describe('TransactionPanel — no transaction', () => {
  it('shows "No transaction started" text', () => {
    const wrapper = mountPanel({ transaction: null, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.text()).toContain('No transaction started');
  });

  it('shows Start Transaction button for buyer', () => {
    const wrapper = mountPanel({ transaction: null, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.find('button').text()).toContain('Start Transaction');
  });

  it('does not show Start Transaction button for seller', () => {
    const wrapper = mountPanel({ transaction: null, currentUserId: 'seller-1', isBuyer: false });
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('emits create-transaction when Start Transaction clicked', async () => {
    const wrapper = mountPanel({ transaction: null, currentUserId: 'buyer-1', isBuyer: true });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('create-transaction')).toBeTruthy();
  });
});

// ── INQUIRY state ─────────────────────────────────────────────────────────────

describe('TransactionPanel — INQUIRY state', () => {
  it('shows StatusBadge when transaction exists', () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'seller-1', isBuyer: false });
    expect(wrapper.find('.transaction-status-row').exists()).toBe(true);
  });

  it('shows Reserve button for seller in INQUIRY', () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'seller-1', isBuyer: false });
    expect(wrapper.text()).toContain('Reserve');
  });

  it('does not show Reserve button for buyer in INQUIRY', () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.text()).not.toContain('Reserve');
  });

  it('emits transition with RESERVED when Reserve clicked', async () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'seller-1', isBuyer: false });
    const btn = wrapper.findAll('button').find(b => b.text() === 'Reserve');
    await btn.trigger('click');
    expect(wrapper.emitted('transition')[0][0]).toBe(TransactionStatus.RESERVED);
  });

  it('shows Cancel button for either participant in INQUIRY', () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.text()).toContain('Cancel');
  });
});

// ── RESERVED state ───────────────────────────────────────────────────────────

describe('TransactionPanel — RESERVED state', () => {
  const reservedTx = makeTx({ status: TransactionStatus.RESERVED, reservedAt: Date.now() });

  it('shows Agree button for buyer', () => {
    const wrapper = mountPanel({ transaction: reservedTx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.text()).toContain('Agree');
  });

  it('does not show Agree button for seller', () => {
    const wrapper = mountPanel({ transaction: reservedTx, currentUserId: 'seller-1', isBuyer: false });
    expect(wrapper.text()).not.toContain('Agree');
  });

  it('shows countdown timer when reserved and not expired', () => {
    const wrapper = mountPanel({ transaction: reservedTx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.find('.timer').exists()).toBe(true);
  });

  it('does not show countdown timer for expired reservation', () => {
    const expiredTx = makeTx({
      status: TransactionStatus.RESERVED,
      reservedAt: Date.now() - THIRTY_MIN_MS - 1000,
    });
    const wrapper = mountPanel({ transaction: expiredTx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.find('.timer').exists()).toBe(false);
  });
});

// ── AGREED state ─────────────────────────────────────────────────────────────

describe('TransactionPanel — AGREED state', () => {
  const agreedTx = makeTx({ status: TransactionStatus.AGREED, reservedAt: Date.now() - 1000, agreedAt: Date.now() });

  it('shows Complete button for buyer', () => {
    const wrapper = mountPanel({ transaction: agreedTx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.text()).toContain('Complete');
  });

  it('emits transition with COMPLETED when Complete clicked', async () => {
    const wrapper = mountPanel({ transaction: agreedTx, currentUserId: 'buyer-1', isBuyer: true });
    const btn = wrapper.findAll('button').find(b => b.text() === 'Complete');
    await btn.trigger('click');
    expect(wrapper.emitted('transition')[0][0]).toBe(TransactionStatus.COMPLETED);
  });
});

// ── COMPLETED / CANCELED (terminal) ──────────────────────────────────────────

describe('TransactionPanel — terminal state', () => {
  it('shows terminal message for COMPLETED', () => {
    const tx = makeTx({ status: TransactionStatus.COMPLETED, completedAt: Date.now() });
    const wrapper = mountPanel({ transaction: tx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.find('.alert-info').exists()).toBe(true);
    expect(wrapper.find('.alert-info').text()).toContain('completed');
  });

  it('shows cancellation reason for CANCELED', () => {
    const tx = makeTx({
      status: TransactionStatus.CANCELED,
      canceledAt: Date.now(),
      cancellationReason: 'buyer_changed_mind',
    });
    const wrapper = mountPanel({ transaction: tx, currentUserId: 'buyer-1', isBuyer: true });
    expect(wrapper.find('.alert-info').text()).toContain('buyer_changed_mind');
  });

  it('does not show action buttons in terminal state', () => {
    const tx = makeTx({ status: TransactionStatus.COMPLETED, completedAt: Date.now() });
    const wrapper = mountPanel({ transaction: tx, currentUserId: 'buyer-1', isBuyer: true });
    const btnTexts = wrapper.findAll('button').map(b => b.text());
    expect(btnTexts).not.toContain('Reserve');
    expect(btnTexts).not.toContain('Agree');
    expect(btnTexts).not.toContain('Complete');
    expect(btnTexts).not.toContain('Cancel');
  });
});

// ── Cancel modal ──────────────────────────────────────────────────────────────

describe('TransactionPanel — cancel flow', () => {
  it('opens cancel modal when Cancel button clicked', async () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'buyer-1', isBuyer: true });
    const cancelBtn = wrapper.findAll('button').find(b => b.text() === 'Cancel');
    await cancelBtn.trigger('click');
    // Modal is inside teleport stub — check v-model state via find
    expect(wrapper.find('select.form-select').exists()).toBe(true);
  });

  it('emits cancel with reason when reason selected and confirmed', async () => {
    const wrapper = mountPanel({ transaction: makeTx(), currentUserId: 'buyer-1', isBuyer: true });
    await wrapper.findAll('button').find(b => b.text() === 'Cancel').trigger('click');

    const select = wrapper.find('select.form-select');
    await select.setValue('buyer_changed_mind');

    const confirmBtn = wrapper.findAll('button').find(b => b.text().includes('Cancel Transaction'));
    await confirmBtn.trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.emitted('cancel')[0][0]).toBe('buyer_changed_mind');
  });
});
