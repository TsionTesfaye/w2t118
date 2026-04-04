import { BaseRepository } from './BaseRepository.js';

export class SessionRepository extends BaseRepository {
  constructor() {
    super('sessions');
  }
}

export const sessionRepository = new SessionRepository();
