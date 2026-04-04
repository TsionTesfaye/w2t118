import { BaseRepository } from './BaseRepository.js';

export class NotificationRepository extends BaseRepository {
  constructor() {
    super('notifications');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }

  async getUnreadByUserId(userId) {
    const all = await this.getByIndex('userId', userId);
    return all.filter(n => !n.isRead);
  }

  async countUnreadByUserId(userId) {
    const unread = await this.getUnreadByUserId(userId);
    return unread.length;
  }

  /** Find an existing unread notification for a specific event (for deduplication). */
  async findUnread(userId, type, referenceId) {
    const unread = await this.getUnreadByUserId(userId);
    return unread.find(n => n.type === type && n.referenceId === referenceId) || null;
  }
}

export const notificationRepository = new NotificationRepository();
