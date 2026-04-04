import { BaseRepository } from './BaseRepository.js';

export class TransactionRepository extends BaseRepository {
  constructor() {
    super('transactions');
  }

  async getByListingId(listingId) {
    return this.getByIndex('listingId', listingId);
  }

  async getByBuyerId(buyerId) {
    return this.getByIndex('buyerId', buyerId);
  }

  async getBySellerId(sellerId) {
    return this.getByIndex('sellerId', sellerId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }

  async getByThreadId(threadId) {
    return this.getOneByIndex('threadId', threadId);
  }
}

export const transactionRepository = new TransactionRepository();
