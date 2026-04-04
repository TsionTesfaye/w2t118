/**
 * Formatting Utility
 * Data masking and display formatting.
 */

/**
 * Format phone number to (###) ###-####
 * @param {string} phone - Raw digits or partially formatted phone
 * @returns {string} Formatted phone
 */
export function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return phone; // return as-is if invalid
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Mask phone number for display: (###) ###-####  → (***) ***-1234
 * @param {string} phone - Formatted phone
 * @returns {string}
 */
export function maskPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return '(***) ***-****';
  return `(***) ***-${digits.slice(6)}`;
}

/**
 * Mask email for display: user@example.com → u***@example.com
 */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * Mask username for partial display: johndoe → joh***
 */
export function maskUsername(username) {
  if (!username || username.length <= 3) return '***';
  return username.slice(0, 3) + '***';
}

/**
 * Format ZIP code (ensure 5 digits with leading zeros).
 */
export function formatZip(zip) {
  const digits = zip.replace(/\D/g, '');
  return digits.padStart(5, '0').slice(0, 5);
}

/**
 * Extract ZIP prefix (first 3 digits) for coverage matching.
 */
export function getZipPrefix(zip) {
  const formatted = formatZip(zip);
  return formatted.slice(0, 3);
}

/**
 * Format currency for display.
 */
export function formatCurrency(amount) {
  return `$${Number(amount).toFixed(2)}`;
}
