/**
 * Tests for structured error types.
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import {
  AppError, ValidationError, AuthenticationError, AuthorizationError,
  NotFoundError, StateTransitionError, ConflictError, RateLimitError, CapacityError,
} from '../../src/utils/errors.js';

const suite = new TestRunner('Error Types');

suite.test('AppError has correct structure', () => {
  const err = new AppError('TEST', 'test message', { key: 'val' });
  assertEqual(err.code, 'TEST');
  assertEqual(err.message, 'test message');
  assertEqual(err.details.key, 'val');
  assert(err.timestamp > 0, 'should have timestamp');
  assert(err instanceof Error, 'should be instance of Error');
});

suite.test('AppError.toJSON returns serializable object', () => {
  const err = new AppError('TEST', 'msg');
  const json = err.toJSON();
  assertEqual(json.code, 'TEST');
  assertEqual(json.message, 'msg');
});

suite.test('ValidationError has correct name and code', () => {
  const err = new ValidationError('bad input', { field: 'required' });
  assertEqual(err.name, 'ValidationError');
  assertEqual(err.code, 'VALIDATION_ERROR');
  assertEqual(err.details.field, 'required');
});

suite.test('AuthenticationError has correct name', () => {
  const err = new AuthenticationError('no session');
  assertEqual(err.name, 'AuthenticationError');
  assertEqual(err.code, 'AUTHENTICATION_ERROR');
});

suite.test('AuthorizationError includes required permission', () => {
  const err = new AuthorizationError('denied', 'Admin:Export');
  assertEqual(err.name, 'AuthorizationError');
  assertEqual(err.details.requiredPermission, 'Admin:Export');
});

suite.test('NotFoundError includes entity info', () => {
  const err = new NotFoundError('user', 'abc123');
  assertEqual(err.name, 'NotFoundError');
  assert(err.message.includes('user'), 'should mention entity type');
  assert(err.message.includes('abc123'), 'should mention entity id');
});

suite.test('StateTransitionError includes transition details', () => {
  const err = new StateTransitionError('transaction', 'completed', 'inquiry');
  assertEqual(err.name, 'StateTransitionError');
  assertEqual(err.details.currentState, 'completed');
  assertEqual(err.details.attemptedState, 'inquiry');
});

suite.test('ConflictError works', () => {
  const err = new ConflictError('already exists');
  assertEqual(err.name, 'ConflictError');
  assertEqual(err.code, 'CONFLICT');
});

suite.test('RateLimitError includes retryAfter', () => {
  const err = new RateLimitError('too many attempts', 60000);
  assertEqual(err.name, 'RateLimitError');
  assertEqual(err.details.retryAfter, 60000);
});

suite.test('CapacityError works', () => {
  const err = new CapacityError('window full', { max: 8 });
  assertEqual(err.name, 'CapacityError');
  assertEqual(err.details.max, 8);
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
