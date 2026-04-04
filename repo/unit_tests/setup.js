/**
 * Test Setup — provides IndexedDB and crypto polyfills for Node.js environment.
 * Uses fake-indexeddb for testing without a browser.
 */

// We use a simulated approach since this is an offline browser app.
// Tests validate service logic using in-memory stubs of the repository layer.

/**
 * In-Memory Repository Stub for testing.
 * Mirrors BaseRepository interface without IndexedDB dependency.
 */
export class InMemoryRepository {
  constructor() {
    this._store = new Map();
    this._indexes = {};
  }

  async getById(id) {
    return this._store.get(id) || null;
  }

  async getByIdOrFail(id) {
    const item = this._store.get(id);
    if (!item) throw new Error(`Not found: ${id}`);
    return item;
  }

  async getAll() {
    return Array.from(this._store.values());
  }

  async getByIndex(indexName, value) {
    return Array.from(this._store.values()).filter(item => item[indexName] === value);
  }

  async getOneByIndex(indexName, value) {
    return Array.from(this._store.values()).find(item => item[indexName] === value) || null;
  }

  async create(record) {
    const key = record.id || record.userId; // handle both key strategies
    if (this._store.has(key)) throw new Error(`Duplicate key: ${key}`);
    this._store.set(key, { ...record });
    return record;
  }

  async update(record) {
    const key = record.id || record.userId;
    this._store.set(key, { ...record });
    return record;
  }

  async delete(id) {
    this._store.delete(id);
  }

  async count() {
    return this._store.size;
  }

  async countByIndex(indexName, value) {
    return (await this.getByIndex(indexName, value)).length;
  }

  async clear() {
    this._store.clear();
  }

  async bulkPut(records) {
    for (const record of records) {
      const key = record.id || record.userId;
      this._store.set(key, { ...record });
    }
  }
}

/**
 * Simple test runner.
 */
export class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Suite: ${this.suiteName}`);
    console.log('='.repeat(60));

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.passed++;
        console.log(`  ✓ ${name}`);
      } catch (e) {
        this.failed++;
        this.errors.push({ name, error: e });
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${e.message}`);
      }
    }

    console.log(`\n  Results: ${this.passed} passed, ${this.failed} failed\n`);
    return { passed: this.passed, failed: this.failed, errors: this.errors };
  }
}

/**
 * Assertion helpers.
 */
export function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${message ? ': ' + message : ''}`);
  }
}

export function assertThrows(fn, errorType = null, messageContains = null) {
  let threw = false;
  let caughtError = null;
  try {
    const result = fn();
    // Handle async functions
    if (result && typeof result.then === 'function') {
      return result.then(
        () => { throw new Error('Expected function to throw'); },
        (e) => {
          if (errorType && !(e instanceof errorType) && e.name !== errorType.name && e.constructor.name !== errorType) {
            throw new Error(`Expected error type ${errorType.name || errorType}, got ${e.constructor.name}`);
          }
          if (messageContains && !e.message.includes(messageContains)) {
            throw new Error(`Expected error message containing "${messageContains}", got "${e.message}"`);
          }
          return e;
        }
      );
    }
  } catch (e) {
    threw = true;
    caughtError = e;
  }
  if (!threw) throw new Error('Expected function to throw');
  if (errorType && !(caughtError instanceof errorType)) {
    throw new Error(`Expected error type ${errorType.name}, got ${caughtError.constructor.name}`);
  }
  if (messageContains && !caughtError.message.includes(messageContains)) {
    throw new Error(`Expected error containing "${messageContains}", got "${caughtError.message}"`);
  }
  return caughtError;
}

export async function assertThrowsAsync(fn, errorName = null, messageContains = null) {
  try {
    await fn();
    throw new Error('Expected function to throw');
  } catch (e) {
    if (e.message === 'Expected function to throw') throw e;
    if (errorName && e.name !== errorName && e.constructor.name !== errorName) {
      throw new Error(`Expected error ${errorName}, got ${e.name || e.constructor.name}: ${e.message}`);
    }
    if (messageContains && !e.message.includes(messageContains)) {
      throw new Error(`Expected error containing "${messageContains}", got "${e.message}"`);
    }
    return e;
  }
}
