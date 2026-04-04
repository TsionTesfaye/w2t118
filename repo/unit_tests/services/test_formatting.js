/**
 * Tests for formatting utilities.
 */

import { TestRunner, assertEqual } from '../setup.js';
import { formatPhone, maskPhone, getZipPrefix, formatZip } from '../../src/utils/formatting.js';

const suite = new TestRunner('Formatting Utilities');

suite.test('formatPhone: formats 10 digits correctly', () => {
  assertEqual(formatPhone('2125551234'), '(212) 555-1234');
});

suite.test('formatPhone: strips non-digits', () => {
  assertEqual(formatPhone('(212) 555-1234'), '(212) 555-1234');
});

suite.test('formatPhone: returns raw if not 10 digits', () => {
  assertEqual(formatPhone('12345'), '12345');
});

suite.test('maskPhone: masks correctly', () => {
  assertEqual(maskPhone('(212) 555-1234'), '(***) ***-1234');
});

suite.test('getZipPrefix: extracts first 3 digits', () => {
  assertEqual(getZipPrefix('10001'), '100');
});

suite.test('getZipPrefix: handles short input with padding', () => {
  assertEqual(getZipPrefix('7'), '000');
});

suite.test('formatZip: pads to 5 digits', () => {
  assertEqual(formatZip('123'), '00123');
});

suite.test('formatZip: truncates to 5 digits', () => {
  assertEqual(formatZip('123456'), '12345');
});

const result = await suite.run();
process.exit(result.failed > 0 ? 1 : 0);
