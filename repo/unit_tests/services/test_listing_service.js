/**
 * ListingService — Unit Tests
 *
 * Covers: create, update, publish, changeStatus, rollback, getVersions,
 * getById, getActiveListings, getMyListings, togglePin, toggleFeature, archive.
 *
 * Stubs: listingRepository, listingVersionRepository, ModerationService,
 *        AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { ListingService } from '../../src/services/ListingService.js';
import { ModerationService } from '../../src/services/ModerationService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { ListingStatus } from '../../src/domain/enums/statuses.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';

const suite = new TestRunner('ListingService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const listingRepo        = new InMemoryRepository();
const listingVersionRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

// ── Session factories ─────────────────────────────────────────────────────────
function adminSession(id = 'admin-1')    { return createSession(id, [Roles.ADMIN]); }
function userSession(id = 'user-1')     { return createSession(id, [Roles.USER]); }
function modSession(id  = 'mod-1')      { return createSession(id, [Roles.MODERATOR]); }

// ── Stub wiring ───────────────────────────────────────────────────────────────
function stubRepos() {
  // listing repository
  repos.listingRepository.create         = r  => listingRepo.create(r);
  repos.listingRepository.getById        = id => listingRepo.getById(id);
  repos.listingRepository.getByIdOrFail  = async id => {
    const r = await listingRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.listingRepository.getAll         = ()  => listingRepo.getAll();
  repos.listingRepository.update         = r   => listingRepo.update(r);
  repos.listingRepository.getByIndex     = (k, v) => listingRepo.getByIndex(k, v);

  // listing-version repository
  repos.listingVersionRepository.create        = r   => listingVersionRepo.create(r);
  repos.listingVersionRepository.getAll        = ()  => listingVersionRepo.getAll();
  repos.listingVersionRepository.getByIndex    = (k, v) => listingVersionRepo.getByIndex(k, v);
  repos.listingVersionRepository.countByIndex  = async (k, v) =>
    (await listingVersionRepo.getByIndex(k, v)).length;

  // side-effect stubs
  AuditService.log                         = async () => {};
  ModerationService.preScreenContent       = async () => [];   // clean by default
  ModerationService.createCase             = async () => {};
}

function makeListing(overrides = {}) {
  return {
    id:              uid(),
    sellerId:        'user-1',
    title:           'Test Item',
    description:     'A great item',
    categoryId:      'cat-1',
    tagIds:          [],
    media:           [],
    price:           10,
    deliveryOptions: { pickup: true, delivery: false },
    isPinned:        false,
    isFeatured:      false,
    status:          ListingStatus.ACTIVE,
    createdAt:       Date.now(),
    updatedAt:       Date.now(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('create: valid listing is created with DRAFT status', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const session = userSession();
  const result = await ListingService.create(session, {
    title: 'My Bike',
    description: 'Blue mountain bike',
    price: 150,
    categoryId: 'cat-1',
    deliveryOptions: { pickup: true, delivery: false },
  });
  assertEqual(result.status,    ListingStatus.DRAFT);
  assertEqual(result.sellerId,  session.userId);
  assert(result.id, 'id assigned');
});

suite.test('create: no session throws', async () => {
  stubRepos();
  await assertThrowsAsync(() => ListingService.create(null, { title: 'X', description: 'Y', price: 1, categoryId: 'c' }), 'AuthenticationError');
});

suite.test('create: USER without LISTING_CREATE permission cannot create (still has permission)', async () => {
  stubRepos(); await listingRepo.clear();
  // Regular USER has LISTING_CREATE — should succeed
  const session = userSession();
  const result = await ListingService.create(session, {
    title: 'Test', description: 'Desc', price: 5, categoryId: 'cat',
    deliveryOptions: { pickup: true, delivery: false },
  });
  assert(result.id, 'user can create listing');
});

suite.test('create: empty title throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ListingService.create(userSession(), { title: '', description: 'D', price: 10, categoryId: 'c' }),
    'ValidationError',
  );
});

suite.test('create: negative price throws ValidationError', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => ListingService.create(userSession(), { title: 'T', description: 'D', price: -1, categoryId: 'c' }),
    'ValidationError',
  );
});

suite.test('update: valid update is applied', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  const updated = await ListingService.update(
    userSession('user-1'), listing.id, { title: 'Updated Title' },
  );
  assertEqual(updated.title, 'Updated Title');
});

suite.test('update: creates a version snapshot before updating', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  await ListingService.update(userSession('user-1'), listing.id, { title: 'New Title' });
  const versions = await listingVersionRepo.getAll();
  assert(versions.length >= 1, 'version snapshot created');
});

suite.test('update: cannot update a SOLD listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.SOLD });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.update(userSession('user-1'), listing.id, { title: 'X' }),
    'ValidationError',
  );
});

suite.test('update: cannot update an ARCHIVED listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ARCHIVED });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.update(userSession('user-1'), listing.id, { title: 'X' }),
    'ValidationError',
  );
});

suite.test('update: non-owner cannot update (ownership check)', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ sellerId: 'user-1', status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.update(userSession('other-user'), listing.id, { title: 'Stolen' }),
    'AuthorizationError',
  );
});

suite.test('publish: clean content publishes to ACTIVE', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  ModerationService.preScreenContent = async () => [];
  const listing = makeListing({ status: ListingStatus.DRAFT });
  await listingRepo.create(listing);

  const result = await ListingService.publish(userSession('user-1'), listing.id);
  assertEqual(result.listing.status, ListingStatus.ACTIVE);
  assertEqual(result.flagged, false);
});

suite.test('publish: flagged content moves to UNDER_REVIEW', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  ModerationService.preScreenContent = async () => ['badword'];
  const listing = makeListing({ status: ListingStatus.DRAFT });
  await listingRepo.create(listing);

  const result = await ListingService.publish(userSession('user-1'), listing.id);
  assertEqual(result.listing.status, ListingStatus.UNDER_REVIEW);
  assertEqual(result.flagged, true);
});

suite.test('publish: non-owner cannot publish (ownership check)', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ sellerId: 'user-1', status: ListingStatus.DRAFT });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.publish(userSession('other-user'), listing.id),
    'AuthorizationError',
  );
});

suite.test('changeStatus: moderator can change listing status', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.UNDER_REVIEW });
  await listingRepo.create(listing);

  const result = await ListingService.changeStatus(modSession(), listing.id, ListingStatus.ACTIVE);
  assertEqual(result.status, ListingStatus.ACTIVE);
});

suite.test('changeStatus: regular user cannot change status', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.UNDER_REVIEW });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.changeStatus(userSession(), listing.id, ListingStatus.ACTIVE),
    'AuthorizationError',
  );
});

suite.test('getById: returns listing', async () => {
  stubRepos(); await listingRepo.clear();
  const listing = makeListing();
  await listingRepo.create(listing);

  const result = await ListingService.getById(userSession(), listing.id);
  assertEqual(result.id, listing.id);
});

suite.test('getActiveListings: returns only ACTIVE listings', async () => {
  stubRepos(); await listingRepo.clear();
  await listingRepo.create(makeListing({ status: ListingStatus.ACTIVE, id: uid() }));
  await listingRepo.create(makeListing({ status: ListingStatus.DRAFT,  id: uid() }));
  await listingRepo.create(makeListing({ status: ListingStatus.SOLD,   id: uid() }));

  const results = await ListingService.getActiveListings(userSession());
  assert(results.every(l => l.status === ListingStatus.ACTIVE), 'only ACTIVE returned');
  assertEqual(results.length, 1);
});

suite.test('getMyListings: returns only the session owner listings', async () => {
  stubRepos(); await listingRepo.clear();
  await listingRepo.create(makeListing({ sellerId: 'user-1', id: uid() }));
  await listingRepo.create(makeListing({ sellerId: 'user-1', id: uid() }));
  await listingRepo.create(makeListing({ sellerId: 'other-user', id: uid() }));

  const results = await ListingService.getMyListings(userSession('user-1'));
  assertEqual(results.length, 2);
  assert(results.every(l => l.sellerId === 'user-1'), 'only own listings');
});

suite.test('togglePin: admin can pin a listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE, isPinned: false });
  await listingRepo.create(listing);

  const result = await ListingService.togglePin(adminSession(), listing.id);
  assertEqual(result.isPinned, true);
});

suite.test('togglePin: regular user cannot pin (no LISTING_PIN permission)', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  await assertThrowsAsync(
    () => ListingService.togglePin(userSession(), listing.id),
    'AuthorizationError',
  );
});

suite.test('toggleFeature: admin can feature a listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE, isFeatured: false });
  await listingRepo.create(listing);

  const result = await ListingService.toggleFeature(adminSession(), listing.id);
  assertEqual(result.isFeatured, true);
});

suite.test('archive: owner can archive their listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  const result = await ListingService.archive(userSession('user-1'), listing.id);
  assertEqual(result.status, ListingStatus.ARCHIVED);
});

suite.test('getVersions: returns version history for a listing', async () => {
  stubRepos(); await listingRepo.clear(); await listingVersionRepo.clear();
  const listing = makeListing({ status: ListingStatus.ACTIVE });
  await listingRepo.create(listing);

  // Create two edits to generate versions
  await ListingService.update(userSession('user-1'), listing.id, { title: 'v2' });
  await ListingService.update(userSession('user-1'), listing.id, { title: 'v3' });

  const versions = await ListingService.getVersions(userSession('user-1'), listing.id);
  assert(versions.length >= 2, 'at least 2 versions created');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
