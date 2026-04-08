<template>
  <div class="card">
    <h3>Transaction</h3>

    <div v-if="!transaction">
      <p>No transaction started.</p>
      <button
        v-if="isBuyer"
        class="btn btn-primary"
        :disabled="actionLoading"
        @click="$emit('create-transaction')"
      >
        Start Transaction
      </button>
    </div>

    <div v-else>
      <div class="transaction-status-row">
        <StatusBadge :status="transaction.status" />
        <span v-if="isReservationExpired" class="badge badge-danger">Expired</span>
      </div>

      <!-- Reservation Timer -->
      <div
        v-if="transaction.status === TransactionStatus.RESERVED && !isReservationExpired"
        class="timer"
      >
        Time remaining: {{ reservationCountdown }}
      </div>

      <!-- State Actions — visibility derived from central action policy -->
      <div class="transaction-actions">
        <!-- INQUIRY -> RESERVED: seller only -->
        <button
          v-if="txActions.canReserve && !isReservationExpired"
          class="btn btn-primary"
          :disabled="actionLoading"
          @click="$emit('transition', TransactionStatus.RESERVED)"
        >
          Reserve
        </button>

        <!-- RESERVED -> AGREED: buyer only -->
        <button
          v-if="txActions.canAgree && !isReservationExpired"
          class="btn btn-primary"
          :disabled="actionLoading"
          @click="$emit('transition', TransactionStatus.AGREED)"
        >
          Agree
        </button>

        <!-- AGREED -> COMPLETED: buyer only -->
        <button
          v-if="txActions.canComplete"
          class="btn btn-primary"
          :disabled="actionLoading"
          @click="$emit('transition', TransactionStatus.COMPLETED)"
        >
          Complete
        </button>

        <!-- CANCEL: either participant, any non-terminal state -->
        <button
          v-if="txActions.canCancel"
          class="btn btn-danger"
          :disabled="actionLoading"
          @click="showCancelModal = true"
        >
          Cancel
        </button>
      </div>

      <!-- Terminal state message -->
      <div v-if="isTerminal" class="alert-info">
        This transaction is {{ transaction.status }}.
        <span v-if="transaction.cancellationReason">
          Reason: {{ transaction.cancellationReason }}
        </span>
      </div>

      <!-- Complaint Section -->
      <slot name="complaint" />

      <!-- Delivery Section -->
      <slot name="delivery" />
    </div>
  </div>

  <!-- Cancel Transaction Modal -->
  <AppModal v-model="showCancelModal" title="Cancel Transaction" max-width="480px">
    <div class="form-group">
      <label class="form-label">Reason</label>
      <select v-model="cancelReason" class="form-select">
        <option value="">Select a reason</option>
        <option
          v-for="(value, key) in CancellationReasons"
          :key="key"
          :value="value"
        >
          {{ key.replace(/_/g, ' ') }}
        </option>
      </select>
    </div>
    <template #footer>
      <button type="button" class="btn btn-secondary" @click="showCancelModal = false">Back</button>
      <button type="button" class="btn btn-danger" :disabled="!cancelReason || actionLoading" @click="handleCancel">
        Cancel Transaction
      </button>
    </template>
  </AppModal>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { TransactionStatus, CancellationReasons, TRANSACTION_TERMINAL_STATES } from '../../../domain/enums/statuses.js';
import { getTransactionActions } from '../../../domain/policies/actionPolicy.js';
import { THIRTY_MINUTES_MS } from '../../../utils/time.js';
import StatusBadge from '../../../components/StatusBadge.vue';
import AppModal from '../../../components/AppModal.vue';

const props = defineProps({
  transaction: { type: Object, default: null },
  currentUserId: { type: String, required: true },
  isBuyer: { type: Boolean, required: true },
  actionLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['create-transaction', 'transition', 'cancel', 'reservation-expired']);

// Cancel modal state
const showCancelModal = ref(false);
const cancelReason = ref('');

// Countdown timer
const countdownSeconds = ref(0);
let countdownInterval = null;

const isTerminal = computed(() => {
  if (!props.transaction) return false;
  return TRANSACTION_TERMINAL_STATES.includes(props.transaction.status);
});

const isReservationExpired = computed(() => {
  if (!props.transaction) return false;
  if (props.transaction.status !== TransactionStatus.RESERVED) return false;
  if (!props.transaction.reservedAt) return false;
  return Date.now() - props.transaction.reservedAt > THIRTY_MINUTES_MS;
});

const txActions = computed(() => getTransactionActions(props.currentUserId, props.transaction));

const reservationCountdown = computed(() => {
  const secs = countdownSeconds.value;
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
});

function updateCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  if (
    !props.transaction ||
    props.transaction.status !== TransactionStatus.RESERVED ||
    !props.transaction.reservedAt
  ) {
    countdownSeconds.value = 0;
    return;
  }

  const tick = () => {
    const elapsed = Date.now() - props.transaction.reservedAt;
    const remaining = Math.max(0, Math.floor((THIRTY_MINUTES_MS - elapsed) / 1000));
    countdownSeconds.value = remaining;
    if (remaining <= 0 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      emit('reservation-expired');
    }
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

// Start / restart countdown whenever transaction changes
watch(() => props.transaction, updateCountdown, { immediate: true, deep: true });

onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
});

function handleCancel() {
  if (!cancelReason.value) return;
  emit('cancel', cancelReason.value);
  showCancelModal.value = false;
  cancelReason.value = '';
}
</script>
