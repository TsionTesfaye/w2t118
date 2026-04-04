import { BaseRepository } from './BaseRepository.js';

export class BlockRepository extends BaseRepository {
  constructor() {
    super('blocks');
  }

  async getByBlockerId(blockerId) {
    return this.getByIndex('blockerId', blockerId);
  }

  async getByBlockedId(blockedId) {
    return this.getByIndex('blockedId', blockedId);
  }

  /**
   * Check if blockerId has blocked blockedId.
   */
  async isBlocked(blockerId, blockedId) {
    const blocks = await this.getByBlockerId(blockerId);
    return blocks.some(b => b.blockedId === blockedId);
  }

  /**
   * Check if either user has blocked the other.
   */
  async isEitherBlocked(userId1, userId2) {
    const [blocked1, blocked2] = await Promise.all([
      this.isBlocked(userId1, userId2),
      this.isBlocked(userId2, userId1),
    ]);
    return blocked1 || blocked2;
  }
}

export const blockRepository = new BlockRepository();
