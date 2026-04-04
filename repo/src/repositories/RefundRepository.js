import { BaseRepository } from './BaseRepository.js';

export class RefundRepository extends BaseRepository {
  constructor() {
    super('refunds');
  }

  async getByComplaintId(complaintId) {
    return this.getOneByIndex('complaintId', complaintId);
  }

  async getByTransactionId(transactionId) {
    return this.getByIndex('transactionId', transactionId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export const refundRepository = new RefundRepository();
