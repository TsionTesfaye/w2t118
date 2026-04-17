/**
 * AdminDictionaryTab — Component Unit Tests
 *
 * Pure computed-filter component backed by the frozen DATA_DICTIONARY array.
 * No services, no IndexedDB, no mocks — the real dictionary is used in every test.
 *
 * Coverage:
 *   - At least one entity card rendered on mount
 *   - Each card exposes h4 with entity.label and code with entity.store
 *   - Field table headers: Field, Type, Required, Description
 *   - Search filter by entity store name narrows results
 *   - Search filter by field name matches parent entity
 *   - Gibberish search shows EmptyState (no cards)
 *   - Filter is case-insensitive
 *   - Clearing filter restores all entities
 */

import { mount } from '@vue/test-utils';
import AdminDictionaryTab from '../src/views/admin/tabs/AdminDictionaryTab.vue';
import { DATA_DICTIONARY } from '../src/domain/dataDictionary.js';

const SESSION = {
  userId: 'admin-1',
  roles: ['admin'],
  createdAt: Date.now(),
  lastActivityAt: Date.now(),
};

function mountTab() {
  return mount(AdminDictionaryTab, {
    props: { session: SESSION },
  });
}

// ── Initial render ─────────────────────────────────────────────────────────────

describe('AdminDictionaryTab — initial render', () => {
  it('renders at least one entity card on mount', () => {
    const wrapper = mountTab();
    expect(wrapper.findAll('.card').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a card for every entity in DATA_DICTIONARY', () => {
    const wrapper = mountTab();
    // The header card (search bar) plus one card per entity
    // Entity cards contain h4 elements; count those to be safe
    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBe(DATA_DICTIONARY.length);
  });

  it('renders h4 with entity.label for every entity', () => {
    const wrapper = mountTab();
    const h4Texts = wrapper.findAll('h4').map(el => el.text());
    DATA_DICTIONARY.forEach(entity => {
      expect(h4Texts).toContain(entity.label);
    });
  });

  it('renders a code element containing entity.store for every entity', () => {
    const wrapper = mountTab();
    const allText = wrapper.text();
    DATA_DICTIONARY.forEach(entity => {
      expect(allText).toContain(entity.store);
    });
  });

  it('renders the search input with correct placeholder', () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input[type="text"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('placeholder')).toBe('Search entities or fields...');
  });
});

// ── Field table headers ────────────────────────────────────────────────────────

describe('AdminDictionaryTab — field table headers', () => {
  it('renders Field, Type, Required, Description headers on every entity table', () => {
    const wrapper = mountTab();
    const tables = wrapper.findAll('table.data-table');
    expect(tables.length).toBe(DATA_DICTIONARY.length);

    tables.forEach(table => {
      const headerCells = table.findAll('thead th').map(th => th.text());
      expect(headerCells).toContain('Field');
      expect(headerCells).toContain('Type');
      expect(headerCells).toContain('Required');
      expect(headerCells).toContain('Description');
    });
  });

  it('renders exactly four header columns per table', () => {
    const wrapper = mountTab();
    wrapper.findAll('table.data-table').forEach(table => {
      expect(table.findAll('thead th').length).toBe(4);
    });
  });
});

// ── Entity card structure ──────────────────────────────────────────────────────

describe('AdminDictionaryTab — entity card structure', () => {
  it('renders entity description text in each card', () => {
    const wrapper = mountTab();
    const allText = wrapper.text();
    // Spot-check a few entity descriptions
    expect(allText).toContain(DATA_DICTIONARY[0].description.slice(0, 20));
    expect(allText).toContain(DATA_DICTIONARY[2].description.slice(0, 20));
  });

  it('renders at least one table row per entity field', () => {
    const wrapper = mountTab();
    const tables = wrapper.findAll('table.data-table');
    tables.forEach((table, idx) => {
      const entity = DATA_DICTIONARY[idx];
      const bodyRows = table.findAll('tbody tr');
      expect(bodyRows.length).toBe(entity.fields.length);
    });
  });

  it('shows field names in code elements within each table', () => {
    const wrapper = mountTab();
    // Spot-check the first entity (users) — "username" should appear
    const firstTable = wrapper.findAll('table.data-table')[0];
    const codeCells = firstTable.findAll('td code').map(c => c.text());
    expect(codeCells).toContain('username');
    expect(codeCells).toContain('id');
  });
});

// ── Search filter by entity store / label ─────────────────────────────────────

