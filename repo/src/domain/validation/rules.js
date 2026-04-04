/**
 * Validation Rules — Single Source of Truth
 * All validation logic lives here. Services call these; UI may call for preview only.
 */

import { ValidationError } from '../../utils/errors.js';
import { CancellationReasons } from '../enums/statuses.js';

// ── Password Rules ──
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_RULES = [
  { test: v => v.length >= PASSWORD_MIN_LENGTH, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
  { test: v => /[A-Z]/.test(v), message: 'Password must contain at least one uppercase letter' },
  { test: v => /[a-z]/.test(v), message: 'Password must contain at least one lowercase letter' },
  { test: v => /[0-9]/.test(v), message: 'Password must contain at least one number' },
  { test: v => /[^A-Za-z0-9]/.test(v), message: 'Password must contain at least one symbol' },
];

export function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', { password: 'Password is required' });
  }
  const failures = PASSWORD_RULES.filter(r => !r.test(password)).map(r => r.message);
  if (failures.length > 0) {
    throw new ValidationError('Password does not meet requirements', { password: failures });
  }
}

// ── Username Rules ──
export function validateUsername(username) {
  const errors = {};
  if (!username || typeof username !== 'string') {
    errors.username = 'Username is required';
  } else if (username.length < 3 || username.length > 30) {
    errors.username = 'Username must be 3-30 characters';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    errors.username = 'Username may only contain letters, numbers, and underscores';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid username', errors);
  }
}

// ── Address Rules (US Only) ──
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

export function validateAddress(address) {
  const errors = {};

  if (!address.street || address.street.trim().length === 0) {
    errors.street = 'Street address is required';
  }
  if (!address.city || address.city.trim().length === 0) {
    errors.city = 'City is required';
  }
  if (!address.state) {
    errors.state = 'State is required';
  } else if (!US_STATES.includes(address.state.toUpperCase())) {
    errors.state = 'Invalid US state';
  }
  if (!address.zipCode) {
    errors.zipCode = 'ZIP code is required';
  } else if (!/^\d{5}$/.test(address.zipCode)) {
    errors.zipCode = 'ZIP code must be exactly 5 digits';
  }
  if (address.phone) {
    const digits = address.phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      errors.phone = 'Phone must be 10 digits';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid address', errors);
  }
}

// ── Profile Rules ──
export function validateProfile(profile) {
  const errors = {};
  if (profile.displayName !== undefined) {
    if (typeof profile.displayName !== 'string' || profile.displayName.trim().length === 0) {
      errors.displayName = 'Display name is required';
    } else if (profile.displayName.length > 50) {
      errors.displayName = 'Display name must be 50 characters or less';
    }
  }
  if (profile.bio !== undefined && profile.bio.length > 500) {
    errors.bio = 'Bio must be 500 characters or less';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid profile', errors);
  }
}

// ── Listing Rules ──
export function validateListing(listing) {
  const errors = {};
  if (!listing.title || listing.title.trim().length === 0) {
    errors.title = 'Title is required';
  } else if (listing.title.length > 200) {
    errors.title = 'Title must be 200 characters or less';
  }
  if (!listing.description || listing.description.trim().length === 0) {
    errors.description = 'Description is required';
  }
  if (listing.price === undefined || listing.price === null) {
    errors.price = 'Price is required';
  } else if (typeof listing.price !== 'number' || listing.price < 0) {
    errors.price = 'Price must be a non-negative number';
  }
  if (!listing.categoryId) {
    errors.categoryId = 'Category is required';
  }
  // Delivery options: at least one method required
  const opts = listing.deliveryOptions;
  if (!opts || (!opts.pickup && !opts.delivery)) {
    errors.deliveryOptions = 'At least one delivery option (pickup or delivery) is required';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid listing', errors);
  }
}

// ── Media Rules ──
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;  // 2MB
const MAX_VIDEO_SIZE = 10 * 1024 * 1024;  // 10MB
const MAX_VIDEOS_PER_LISTING = 2;

