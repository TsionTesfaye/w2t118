/**
 * Transaction Store — centralized transaction list for the current user.
 * Replaces view-local state in UserCenterView.
 */

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { TransactionService } from '../../services/TransactionService.js';

export const useTransactionStore = defineStore('transactions', () => {
  const transactions = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchForUser(session) {
    if (!session) return;
    loading.value = true;
    error.value = null;
    try {
      const data = await TransactionService.getMyTransactions(session);
      transactions.value = data.sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      error.value = e.message || 'Failed to load transactions';
      transactions.value = [];
    } finally {
      loading.value = false;
    }
  }

  function reset() {
    transactions.value = [];
    loading.value = false;
    error.value = null;
  }

  return { transactions, loading, error, fetchForUser, reset };
});
