import { BaseRepository } from './BaseRepository.js';

export class ReportRepository extends BaseRepository {
  constructor() {
    super('reports');
  }

  async getByTargetId(targetId) {
    return this.getByIndex('targetId', targetId);
  }

  async getByReporterId(reporterId) {
    return this.getByIndex('reporterId', reporterId);
  }

  async getByStatus(status) {
    return this.getByIndex('status', status);
  }
}

export const reportRepository = new ReportRepository();
