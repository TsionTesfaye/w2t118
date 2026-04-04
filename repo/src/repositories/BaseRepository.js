/**
 * Base Repository — generic IndexedDB CRUD abstraction.
 * All domain-specific repositories extend this.
 * NO business logic here — only data access.
 */

import { getDatabase } from './database.js';
import { NotFoundError, AppError } from '../utils/errors.js';

export class BaseRepository {
  /**
   * @param {string} storeName - IndexedDB object store name
   */
  constructor(storeName) {
    this.storeName = storeName;
  }

  /**
   * Get a read/write transaction for this store.
   */
  async _getStore(mode = 'readonly') {
    const db = await getDatabase();
    const tx = db.transaction(this.storeName, mode);
    return tx.objectStore(this.storeName);
  }

  /**
   * Wrap an IDBRequest in a Promise.
   */
  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new AppError('DB_ERROR', `Database error: ${request.error}`));
    });
  }

  /**
   * Wait for a transaction to complete.
   */
  _waitForTransaction(store) {
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = (e) => reject(new AppError('DB_ERROR', `Transaction failed: ${e.target.error}`));
      store.transaction.onabort = (e) => reject(new AppError('DB_ERROR', `Transaction aborted: ${e.target.error}`));
    });
  }

  /**
   * Get a record by primary key.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getById(id) {
    const store = await this._getStore('readonly');
    return this._promisify(store.get(id));
  }

  /**
   * Get a record by primary key, throw if not found.
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async getByIdOrFail(id) {
    const result = await this.getById(id);
    if (!result) {
      throw new NotFoundError(this.storeName, id);
    }
    return result;
  }

  /**
   * Get all records in the store.
   * @returns {Promise<Array<Object>>}
   */
  async getAll() {
    const store = await this._getStore('readonly');
    return this._promisify(store.getAll());
  }

  /**
   * Get records by an index value.
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<Array<Object>>}
   */
  async getByIndex(indexName, value) {
    const store = await this._getStore('readonly');
    const index = store.index(indexName);
    return this._promisify(index.getAll(value));
  }

  /**
   * Get a single record by an index value.
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<Object|null>}
   */
  async getOneByIndex(indexName, value) {
    const store = await this._getStore('readonly');
    const index = store.index(indexName);
    return this._promisify(index.get(value));
  }

  /**
   * Strip Vue reactive proxies (and any non-cloneable wrappers) from a record
   * before handing it to IndexedDB's Structured Clone Algorithm.
   * JSON round-trip is safe for all our data types (strings, numbers, plain
   * objects, arrays) and reliably unwraps Proxy objects.
   */
  _serialize(record) {
    return JSON.parse(JSON.stringify(record));
  }

  /**
   * Create a new record (put = create or overwrite).
   * @param {Object} record
   * @returns {Promise<Object>} The stored record
   */
  async create(record) {
    const store = await this._getStore('readwrite');
    const txComplete = this._waitForTransaction(store);
    store.add(this._serialize(record));
    await txComplete;
    return record;
  }

  /**
   * Update an existing record.
   * @param {Object} record - Must include the primary key
   * @returns {Promise<Object>}
   */
  async update(record) {
    const store = await this._getStore('readwrite');
    const txComplete = this._waitForTransaction(store);
    store.put(this._serialize(record));
    await txComplete;
    return record;
  }

  /**
   * Delete a record by primary key.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    const store = await this._getStore('readwrite');
    const txComplete = this._waitForTransaction(store);
    store.delete(id);
    await txComplete;
  }

  /**
   * Count all records.
   * @returns {Promise<number>}
   */
  async count() {
    const store = await this._getStore('readonly');
    return this._promisify(store.count());
  }

  /**
   * Count records by index value.
   * @param {string} indexName
   * @param {*} value
   * @returns {Promise<number>}
   */
  async countByIndex(indexName, value) {
    const store = await this._getStore('readonly');
    const index = store.index(indexName);
    return this._promisify(index.count(value));
  }

  /**
   * Clear all records in the store (for testing/reset).
   * @returns {Promise<void>}
   */
  async clear() {
    const store = await this._getStore('readwrite');
    const txComplete = this._waitForTransaction(store);
    store.clear();
    await txComplete;
  }

  /**
   * Batch put multiple records.
   * @param {Array<Object>} records
   * @returns {Promise<void>}
   */
  async bulkPut(records) {
    const store = await this._getStore('readwrite');
    const txComplete = this._waitForTransaction(store);
    for (const record of records) {
      store.put(this._serialize(record));
    }
    await txComplete;
  }
}
