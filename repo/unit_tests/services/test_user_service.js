/**
 * UserService — Unit Tests
 *
 * Covers: getProfile (sanitized), updateProfile (own only), updateNotificationPreferences,
 * blockUser (cannot self-block, cannot double-block), unblockUser,
 * getAllUsers (admin only), assignRole, removeRole, getBlockedUsers.
 *
 * Stubs: userRepository, blockRepository (via repos index AND BlockRepository module),
 *        ThreadService.markAllSharedThreadsReadOnly, AuditService.
 */

import {
  TestRunner, assert, assertEqual, assertThrowsAsync, InMemoryRepository,
} from '../setup.js';
import { UserService } from '../../src/services/UserService.js';
import { ThreadService } from '../../src/services/ThreadService.js';
import { AuditService } from '../../src/services/AuditService.js';
import { Roles } from '../../src/domain/enums/roles.js';
import { createSession } from '../../src/domain/policies/sessionPolicy.js';
import * as repos from '../../src/repositories/index.js';
import * as blockRepoModule from '../../src/repositories/BlockRepository.js';

const suite = new TestRunner('UserService');

// ── In-memory stores ──────────────────────────────────────────────────────────
const userRepo  = new InMemoryRepository();
const blockRepo = new InMemoryRepository();
let _seq = 0;
function uid() { return `id-${++_seq}`; }

function userSession(id = 'user-1') { return createSession(id, [Roles.USER]); }
function adminSession(id = 'admin-1') { return createSession(id, [Roles.ADMIN]); }

function makeUser(overrides = {}) {
  return {
    id: uid(),
    username: `user${_seq}`,
    displayName: `User ${_seq}`,
    bio: '',
    avatar: null,
    roles: [Roles.USER],
    passwordHash: 'hashed-secret',
    notificationPreferences: {
      messages: true, moderation: true, transactions: true, complaints: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function stubRepos() {
  // userRepository
  repos.userRepository.create        = r  => userRepo.create(r);
  repos.userRepository.getById       = id => userRepo.getById(id);
  repos.userRepository.getByIdOrFail = async id => {
    const r = await userRepo.getById(id);
    if (!r) throw Object.assign(new Error('Not found'), { name: 'NotFoundError' });
    return r;
  };
  repos.userRepository.getAll        = () => userRepo.getAll();
  repos.userRepository.update        = r  => userRepo.update(r);

  // blockRepository via repos index
  repos.blockRepository.create         = r  => blockRepo.create(r);
  repos.blockRepository.getById        = id => blockRepo.getById(id);
  repos.blockRepository.getAll         = () => blockRepo.getAll();
  repos.blockRepository.update         = r  => blockRepo.update(r);
  repos.blockRepository.delete         = id => blockRepo.delete(id);
  repos.blockRepository.getByBlockerId = id => blockRepo.getByIndex('blockerId', id);
  repos.blockRepository.getByBlockedId = id => blockRepo.getByIndex('blockedId', id);
  repos.blockRepository.isBlocked      = async (a, b) => {
    const blocks = await blockRepo.getByIndex('blockerId', a);
    return blocks.some(bl => bl.blockedId === b);
  };
  repos.blockRepository.isEitherBlocked = async (a, b) => {
    const [ab, ba] = await Promise.all([
      repos.blockRepository.isBlocked(a, b),
      repos.blockRepository.isBlocked(b, a),
    ]);
    return ab || ba;
  };

  // blockRepository module-level singleton (used directly by UserService)
  blockRepoModule.blockRepository.create         = r  => blockRepo.create(r);
  blockRepoModule.blockRepository.delete         = id => blockRepo.delete(id);
  blockRepoModule.blockRepository.getByBlockerId = id => blockRepo.getByIndex('blockerId', id);
  blockRepoModule.blockRepository.getByBlockedId = id => blockRepo.getByIndex('blockedId', id);
  blockRepoModule.blockRepository.isBlocked      = async (a, b) => {
    const blocks = await blockRepo.getByIndex('blockerId', a);
    return blocks.some(bl => bl.blockedId === b);
  };
  blockRepoModule.blockRepository.isEitherBlocked = async (a, b) => {
    const [ab, ba] = await Promise.all([
      blockRepoModule.blockRepository.isBlocked(a, b),
      blockRepoModule.blockRepository.isBlocked(b, a),
    ]);
    return ab || ba;
  };

  // Side-effect stubs
  ThreadService.markAllSharedThreadsReadOnly = async () => {};
  AuditService.log = async () => {};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite.test('getProfile: returns sanitized user without passwordHash', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  const profile = await UserService.getProfile(userSession('user-1'), 'user-1');
  assert(!('passwordHash' in profile), 'passwordHash not exposed');
  assertEqual(profile.id, 'user-1');
});

suite.test('updateProfile: user can update own displayName', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  const updated = await UserService.updateProfile(userSession('user-1'), {
    displayName: 'New Display Name',
  });
  assertEqual(updated.displayName, 'New Display Name');
  assert(!('passwordHash' in updated), 'passwordHash not exposed in result');
});

suite.test('updateProfile: non-safe fields are ignored (roles not updatable)', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  // Attempt to inject a roles change — should be silently ignored
  await UserService.updateProfile(userSession('user-1'), {
    displayName: 'Alice',
    roles: [Roles.ADMIN], // not in allowedFields
  });

  // Re-fetch from store to verify roles unchanged
  const stored = await userRepo.getById('user-1');
  assertEqual(stored.roles.length, 1);
  assertEqual(stored.roles[0], Roles.USER);
});

suite.test('updateNotificationPreferences: toggles a preference', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  const prefs = await UserService.updateNotificationPreferences(
    userSession('user-1'), { messages: false },
  );
  assertEqual(prefs.messages, false);
});

