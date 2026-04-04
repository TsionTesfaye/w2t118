/**
 * Structured Error Handling
 * All service errors use these types. No silent failures.
 */

export class AppError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super('VALIDATION_ERROR', message, fields);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message, details = null) {
    super('AUTHENTICATION_ERROR', message, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message, requiredPermission = null) {
    super('AUTHORIZATION_ERROR', message, { requiredPermission });
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(entityType, entityId) {
    super('NOT_FOUND', `${entityType} not found: ${entityId}`, { entityType, entityId });
    this.name = 'NotFoundError';
  }
}

export class StateTransitionError extends AppError {
  constructor(entityType, currentState, attemptedState) {
    super(
      'INVALID_STATE_TRANSITION',
      `Cannot transition ${entityType} from '${currentState}' to '${attemptedState}'`,
      { entityType, currentState, attemptedState }
    );
    this.name = 'StateTransitionError';
  }
}

export class ConflictError extends AppError {
  constructor(message, details = null) {
    super('CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message, retryAfter = null) {
    super('RATE_LIMITED', message, { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class CapacityError extends AppError {
  constructor(message, details = null) {
    super('CAPACITY_EXCEEDED', message, details);
    this.name = 'CapacityError';
  }
}
