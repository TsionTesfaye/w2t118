/**
 * Time Utility
 * Centralized time operations for consistency across the app.
 */

export const THIRTY_MINUTES_MS = 30 * 60 * 1000;
export const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Get current timestamp in milliseconds.
 */
export function now() {
  return Date.now();
}

/**
 * Check if a timestamp has expired relative to now.
 * @param {number} timestamp - The timestamp to check
 * @param {number} durationMs - Duration in milliseconds
 * @returns {boolean} True if expired
 */
export function isExpired(timestamp, durationMs) {
  if (!timestamp || !durationMs) return true;
  return now() - timestamp > durationMs;
}

/**
 * Check if timestamp is within a duration from now.
 */
export function isWithin(timestamp, durationMs) {
  return !isExpired(timestamp, durationMs);
}

/**
 * Format a timestamp to a 12-hour time string.
 * @param {number} timestamp
 * @returns {string} e.g., "2:30 PM"
 */
export function formatTime12h(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

/**
 * Get the start of a 2-hour delivery window for a given timestamp.
 * Windows start at: 8AM, 10AM, 12PM, 2PM, 4PM, 6PM
 * @param {number} timestamp
 * @returns {{ windowStart: number, windowEnd: number, windowKey: string } | null}
 */
export function getDeliveryWindow(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours();

  // Delivery windows: 8-10, 10-12, 12-14, 14-16, 16-18, 18-20
  const windowStarts = [8, 10, 12, 14, 16, 18];
  const windowStart = windowStarts.find(s => hours >= s && hours < s + 2);

  if (windowStart === undefined) return null;

  const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  const windowKey = `${dateStr}_${windowStart}`;

  const startDate = new Date(date);
  startDate.setHours(windowStart, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(windowStart + 2, 0, 0, 0);

  return {
    windowStart: startDate.getTime(),
    windowEnd: endDate.getTime(),
    windowKey,
  };
}

/**
 * Generate all delivery window slots for a given date.
 * @param {Date|string} date
 * @returns {Array<{ windowKey: string, startHour: number, endHour: number, label: string }>}
 */
export function getDeliveryWindowSlots(date) {
  const d = new Date(date);
  const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;

  const slots = [
    { start: 8, end: 10 },
    { start: 10, end: 12 },
    { start: 12, end: 14 },
    { start: 14, end: 16 },
    { start: 16, end: 18 },
    { start: 18, end: 20 },
  ];

  return slots.map(s => {
    const startLabel = formatHour12(s.start);
    const endLabel = formatHour12(s.end);
    return {
      windowKey: `${dateStr}_${s.start}`,
      startHour: s.start,
      endHour: s.end,
      label: `${startLabel} - ${endLabel}`,
    };
  });
}

function formatHour12(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 || 12;
  return `${h}:00 ${ampm}`;
}
