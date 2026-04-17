/**
 * DeliverySection — Component Unit Tests
 *
 * Thin wrapper: only renders DeliverySectionBase when the transaction
 * is in RESERVED or AGREED state and the listing offers delivery.
 * We stub the inner DeliverySectionBase to avoid its IndexedDB calls.
 */

import { mount } from '@vue/test-utils';
import DeliverySection from '../src/views/messaging/components/DeliverySection.vue';
import { TransactionStatus } from '../src/domain/enums/statuses.js';

const SESSION = { userId: 'u1', roles: ['user'], createdAt: Date.now(), lastActivityAt: Date.now() };

function makeTx(status) {
  return { id: 'tx-1', status };
}

function mountSection(props) {
  return mount(DeliverySection, {
    props,
    global: {
      // Stub the inner component to prevent IndexedDB/service calls
      stubs: { DeliverySectionBase: { template: '<div class="delivery-base-stub" />' } },
    },
  });
}

describe('DeliverySection — hidden cases', () => {
  it('renders nothing when listingOffersDelivery is false', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      listingOffersDelivery: false,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(false);
  });

  it('renders nothing when transaction is null', () => {
    const wrapper = mountSection({
      transaction: null,
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(false);
  });

  it('renders nothing for INQUIRY status', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.INQUIRY),
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(false);
  });

  it('renders nothing for COMPLETED status', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.COMPLETED),
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(false);
  });

  it('renders nothing for CANCELED status', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.CANCELED),
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(false);
  });
});

describe('DeliverySection — visible cases', () => {
  it('renders when RESERVED and delivery offered', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.RESERVED),
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(true);
  });

  it('renders when AGREED and delivery offered', () => {
    const wrapper = mountSection({
      transaction: makeTx(TransactionStatus.AGREED),
      listingOffersDelivery: true,
      transactionId: 'tx-1',
      session: SESSION,
    });
    expect(wrapper.find('.delivery-base-stub').exists()).toBe(true);
  });
});
