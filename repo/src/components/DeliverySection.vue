<template>
  <div class="delivery-section">
    <h4>Delivery</h4>

    <div class="form-group">
      <label class="form-label">ZIP Code</label>
      <div class="zip-check-row">
        <input
          v-model="zipCode"
          type="text"
          class="form-input"
          placeholder="12345"
          maxlength="5"
        />
        <button
          class="btn btn-secondary"
          :disabled="!zipCode || zipCode.length !== 5"
          @click="handleCheckCoverage"
        >
          Check Coverage
        </button>
      </div>
      <p v-if="coverageChecked" :class="zipCovered ? 'alert-success' : 'alert-danger'">
        {{ zipCovered ? 'ZIP code is covered.' : 'ZIP code is not in the service area.' }}
      </p>
    </div>

    <div class="form-group">
      <label class="form-label">Delivery Date</label>
      <input
        v-model="deliveryDate"
        type="date"
        class="form-input"
        @change="handleFetchWindows"
      />
    </div>

    <div v-if="availableWindows.length > 0" class="window-grid">
      <div
        v-for="win in availableWindows"
        :key="win.windowKey"
        :class="['window-slot', { selected: selectedWindow === win.windowKey, full: win.isFull }]"
        @click="!win.isFull && (selectedWindow = win.windowKey)"
      >
        <span class="window-time">{{ win.label }}</span>
        <span class="window-slots">
          {{ win.isFull ? 'Full' : `${win.availableSlots} available` }}
        </span>
      </div>
    </div>

    <button
      v-if="selectedWindow && zipCovered"
      class="btn btn-primary"
      :disabled="actionLoading"
      @click="handleBookDelivery"
    >
      Book Delivery
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { DeliveryService } from '../services/DeliveryService.js';
import { useToast } from '../composables/useToast.js';

const props = defineProps({
  transactionId: { type: String, required: true },
  session:        { type: Object, required: true },
});

const emit = defineEmits(['booked']);

const toast = useToast();

const zipCode          = ref('');
const zipCovered       = ref(false);
const coverageChecked  = ref(false);
const deliveryDate     = ref('');
const availableWindows = ref([]);
const selectedWindow   = ref(null);
const actionLoading    = ref(false);

async function handleCheckCoverage() {
  try {
    zipCovered.value     = await DeliveryService.isZipCovered(zipCode.value);
    coverageChecked.value = true;
  } catch (err) {
    toast.error(err.message || 'Failed to check coverage');
  }
}

async function handleFetchWindows() {
  if (!deliveryDate.value) return;
  try {
    availableWindows.value = await DeliveryService.getAvailableWindows(
      props.session,
      deliveryDate.value,
    );
    selectedWindow.value = null;
  } catch (err) {
    toast.error(err.message || 'Failed to load delivery windows');
  }
}

async function handleBookDelivery() {
  if (!selectedWindow.value || !zipCovered.value) return;

  actionLoading.value = true;
  try {
    await DeliveryService.bookDelivery(props.session, {
      transactionId: props.transactionId,
      windowKey:     selectedWindow.value,
      zipCode:       zipCode.value,
    });
    toast.success('Delivery booked successfully.');
    selectedWindow.value = null;
    emit('booked');
  } catch (err) {
    toast.error(err.message || 'Failed to book delivery');
  } finally {
    actionLoading.value = false;
  }
}
</script>
