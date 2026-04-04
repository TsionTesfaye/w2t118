import { BaseRepository } from './BaseRepository.js';

/**
 * Audit Log Repository — append-only by design.
 * Delete is overridden to prevent removal.
 */
export class AuditLogRepository extends BaseRepository {
  constructor() {
    super('auditLogs');
  }

  async delete() {
    throw new Error('Audit logs cannot be deleted');
  }

  async clear() {
    throw new Error('Audit logs cannot be cleared');
  }

  async getByActorId(actorId) {
    return this.getByIndex('actorId', actorId);
  }

  async getByAction(action) {
    return this.getByIndex('action', action);
  }

  async getByEntityType(entityType) {
    return this.getByIndex('entityType', entityType);
  }
}

export const auditLogRepository = new AuditLogRepository();
