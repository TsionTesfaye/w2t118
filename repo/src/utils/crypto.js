/**
 * Crypto Utility — Web Crypto API based
 * Handles password hashing, salt generation, and secure comparison.
 * All sensitive fields (passwords, security answers) MUST use these functions.
 */

const PBKDF2_ITERATIONS = 100000;
const HASH_ALGORITHM = 'SHA-256';
const KEY_LENGTH = 256;

/**
 * Generate a cryptographically secure random salt.
 * @returns {string} Base64-encoded salt
 */
export async function generateSalt() {
  const saltBuffer = crypto.getRandomValues(new Uint8Array(32));
  return bufferToBase64(saltBuffer);
}

/**
 * Hash a value (password or security answer) with PBKDF2.
 * @param {string} value - Plaintext value to hash
 * @param {string} salt - Base64-encoded salt
 * @returns {string} Base64-encoded hash
 */
export async function hashValue(value, salt) {
  if (!value || typeof value !== 'string') {
    throw new Error('hashValue requires a non-empty string');
  }
  if (!salt || typeof salt !== 'string') {
    throw new Error('hashValue requires a valid salt');
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(value),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBuffer = base64ToBuffer(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    KEY_LENGTH
  );

  return bufferToBase64(new Uint8Array(derivedBits));
}

/**
 * Verify a value against a stored hash.
 * @param {string} value - Plaintext value to verify
 * @param {string} storedHash - Base64-encoded stored hash
 * @param {string} salt - Base64-encoded salt
 * @returns {boolean}
 */
export async function verifyHash(value, storedHash, salt) {
  const computedHash = await hashValue(value, salt);
  return constantTimeEqual(computedHash, storedHash);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
