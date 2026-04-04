/**
 * ID Generation Utility
 * Generates unique IDs without external dependencies.
 * Uses crypto.randomUUID where available, falls back to timestamp + random.
 */

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random hex
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  const random2 = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}-${random2}`;
}

export function generateShortId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