describe('AdminDictionaryTab — search filter (entity name)', () => {
  it('narrows cards when typing a known store name ("sensitiveWords")', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('sensitiveWords');
    await wrapper.vm.$nextTick();

    // Only the "sensitiveWords" entity should match by store name
    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBe(1);
    expect(h4s[0].text()).toBe('Sensitive Words');
  });

  it('narrows cards when typing a known label word ("sessions")', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('sessions');
    await wrapper.vm.$nextTick();

    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBeGreaterThanOrEqual(1);
    const labelTexts = h4s.map(h => h.text());
    expect(labelTexts.some(t => t.toLowerCase().includes('session'))).toBe(true);
  });

  it('matches by entity description content', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    // "PBKDF2" appears only in the users entity description
    await input.setValue('PBKDF2');
    await wrapper.vm.$nextTick();

    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBe(1);
    expect(h4s[0].text()).toBe('Users');
  });
});

// ── Search filter by field name ────────────────────────────────────────────────

describe('AdminDictionaryTab — search filter (field name)', () => {
  it('shows entities that have a field named "username"', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('username');
    await wrapper.vm.$nextTick();

    // "username" is a field in the users entity
    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBeGreaterThanOrEqual(1);
    const labelTexts = h4s.map(h => h.text());
    expect(labelTexts).toContain('Users');
  });

  it('shows entities that have a field named "threadId"', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('threadId');
    await wrapper.vm.$nextTick();

    // threadId is a field on messages and transactions (at minimum)
    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBeGreaterThanOrEqual(1);
  });

  it('matches field description text', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    // "RBAC" appears in the roles field description of the users entity
    await input.setValue('RBAC');
    await wrapper.vm.$nextTick();

    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBeGreaterThanOrEqual(1);
    expect(h4s.map(h => h.text())).toContain('Users');
  });
});

// ── Gibberish → EmptyState ─────────────────────────────────────────────────────

describe('AdminDictionaryTab — empty state', () => {
  it('shows EmptyState when filter matches nothing', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('zzz_no_match_xyzzy_9999');
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);
  });

  it('shows no entity cards when filter matches nothing', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('absolutely_no_entity_like_this');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('h4').length).toBe(0);
  });

  it('EmptyState has expected title text', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('zzznomatch');
    await wrapper.vm.$nextTick();

    const emptyState = wrapper.findComponent({ name: 'EmptyState' });
    expect(emptyState.exists()).toBe(true);
    expect(emptyState.text()).toContain('No matches');
  });
});

// ── Case-insensitive filter ────────────────────────────────────────────────────

describe('AdminDictionaryTab — case-insensitive filter', () => {
  it('matches entity store in uppercase ("USERS")', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('USERS');
    await wrapper.vm.$nextTick();

    const h4s = wrapper.findAll('h4');
    expect(h4s.length).toBeGreaterThanOrEqual(1);
    expect(h4s.map(h => h.text())).toContain('Users');
  });

  it('matches entity label in mixed case ("LiStInGs")', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('LiStInGs');
    await wrapper.vm.$nextTick();

    const labelTexts = wrapper.findAll('h4').map(h => h.text());
    expect(labelTexts.some(t => t.toLowerCase().includes('listing'))).toBe(true);
  });

  it('matches field name in uppercase ("USERNAME")', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');
    await input.setValue('USERNAME');
    await wrapper.vm.$nextTick();

    const h4s = wrapper.findAll('h4');
    expect(h4s.map(h => h.text())).toContain('Users');
  });
});

// ── Clearing filter restores all entities ─────────────────────────────────────

describe('AdminDictionaryTab — clearing filter', () => {
  it('restores all entity cards after clearing a filter', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');

    // Narrow first — "sensitiveWords" uniquely matches a single entity
    await input.setValue('sensitiveWords');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('h4').length).toBe(1);

    // Clear
    await input.setValue('');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('h4').length).toBe(DATA_DICTIONARY.length);
  });

  it('hides EmptyState after clearing a gibberish filter', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');

    await input.setValue('zzznomatch');
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(true);

    await input.setValue('');
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'EmptyState' }).exists()).toBe(false);
  });

  it('restores exactly DATA_DICTIONARY.length cards when input cleared', async () => {
    const wrapper = mountTab();
    const input = wrapper.find('input.form-input');

    await input.setValue('transactions');
    await wrapper.vm.$nextTick();
    const narrowed = wrapper.findAll('h4').length;
    expect(narrowed).toBeLessThan(DATA_DICTIONARY.length);

    await input.setValue('');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('h4').length).toBe(DATA_DICTIONARY.length);
  });
});
