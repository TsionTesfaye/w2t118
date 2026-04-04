import { BaseRepository } from './BaseRepository.js';

export class ComplaintRepository extends BaseRepository {
  constructor() {
    super('complaints');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }

  async getByTransactionId(transactionId) {
    return this.getByIndex('transactionId', transactionId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export const complaintRepository = new ComplaintRepository();