export function validateMedia(mediaItems) {
  const errors = [];
  let videoCount = 0;

  for (let i = 0; i < mediaItems.length; i++) {
    const item = mediaItems[i];
    if (!item.type || !['image', 'video'].includes(item.type)) {
      errors.push(`Item ${i}: invalid media type`);
      continue;
    }
    // Accept either 'url' (base64 data URL from FileReader) or 'data' field
    if (!item.url && !item.data) {
      errors.push(`Item ${i}: missing media data`);
      continue;
    }
    if (item.type === 'image') {
      // Only validate size if present (not available when loading from existing records)
      if (item.size !== undefined && item.size > MAX_IMAGE_SIZE) {
        errors.push(`Item ${i}: image exceeds 2MB limit`);
      }
    }
    if (item.type === 'video') {
      videoCount++;
      if (item.size !== undefined && item.size > MAX_VIDEO_SIZE) {
        errors.push(`Item ${i}: video exceeds 10MB limit`);
      }
    }
  }

  if (videoCount > MAX_VIDEOS_PER_LISTING) {
    errors.push(`Maximum ${MAX_VIDEOS_PER_LISTING} videos allowed`);
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid media', { media: errors });
  }
}

// ── Comment/QA Rules ──
const VALID_COMMENT_TYPES = ['comment', 'question', 'answer'];

export function validateComment(comment) {
  const errors = {};
  if (!comment.content || comment.content.trim().length === 0) {
    errors.content = 'Content is required';
  } else if (comment.content.length > 5000) {
    errors.content = 'Content must be 5000 characters or less';
  }
  if (!comment.listingId) {
    errors.listingId = 'Listing reference is required';
  }
  if (comment.type && !VALID_COMMENT_TYPES.includes(comment.type)) {
    errors.type = `Type must be one of: ${VALID_COMMENT_TYPES.join(', ')}`;
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid comment', errors);
  }
}

// ── Complaint Rules ──
export function validateComplaint(complaint) {
  const errors = {};
  if (!complaint.transactionId) {
    errors.transactionId = 'Transaction reference is required';
  }
  if (!complaint.issueType || complaint.issueType.trim().length === 0) {
    errors.issueType = 'Issue type is required';
  }
  if (!complaint.description || complaint.description.trim().length === 0) {
    errors.description = 'Description is required';
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid complaint', errors);
  }
}

// ── Cancellation Rules ──
export function validateCancellation(reason) {
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ValidationError('Cancellation reason is required', { reason: 'Reason code is required' });
  }
  const validReasons = Object.values(CancellationReasons);
  if (!validReasons.includes(reason)) {
    throw new ValidationError('Invalid cancellation reason', {
      reason: `Must be one of: ${validReasons.join(', ')}`,
    });
  }
}

// ── Security Question Rules ──
export function validateSecurityQuestions(questions) {
  if (!Array.isArray(questions) || questions.length < 2) {
    throw new ValidationError('At least 2 security questions are required', { securityQuestions: 'Minimum 2 questions' });
  }
  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].question || !questions[i].answer) {
      throw new ValidationError(`Security question ${i + 1} is incomplete`, {
        securityQuestions: `Question ${i + 1} requires both question and answer`,
      });
    }
  }
}

// ── Generic Required Field Check ──
export function requireFields(obj, fields) {
  const errors = {};
  for (const field of fields) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === '') {
      errors[field] = `${field} is required`;
    }
  }
  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Missing required fields', errors);
  }
}

// Export constants for testing
export const LIMITS = Object.freeze({
  PASSWORD_MIN_LENGTH,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_VIDEOS_PER_LISTING,
  MAX_LISTING_VERSIONS: 10,
  MAX_DELIVERIES_PER_WINDOW: 8,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_ATTEMPT_WINDOW_MS: 10 * 60 * 1000,
  LOCKOUT_DURATION_MS: 15 * 60 * 1000,
  RECOVERY_MAX_ATTEMPTS: 3,
  MAX_BIO_LENGTH: 500,
  MAX_TITLE_LENGTH: 200,
  MAX_COMMENT_LENGTH: 5000,
  MAX_DISPLAY_NAME_LENGTH: 50,
  US_STATES,
});
