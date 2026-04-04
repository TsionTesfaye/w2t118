import { BaseRepository } from './BaseRepository.js';

export class ThreadRepository extends BaseRepository {
  constructor() {
    super('threads');
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
}

export const threadRepository = new ThreadRepository();
