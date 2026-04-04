import { BaseRepository } from './BaseRepository.js';

export class SensitiveWordRepository extends BaseRepository {
  constructor() {
    super('sensitiveWords');
  }

  async getByWord(word) {
    return this.getOneByIndex('word', word);
  }
}

export const sensitiveWordRepository = new SensitiveWordRepository();
