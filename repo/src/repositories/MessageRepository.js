import { BaseRepository } from './BaseRepository.js';

export class MessageRepository extends BaseRepository {
  constructor() {
    super('messages');
  }

  async getByThreadId(threadId) {
    return this.getByIndex('threadId', threadId);
  }
}

export const messageRepository = new MessageRepository();
