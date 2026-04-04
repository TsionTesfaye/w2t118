import { BaseRepository } from './BaseRepository.js';

export class ListingRepository extends BaseRepository {
  constructor() {
    super('listings');
  }

  async getBySellerId(sellerId) {
    return this.getByIndex('sellerId', sellerId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }

  async getByCategoryId(categoryId) {
    return this.getByIndex('categoryId', categoryId);
  }
}

export const listingRepository = new ListingRepository();
