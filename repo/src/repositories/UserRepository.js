import { BaseRepository } from './BaseRepository.js';

export class UserRepository extends BaseRepository {
  constructor() {
    super('users');
  }

  async getByUsername(username) {
    return this.getOneByIndex('username', username);
  }
}

export const userRepository = new UserRepository();
