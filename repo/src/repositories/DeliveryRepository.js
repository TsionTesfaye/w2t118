import { BaseRepository } from './BaseRepository.js';

export class DeliveryBookingRepository extends BaseRepository {
  constructor() {
    super('deliveryBookings');
  }

  async getByWindowKey(windowKey) {
    return this.getByIndex('windowKey', windowKey);
  }

  async getByTransactionId(transactionId) {
    return this.getOneByIndex('transactionId', transactionId);
  }
}

export class CoverageZipRepository extends BaseRepository {
  constructor() {
    super('coverageZips');
  }

  async getByPrefix(prefix) {
    return this.getOneByIndex('prefix', prefix);
  }
}

export const deliveryBookingRepository = new DeliveryBookingRepository();
export const coverageZipRepository = new CoverageZipRepository();