suite.test('updateNotificationPreferences: non-boolean value throws ValidationError', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  await assertThrowsAsync(
    () => UserService.updateNotificationPreferences(userSession('user-1'), { messages: 'yes' }),
    'ValidationError',
  );
});

suite.test('blockUser: user can block another user', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const u1 = makeUser({ id: 'user-1' });
  const u2 = makeUser({ id: 'user-2' });
  await userRepo.create(u1); await userRepo.create(u2);

  const block = await UserService.blockUser(userSession('user-1'), 'user-2');
  assertEqual(block.blockerId, 'user-1');
  assertEqual(block.blockedId, 'user-2');
});

suite.test('blockUser: cannot block yourself', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const user = makeUser({ id: 'user-1' });
  await userRepo.create(user);

  await assertThrowsAsync(
    () => UserService.blockUser(userSession('user-1'), 'user-1'),
    'ValidationError',
  );
});

suite.test('blockUser: cannot block the same user twice', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const u1 = makeUser({ id: 'user-1' });
  const u2 = makeUser({ id: 'user-2' });
  await userRepo.create(u1); await userRepo.create(u2);

  await UserService.blockUser(userSession('user-1'), 'user-2');
  await assertThrowsAsync(
    () => UserService.blockUser(userSession('user-1'), 'user-2'),
    'ConflictError',
  );
});

suite.test('unblockUser: removes block', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const u1 = makeUser({ id: 'user-1' });
  const u2 = makeUser({ id: 'user-2' });
  await userRepo.create(u1); await userRepo.create(u2);

  await UserService.blockUser(userSession('user-1'), 'user-2');
  await UserService.unblockUser(userSession('user-1'), 'user-2');

  const isBlocked = await blockRepoModule.blockRepository.isBlocked('user-1', 'user-2');
  assertEqual(isBlocked, false);
});

suite.test('unblockUser: unblocking non-blocked user throws NotFoundError', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const u1 = makeUser({ id: 'user-1' });
  await userRepo.create(u1);

  await assertThrowsAsync(
    () => UserService.unblockUser(userSession('user-1'), 'user-nobody'),
    'NotFoundError',
  );
});

suite.test('getAllUsers: admin can retrieve all users (sanitized)', async () => {
  stubRepos(); await userRepo.clear();
  await userRepo.create(makeUser({ id: 'user-1' }));
  await userRepo.create(makeUser({ id: 'user-2' }));

  const users = await UserService.getAllUsers(adminSession());
  assertEqual(users.length, 2);
  assert(users.every(u => !('passwordHash' in u)), 'no passwordHash in any result');
});

suite.test('getAllUsers: regular user cannot list all users', async () => {
  stubRepos();
  await assertThrowsAsync(
    () => UserService.getAllUsers(userSession()),
    'AuthorizationError',
  );
});

suite.test('assignRole: admin can assign a new role', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1', roles: [Roles.USER] });
  await userRepo.create(user);

  const result = await UserService.assignRole(adminSession(), 'user-1', Roles.MODERATOR);
  assert(result.roles.includes(Roles.MODERATOR), 'moderator role assigned');
});

suite.test('assignRole: assigning already-held role throws ConflictError', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1', roles: [Roles.USER] });
  await userRepo.create(user);

  await assertThrowsAsync(
    () => UserService.assignRole(adminSession(), 'user-1', Roles.USER),
    'ConflictError',
  );
});

suite.test('removeRole: admin can remove a role', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1', roles: [Roles.USER, Roles.MODERATOR] });
  await userRepo.create(user);

  const result = await UserService.removeRole(adminSession(), 'user-1', Roles.MODERATOR);
  assert(!result.roles.includes(Roles.MODERATOR), 'moderator role removed');
});

suite.test('removeRole: cannot remove last role', async () => {
  stubRepos(); await userRepo.clear();
  const user = makeUser({ id: 'user-1', roles: [Roles.USER] });
  await userRepo.create(user);

  await assertThrowsAsync(
    () => UserService.removeRole(adminSession(), 'user-1', Roles.USER),
    'ValidationError',
  );
});

suite.test('getBlockedUsers: returns current user block list', async () => {
  stubRepos(); await userRepo.clear(); await blockRepo.clear();
  const u1 = makeUser({ id: 'user-1' });
  const u2 = makeUser({ id: 'user-2' });
  await userRepo.create(u1); await userRepo.create(u2);

  await UserService.blockUser(userSession('user-1'), 'user-2');

  const blocked = await UserService.getBlockedUsers(userSession('user-1'));
  assertEqual(blocked.length, 1);
  assertEqual(blocked[0].blockedId, 'user-2');
});

suite.test('no session throws AuthenticationError', async () => {
  stubRepos();
  await assertThrowsAsync(() => UserService.getAllUsers(null), 'AuthenticationError');
});

const results = await suite.run();
if (results.failed > 0) process.exit(1);
