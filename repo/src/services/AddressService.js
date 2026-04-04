/**
 * Address Service — CRUD with default address enforcement and US validation.
 */

import { addressRepository } from '../repositories/index.js';
import { requirePermission, requireOwnership } from '../domain/policies/permissionGuard.js';
import { validateSession } from '../domain/policies/sessionPolicy.js';
import { Permissions } from '../domain/enums/permissions.js';
import { validateAddress } from '../domain/validation/rules.js';
import { formatPhone } from '../utils/formatting.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

export const AddressService = {
  /**
   * Create a new address.
   */
  async create(session, addressData) {
    validateSession(session);
    requirePermission(session, Permissions.ADDRESS_CREATE);

    validateAddress(addressData);

    // Format phone
    const phone = addressData.phone ? formatPhone(addressData.phone) : null;

    const address = {
      id: generateId(),
      userId: session.userId,
      street: addressData.street.trim(),
      street2: addressData.street2 ? addressData.street2.trim() : null,
      city: addressData.city.trim(),
      state: addressData.state.toUpperCase(),
      zipCode: addressData.zipCode,
      phone,
      isDefault: !!addressData.isDefault,
      createdAt: now(),
      updatedAt: now(),
    };

    // If setting as default, unset any existing default
    if (address.isDefault) {
      await this._clearDefaultForUser(session.userId);
    }

    // If this is the first address, force it as default
    const existing = await addressRepository.getByUserId(session.userId);
    if (existing.length === 0) {
      address.isDefault = true;
    }

    await addressRepository.create(address);
    return address;
  },

  /**
   * Update an address.
   */
  async update(session, addressId, updates) {
    validateSession(session);
    requirePermission(session, Permissions.ADDRESS_EDIT);

    const address = await addressRepository.getByIdOrFail(addressId);
    requireOwnership(session, address.userId);

    // Validate the full merged address
    const merged = { ...address, ...updates };
    validateAddress(merged);

    // Apply updates
    if (updates.street !== undefined) address.street = updates.street.trim();
    if (updates.street2 !== undefined) address.street2 = updates.street2 ? updates.street2.trim() : null;
    if (updates.city !== undefined) address.city = updates.city.trim();
    if (updates.state !== undefined) address.state = updates.state.toUpperCase();
    if (updates.zipCode !== undefined) address.zipCode = updates.zipCode;
    if (updates.phone !== undefined) address.phone = updates.phone ? formatPhone(updates.phone) : null;

    if (updates.isDefault === true && !address.isDefault) {
      await this._clearDefaultForUser(session.userId);
      address.isDefault = true;
    }

    address.updatedAt = now();
    await addressRepository.update(address);
    return address;
  },

  /**
   * Delete an address.
   */
  async delete(session, addressId) {
    validateSession(session);
    requirePermission(session, Permissions.ADDRESS_DELETE);

    const address = await addressRepository.getByIdOrFail(addressId);
    requireOwnership(session, address.userId);

    await addressRepository.delete(addressId);

    // If deleted address was default, assign new default to first remaining
    if (address.isDefault) {
      const remaining = await addressRepository.getByUserId(session.userId);
      if (remaining.length > 0) {
        remaining[0].isDefault = true;
        remaining[0].updatedAt = now();
        await addressRepository.update(remaining[0]);
      }
    }
  },

  /**
   * Get all addresses for current user.
   */
  async getMyAddresses(session) {
    validateSession(session);
    requirePermission(session, Permissions.ADDRESS_VIEW);
    return addressRepository.getByUserId(session.userId);
  },

  /**
   * Get default address for a user.
   */
  async getDefaultAddress(session) {
    validateSession(session);
    const addresses = await addressRepository.getByUserId(session.userId);
    return addresses.find(a => a.isDefault) || null;
  },

  /**
   * Set an address as default.
   */
  async setDefault(session, addressId) {
    validateSession(session);
    requirePermission(session, Permissions.ADDRESS_EDIT);

    const address = await addressRepository.getByIdOrFail(addressId);
    requireOwnership(session, address.userId);

    await this._clearDefaultForUser(session.userId);
    address.isDefault = true;
    address.updatedAt = now();
    await addressRepository.update(address);
    return address;
  },

  // ── Private ──

  async _clearDefaultForUser(userId) {
    const addresses = await addressRepository.getByUserId(userId);
    for (const addr of addresses) {
      if (addr.isDefault) {
        addr.isDefault = false;
        addr.updatedAt = now();
        await addressRepository.update(addr);
      }
    }
  },
};
