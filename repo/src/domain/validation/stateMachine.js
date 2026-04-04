/**
 * Generic State Machine Validator
 * Used by all services that manage lifecycle states.
 */

import { StateTransitionError } from '../../utils/errors.js';

/**
 * Validate that a state transition is allowed.
 * @param {string} entityType - Name of the entity (for error messages)
 * @param {Object} transitionMap - Frozen map of state → allowed next states
 * @param {string} currentState - Current state
 * @param {string} targetState - Desired next state
 * @throws {StateTransitionError} if transition is not allowed
 */
export function validateTransition(entityType, transitionMap, currentState, targetState) {
  if (!transitionMap[currentState]) {
    throw new StateTransitionError(entityType, currentState, targetState);
  }

  const allowedNext = transitionMap[currentState];
  if (!allowedNext.includes(targetState)) {
    throw new StateTransitionError(entityType, currentState, targetState);
  }
}

/**
 * Check if a state is terminal (no further transitions allowed).
 */
export function isTerminalState(transitionMap, state) {
  const allowed = transitionMap[state];
  return !allowed || allowed.length === 0;
}

/**
 * Get all allowed next states from a given state.
 */
export function getAllowedTransitions(transitionMap, currentState) {
  return transitionMap[currentState] || [];
}
