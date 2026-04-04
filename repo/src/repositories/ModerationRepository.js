import { BaseRepository } from './BaseRepository.js';

export class ModerationCaseRepository extends BaseRepository {
  constructor() {
    super('moderationCases');
  }

  async getByContentId(contentId) {
    return this.getByIndex('contentId', contentId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export const moderationCaseRepository = new ModerationCaseRepository();
