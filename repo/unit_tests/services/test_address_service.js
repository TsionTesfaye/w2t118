/**
 * AddressService — Unit Tests
 *
 * Covers: create (first auto-default), update, delete (default reassignment),
 * getMyAddresses, getDefaultAddress, setDefault, validation.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AddressService } from '../../src/services/AddressService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('AddressService');

const addrRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1') { return createSession(id, [Roles.USER]); }

function stubRepos() {
  repos.addressRepository.create      = r  => addrRepo.create(r);
  repos.addressRepository.getById     = id => addrRepo.getById(id);
  repos.addressRepository.getByIdOrFail = async id => {
    const r = await addrRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.addressRepository.getAll      = () => addrRepo.getAll();
  repos.addressRepository.update      = r  => addrRepo.update(r);
  repos.addressRepository.delete      = id => addrRepo.delete(id);
  repos.addressRepository.getByIndex  = (k, v) => addrRepo.getByIndex(k, v);
  AuditService.log = async () => {};
}

const validAddress = {
  street:  '123 Main St',
  city:    'Springfield',
  state:   'IL',
  zipCode: '62701',
  phone:   '2175550123',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('create: first address is automatically set as default', async () => {
  stubRepos(); await addrRepo.clear();
  const result = await AddressService.create(userSession(), validAddress);
  assertEqual(result.isDefault, true);
  assertEqual(result.userId, 'user-1');
});

suite.test('create: second address is NOT automatically default', async () => {
  stubRepos(); await addrRepo.clear();
  await AddressService.create(userSession(), validAddress);
  const second = await AddressService.create(userSession(), { ...validAddress, street: '456 Elm St' });
  assertEqual(second.isDefault, false);
});

suite.test('create: missing required fields throws ValidationError', async () => {
  stubRepos(); await addrRepo.clear();
  await assertThrowsAsync(
    () => AddressService.create(userSession(), { city: 'Springfield', state: 'IL', zipCode: '62701' }),
    'ValidationError',
  );
});

suite.test('create: invalid ZIP code throws ValidationError', async () => {
  stubRepos(); await addrRepo.clear();
  await assertThrowsAsync(
    () => AddressService.create(userSession(), { ...validAddress, zipCode: 'ABCDE' }),
    'ValidationError',
  );
});

suite.test('create: invalid state code throws ValidationError', async () => {
  stubRepos(); await addrRepo.clear();
  await assertThrowsAsync(
    () => AddressService.create(userSession(), { ...validAddress, state: 'Illinois' }),
    'ValidationError',
  );
});

suite.test('update: owner can update address fields', async () => {
  stubRepos(); await addrRepo.clear();
  const addr = await AddressService.create(userSession(), validAddress);
  const updated = await AddressService.update(userSession(), addr.id, { street: '789 Oak Ave' });
  assertEqual(updated.street, '789 Oak Ave');
});

suite.test('update: non-owner cannot update address', async () => {
  stubRepos(); await addrRepo.clear();
  const addr = await AddressService.create(userSession('user-1'), validAddress);
  await assertThrowsAsync(
    () => AddressService.update(userSession('other-user'), addr.id, { street: 'X' }),
    'AuthorizationError',
  );
});

suite.test('delete: deletes address', async () => {
  stubRepos(); await addrRepo.clear();
  const addr = await AddressService.create(userSession(), validAddress);
  const second = await AddressService.create(userSession(), { ...validAddress, street: '456 Elm' });
  await AddressService.setDefault(userSession(), second.id); // make second default first

  await AddressService.delete(userSession(), addr.id);
  const remaining = await addrRepo.getByIndex('userId', 'user-1');
  assert(!remaining.some(a => a.id === addr.id), 'address deleted');
});

suite.test('delete: deleting default address promotes another to default', async () => {
  stubRepos(); await addrRepo.clear();
  const first  = await AddressService.create(userSession(), validAddress);  // isDefault: true
  await AddressService.create(userSession(), { ...validAddress, street: '456 Elm' }); // isDefault: false

  await AddressService.delete(userSession(), first.id);

  const remaining = await addrRepo.getByIndex('userId', 'user-1');
  assert(remaining.some(a => a.isDefault === true), 'another address promoted to default');
});

suite.test('getMyAddresses: returns only the user own addresses', async () => {
  stubRepos(); await addrRepo.clear();
  await AddressService.create(userSession('user-1'), validAddress);
  await AddressService.create(userSession('user-1'), { ...validAddress, street: '456 Elm' });
  await AddressService.create(userSession('user-2'), { ...validAddress, street: '789 Oak' });

  const results = await AddressService.getMyAddresses(userSession('user-1'));
  assertEqual(results.length, 2);
  assert(results.every(a => a.userId === 'user-1'), 'all own addresses');
});

suite.test('getDefaultAddress: returns the default address', async () => {
  stubRepos(); await addrRepo.clear();
  await AddressService.create(userSession(), validAddress);
  const def = await AddressService.getDefaultAddress(userSession());
  assertEqual(def.isDefault, true);
});

suite.test('getDefaultAddress: returns null when no addresses', async () => {
  stubRepos(); await addrRepo.clear();
  const def = await AddressService.getDefaultAddress(userSession());
  assertEqual(def, null);
});

suite.test('setDefault: changes default address', async () => {
  stubRepos(); await addrRepo.clear();
  const first  = await AddressService.create(userSession(), validAddress);
  const second = await AddressService.create(userSession(), { ...validAddress, street: '456 Elm' });

  assertEqual(first.isDefault,  true);
  assertEqual(second.isDefault, false);

  await AddressService.setDefault(userSession(), second.id);

  const addresses = await addrRepo.getByIndex('userId', 'user-1');
  const newDefault = addresses.find(a => a.id === second.id);
  const oldDefault = addresses.find(a => a.id === first.id);
  assertEqual(newDefault.isDefault, true);
  assertEqual(oldDefault.isDefault, false);
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(() => AddressService.getMyAddresses(null), 'AuthenticationError');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
