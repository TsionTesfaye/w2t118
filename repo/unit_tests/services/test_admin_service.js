/**
 * AdminService — Unit Tests
 *
 * Covers: createCategory, updateCategory, getAllCategories, getCategoryTree.
 *
 * Stubs: categoryRepository, AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { AdminService } from '../../src/services/AdminService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('AdminService');

const categoryRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }
function userSession(id  = 'user-1')  { return createSession(id, [Roles.USER]); }

function stubRepos() {
  repos.categoryRepository.create       = r  => categoryRepo.create(r);
  repos.categoryRepository.getById      = id => categoryRepo.getById(id);
  repos.categoryRepository.getByIdOrFail = async id => {
    const r = await categoryRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.categoryRepository.getAll       = () => categoryRepo.getAll();
  repos.categoryRepository.update       = r  => categoryRepo.update(r);

  AuditService.log = async () => {};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('createCategory: admin can create a root category', async () => {
  stubRepos(); await categoryRepo.clear();
  const result = await AdminService.createCategory(adminSession(), { name: 'Electronics' });
  assertEqual(result.name, 'Electronics');
  assertEqual(result.parentId, null);
  assert(result.id, 'id assigned');
});

suite.test('createCategory: non-admin cannot create category', async () => {
  stubRepos(); await categoryRepo.clear();
  await assertThrowsAsync(
    () => AdminService.createCategory(userSession(), { name: 'Hacked' }),
    'AuthorizationError',
  );
});

suite.test('createCategory: empty name throws ValidationError', async () => {
  stubRepos(); await categoryRepo.clear();
  await assertThrowsAsync(
    () => AdminService.createCategory(adminSession(), { name: '' }),
    'ValidationError',
  );
});

suite.test('createCategory: whitespace-only name throws ValidationError', async () => {
  stubRepos(); await categoryRepo.clear();
  await assertThrowsAsync(
    () => AdminService.createCategory(adminSession(), { name: '   ' }),
    'ValidationError',
  );
});

suite.test('createCategory: can create subcategory with valid parentId', async () => {
  stubRepos(); await categoryRepo.clear();
  const parent = await AdminService.createCategory(adminSession(), { name: 'Electronics' });
  const child  = await AdminService.createCategory(adminSession(), {
    name: 'Laptops', parentId: parent.id,
  });
  assertEqual(child.parentId, parent.id);
});

suite.test('createCategory: invalid parentId throws NotFoundError', async () => {
  stubRepos(); await categoryRepo.clear();
  await assertThrowsAsync(
    () => AdminService.createCategory(adminSession(), { name: 'Sub', parentId: 'nonexistent' }),
    'NotFoundError',
  );
});

suite.test('updateCategory: admin can update name', async () => {
  stubRepos(); await categoryRepo.clear();
  const cat = await AdminService.createCategory(adminSession(), { name: 'Old Name' });
  const updated = await AdminService.updateCategory(adminSession(), cat.id, { name: 'New Name' });
  assertEqual(updated.name, 'New Name');
});

suite.test('updateCategory: setting self as parent throws ValidationError', async () => {
  stubRepos(); await categoryRepo.clear();
  const cat = await AdminService.createCategory(adminSession(), { name: 'Cat' });
  await assertThrowsAsync(
    () => AdminService.updateCategory(adminSession(), cat.id, { parentId: cat.id }),
    'ValidationError',
  );
});

suite.test('updateCategory: setting empty name throws ValidationError', async () => {
  stubRepos(); await categoryRepo.clear();
  const cat = await AdminService.createCategory(adminSession(), { name: 'Cat' });
  await assertThrowsAsync(
    () => AdminService.updateCategory(adminSession(), cat.id, { name: '' }),
    'ValidationError',
  );
});

suite.test('updateCategory: non-admin cannot update', async () => {
  stubRepos(); await categoryRepo.clear();
  const cat = await AdminService.createCategory(adminSession(), { name: 'Cat' });
  await assertThrowsAsync(
    () => AdminService.updateCategory(userSession(), cat.id, { name: 'Hijacked' }),
    'AuthorizationError',
  );
});

suite.test('getAllCategories: returns all categories', async () => {
  stubRepos(); await categoryRepo.clear();
  await AdminService.createCategory(adminSession(), { name: 'A' });
  await AdminService.createCategory(adminSession(), { name: 'B' });
  const all = await AdminService.getAllCategories(userSession());
  assertEqual(all.length, 2);
});

suite.test('getCategoryTree: builds hierarchical tree', async () => {
  stubRepos(); await categoryRepo.clear();
  const parent = await AdminService.createCategory(adminSession(), { name: 'Electronics', sortOrder: 0 });
  await AdminService.createCategory(adminSession(), { name: 'Laptops', parentId: parent.id, sortOrder: 0 });
  await AdminService.createCategory(adminSession(), { name: 'Phones', parentId: parent.id, sortOrder: 1 });

  const tree = await AdminService.getCategoryTree(userSession());
  assertEqual(tree.length, 1);
  assertEqual(tree[0].name, 'Electronics');
  assert(Array.isArray(tree[0].children), 'has children array');
  assertEqual(tree[0].children.length, 2);
});

suite.test('getCategoryTree: multiple root categories sorted by sortOrder', async () => {
  stubRepos(); await categoryRepo.clear();
  await AdminService.createCategory(adminSession(), { name: 'B-Cat', sortOrder: 2 });
  await AdminService.createCategory(adminSession(), { name: 'A-Cat', sortOrder: 1 });

  const tree = await AdminService.getCategoryTree(userSession());
  assertEqual(tree.length, 2);
  assertEqual(tree[0].name, 'A-Cat'); // lower sortOrder first
  assertEqual(tree[1].name, 'B-Cat');
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => AdminService.getAllCategories(null),
    'AuthenticationError',
  );
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
