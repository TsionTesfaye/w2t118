<template>
  <div>
    <div class="card" style="margin-bottom: 1rem;">
      <div class="card-header">
        <h3>Data Dictionary</h3>
        <input
          v-model="dictFilter"
          type="text"
          class="form-input"
          placeholder="Search entities or fields..."
          style="max-width: 260px;"
        />
      </div>
    </div>

    <div
      v-for="entity in filteredDictionary"
      :key="entity.store"
      class="card"
      style="margin-bottom: 1.25rem;"
    >
      <div class="card-header" style="display: flex; align-items: baseline; gap: 0.75rem;">
        <h4 style="margin: 0;">{{ entity.label }}</h4>
        <code style="font-size: 0.8rem; color: var(--text-muted);">{{ entity.store }}</code>
      </div>
      <p style="padding: 0 1rem 0.5rem; color: var(--text-muted); font-size: 0.9rem;">{{ entity.description }}</p>
      <div class="table-wrap" style="padding: 0 1rem 1rem;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="field in entity.fields" :key="field.name">
              <td><code>{{ field.name }}</code></td>
              <td><em style="font-size: 0.85rem;">{{ field.type }}</em></td>
              <td>{{ field.required ? '✓' : '' }}</td>
              <td style="font-size: 0.9rem;">{{ field.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <EmptyState
      v-if="filteredDictionary.length === 0"
      title="No matches"
      message="No entities or fields match your search."
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { DATA_DICTIONARY } from '../../../domain/dataDictionary.js';
import EmptyState from '../../../components/EmptyState.vue';

defineProps({
  session: { type: Object, required: true },
});

const dictFilter = ref('');
const filteredDictionary = computed(() => {
  const q = dictFilter.value.toLowerCase().trim();
  if (!q) return DATA_DICTIONARY;
  return DATA_DICTIONARY.filter(entity =>
    entity.store.toLowerCase().includes(q) ||
    entity.label.toLowerCase().includes(q) ||
    entity.description.toLowerCase().includes(q) ||
    entity.fields.some(f =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q)
    )
  );
});
</script>
