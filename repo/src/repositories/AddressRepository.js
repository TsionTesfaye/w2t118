import { BaseRepository } from './BaseRepository.js';

export class AddressRepository extends BaseRepository {
  constructor() {
    super('addresses');
  }

  async getByUserId(userId) {
    return this.getByIndex('userId', userId);
  }
}

export const addressRepository = new AddressRepository();
