<template>
  <DeliverySectionBase
    v-if="visible"
    :transaction-id="transactionId"
    :session="session"
    @booked="$emit('booked')"
  />
</template>

<script setup>
import { computed } from 'vue';
import { TransactionStatus } from '../../../domain/enums/statuses.js';
import DeliverySectionBase from '../../../components/DeliverySection.vue';

const props = defineProps({
  transaction: { type: Object, default: null },
  listingOffersDelivery: { type: Boolean, default: false },
  transactionId: { type: String, default: null },
  session: { type: Object, required: true },
});

defineEmits(['booked']);

const visible = computed(() => {
  if (!props.listingOffersDelivery || !props.transaction) return false;
  return (
    props.transaction.status === TransactionStatus.RESERVED ||
    props.transaction.status === TransactionStatus.AGREED
  );
});
</script>
