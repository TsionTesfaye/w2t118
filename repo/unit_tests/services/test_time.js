/**
 * Tests for time utilities.
 */

import { TestRunner, assert, assertEqual } from '../setup.js';
import { isExpired, isWithin, formatTime12h, getDeliveryWindowSlots, THIRTY_MINUTES_MS } from '../../src/utils/time.js';

const suite = new TestRunner('Time Utilities');

suite.test('isExpired: returns true for old timestamp', () => {
  const old = Date.now() - THIRTY_MINUTES_MS - 1000;
  assert(isExpired(old, THIRTY_MINUTES_MS), 'should be expired');
});

suite.test('isExpired: returns false for recent timestamp', () => {
  const recent = Date.now() - 1000;
  assert(!isExpired(recent, THIRTY_MINUTES_MS), 'should not be expired');
});

suite.test('isWithin: inverse of isExpired', () => {
  const recent = Date.now() - 1000;
  assert(isWithin(recent, THIRTY_MINUTES_MS), 'should be within');
});

suite.test('formatTime12h: formats AM correctly', () => {
  const date = new Date(2024, 0, 1, 9, 30);
  assertEqual(formatTime12h(date.getTime()), '9:30 AM');
});

suite.test('formatTime12h: formats PM correctly', () => {
  const date = new Date(2024, 0, 1, 14, 0);
  assertEqual(formatTime12h(date.getTime()), '2:00 PM');
});

suite.test('formatTime12h: handles midnight as 12 AM', () => {
  const date = new Date(2024, 0, 1, 0, 0);
  assertEqual(formatTime12h(date.getTime()), '12:00 AM');
});

suite.test('formatTime12h: handles noon as 12 PM', () => {
  const date = new Date(2024, 0, 1, 12, 0);
  assertEqual(formatTime12h(date.getTime()), '12:00 PM');
});

suite.test('getDeliveryWindowSlots: returns 6 windows', () => {
  const slots = getDeliveryWindowSlots('2024-06-15');
  assertEqual(slots.length, 6);
});

suite.test('getDeliveryWindowSlots: first window starts at 8AM', () => {
  const slots = getDeliveryWindowSlots('2024-06-15');
  assertEqual(slots[0].startHour, 8);
  assertEqual(slots[0].endHour, 10);
  assert(slots[0].label.includes('8:00 AM'), `label should contain 8:00 AM, got ${slots[0].label}`);
});

suite.test('getDeliveryWindowSlots: last window ends at 8PM', () => {
  const slots = getDeliveryWindowSlots('2024-06-15');
  assertEqual(slots[5].startHour, 18);
  assertEqual(slots[5].endHour, 20);
});

suite.test('getDeliveryWindowSlots: window keys include date', () => {
  const slots = getDeliveryWindowSlots('2024-06-15');
  assert(slots[0].windowKey.startsWith('2024-'), 'key should start with year');
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
