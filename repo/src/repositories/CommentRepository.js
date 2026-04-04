import { BaseRepository } from './BaseRepository.js';

export class CommentRepository extends BaseRepository {
  constructor() {
    super('comments');
  }

  async getByListingId(listingId) {
    return this.getByIndex('listingId', listingId);
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }
}

export const commentRepository = new CommentRepository();
