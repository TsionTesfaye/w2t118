/**
 * ListingDescription — Component Unit Tests
 *
 * Pure presentational component: receives `listing` + `categoryName` props
 * and renders price, category, delivery options, description, and tags.
 * No stores, no router, no async calls.
 */

import { mount } from '@vue/test-utils';
import ListingDescription from '../src/views/marketplace/components/ListingDescription.vue';

function mountDesc(listing, categoryName = 'Electronics') {
  return mount(ListingDescription, {
    props: { listing, categoryName },
  });
}

function makeListing(overrides = {}) {
  return {
    price: 99.99,
    description: '<p>A great item</p>',
    categoryId: 'cat-1',
    deliveryOptions: { pickup: true, delivery: false },
    tagIds: [],
    ...overrides,
  };
}

describe('ListingDescription', () => {
  it('renders the card root element', () => {
    const wrapper = mountDesc(makeListing());
    expect(wrapper.find('.card').exists()).toBe(true);
  });

  it('renders the formatted price', () => {
    const wrapper = mountDesc(makeListing({ price: 49.99 }));
    expect(wrapper.text()).toContain('49.99');
  });

  it('renders the category name', () => {
    const wrapper = mountDesc(makeListing(), 'Books & Media');
    expect(wrapper.text()).toContain('Books & Media');
  });

  it('shows "Pickup" when pickup is true', () => {
    const wrapper = mountDesc(makeListing({ deliveryOptions: { pickup: true, delivery: false } }));
    expect(wrapper.text()).toContain('Pickup');
  });

  it('does not show "Pickup" when pickup is false', () => {
    const wrapper = mountDesc(makeListing({ deliveryOptions: { pickup: false, delivery: true } }));
    expect(wrapper.text()).not.toContain('Pickup');
  });

  it('shows "Delivery" when delivery is true', () => {
    const wrapper = mountDesc(makeListing({ deliveryOptions: { pickup: false, delivery: true } }));
    expect(wrapper.text()).toContain('Delivery');
  });

  it('shows both Pickup and Delivery when both are true', () => {
    const wrapper = mountDesc(makeListing({ deliveryOptions: { pickup: true, delivery: true } }));
    expect(wrapper.text()).toContain('Pickup');
    expect(wrapper.text()).toContain('Delivery');
  });

  it('renders description HTML via v-html', () => {
    const wrapper = mountDesc(makeListing({ description: '<b>Bold description</b>' }));
    expect(wrapper.find('.listing-description b').exists()).toBe(true);
  });

  it('does not render tags section when tagIds is empty', () => {
    const wrapper = mountDesc(makeListing({ tagIds: [] }));
    expect(wrapper.find('.listing-tags').exists()).toBe(false);
  });

  it('renders tag badges when tagIds are present', () => {
    const wrapper = mountDesc(makeListing({ tagIds: ['vintage', 'rare'] }));
    expect(wrapper.find('.listing-tags').exists()).toBe(true);
    const badges = wrapper.findAll('.badge-neutral');
    expect(badges).toHaveLength(2);
    expect(badges[0].text()).toBe('vintage');
    expect(badges[1].text()).toBe('rare');
  });
});
