<template>
  <span :class="['badge', badgeClass]">{{ label }}</span>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({ status: String });

const MAP = {
  inquiry: { label: 'Inquiry', cls: 'badge-info' },
  reserved: { label: 'Reserved', cls: 'badge-warning' },
  agreed: { label: 'Agreed', cls: 'badge-primary' },
  completed: { label: 'Completed', cls: 'badge-success' },
  canceled: { label: 'Canceled', cls: 'badge-danger' },
  draft: { label: 'Draft', cls: 'badge-neutral' },
  active: { label: 'Active', cls: 'badge-success' },
  under_review: { label: 'Under Review', cls: 'badge-warning' },
  rejected: { label: 'Rejected', cls: 'badge-danger' },
  sold: { label: 'Sold', cls: 'badge-neutral' },
  archived: { label: 'Archived', cls: 'badge-neutral' },
  open: { label: 'Open', cls: 'badge-info' },
  investigating: { label: 'Investigating', cls: 'badge-warning' },
  resolved: { label: 'Resolved', cls: 'badge-success' },
  dismissed: { label: 'Dismissed', cls: 'badge-neutral' },
  pending: { label: 'Pending', cls: 'badge-warning' },
  in_review: { label: 'In Review', cls: 'badge-warning' },
  approved: { label: 'Approved', cls: 'badge-success' },
  requested: { label: 'Requested', cls: 'badge-info' },
};

const entry = computed(() => MAP[props.status] || { label: props.status, cls: 'badge-neutral' });
const label = computed(() => entry.value.label);
const badgeClass = computed(() => entry.value.cls);
</script>
