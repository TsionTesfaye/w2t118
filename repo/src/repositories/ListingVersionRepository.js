import { BaseRepository } from './BaseRepository.js';

export class ListingVersionRepository extends BaseRepository {
  constructor() {
    super('listingVersions');
  }

  async getByListingId(listingId) {
    return this.getByIndex('listingId', listingId);
  }
}

export const listingVersionRepository = new ListingVersionRepository();
