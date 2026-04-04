/**
 * IndexedDB Database Manager
 * Single connection, all object stores defined here.
 * This is the ONLY file that touches IndexedDB directly.
 */

const DB_NAME = 'tradeloop';
const DB_VERSION = 1;

let dbInstance = null;
let dbPromise = null;

const STORES = {
  users: { keyPath: 'id', indexes: [{ name: 'username', keyPath: 'username', options: { unique: true } }] },
  addresses: { keyPath: 'id', indexes: [{ name: 'userId', keyPath: 'userId' }] },
  listings: { keyPath: 'id', indexes: [
    { name: 'sellerId', keyPath: 'sellerId' },
    { name: 'categoryId', keyPath: 'categoryId' },
    { name: 'status', keyPath: 'status' },
  ]},
  listingVersions: { keyPath: 'id', indexes: [{ name: 'listingId', keyPath: 'listingId' }] },
  categories: { keyPath: 'id', indexes: [{ name: 'parentId', keyPath: 'parentId' }] },
  threads: { keyPath: 'id', indexes: [
    { name: 'listingId', keyPath: 'listingId' },
    { name: 'buyerId', keyPath: 'buyerId' },
    { name: 'sellerId', keyPath: 'sellerId' },
  ]},
  messages: { keyPath: 'id', indexes: [{ name: 'threadId', keyPath: 'threadId' }] },
  transactions: { keyPath: 'id', indexes: [
    { name: 'threadId', keyPath: 'threadId' },
    { name: 'listingId', keyPath: 'listingId' },
    { name: 'buyerId', keyPath: 'buyerId' },
    { name: 'sellerId', keyPath: 'sellerId' },
    { name: 'status', keyPath: 'status' },
  ]},
  deliveryBookings: { keyPath: 'id', indexes: [
    { name: 'windowKey', keyPath: 'windowKey' },
    { name: 'transactionId', keyPath: 'transactionId' },
  ]},
  coverageZips: { keyPath: 'id', indexes: [{ name: 'prefix', keyPath: 'prefix', options: { unique: true } }] },
  comments: { keyPath: 'id', indexes: [
    { name: 'listingId', keyPath: 'listingId' },
    { name: 'userId', keyPath: 'userId' },
  ]},
  reports: { keyPath: 'id', indexes: [
    { name: 'targetId', keyPath: 'targetId' },
    { name: 'reporterId', keyPath: 'reporterId' },
    { name: 'status', keyPath: 'status' },
  ]},
  moderationCases: { keyPath: 'id', indexes: [
    { name: 'contentId', keyPath: 'contentId' },
    { name: 'status', keyPath: 'status' },
  ]},
  complaints: { keyPath: 'id', indexes: [
    { name: 'userId', keyPath: 'userId' },
    { name: 'transactionId', keyPath: 'transactionId' },
    { name: 'status', keyPath: 'status' },
  ]},
  refunds: { keyPath: 'id', indexes: [
    { name: 'complaintId', keyPath: 'complaintId' },
    { name: 'transactionId', keyPath: 'transactionId' },
    { name: 'status', keyPath: 'status' },
  ]},
  notifications: { keyPath: 'id', indexes: [
    { name: 'userId', keyPath: 'userId' },
    { name: 'isRead', keyPath: 'isRead' },
  ]},
  auditLogs: { keyPath: 'id', indexes: [
    { name: 'actorId', keyPath: 'actorId' },
    { name: 'action', keyPath: 'action' },
    { name: 'entityType', keyPath: 'entityType' },
    { name: 'timestamp', keyPath: 'timestamp' },
  ]},
  sensitiveWords: { keyPath: 'id', indexes: [{ name: 'word', keyPath: 'word', options: { unique: true } }] },
  blocks: { keyPath: 'id', indexes: [
    { name: 'blockerId', keyPath: 'blockerId' },
    { name: 'blockedId', keyPath: 'blockedId' },
  ]},
  sessions: { keyPath: 'userId' },
};

/**
 * Open (or return existing) database connection.
 * @returns {Promise<IDBDatabase>}
 */
export function getDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const [storeName, config] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: config.keyPath });
          if (config.indexes) {
            for (const idx of config.indexes) {
              store.createIndex(idx.name, idx.keyPath, idx.options || {});
            }
          }
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onclose = () => { dbInstance = null; dbPromise = null; };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject(new Error(`IndexedDB open failed: ${event.target.error}`));
    };
  });

  return dbPromise;
}

/**
 * Close the database connection.
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
}

/**
 * Delete the entire database (for testing/reset).
 */
export function deleteDatabase() {
  closeDatabase();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(new Error(`Delete DB failed: ${e.target.error}`));
  });
}

export { STORES };
