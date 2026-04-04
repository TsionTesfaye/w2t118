/**
 * Canonical route name constants.
 *
 * ALL router definitions, <router-link> usages, and programmatic navigation
 * MUST reference these constants — never hardcode a route name string.
 */
export const RouteNames = Object.freeze({
  // ── First-run setup ──
  SETUP:            'Setup',

  // ── Auth (guest-only) ──
  LOGIN:            'Login',
  REGISTER:         'Register',
  RECOVER_PASSWORD: 'RecoverPassword',

  // ── Core (authenticated) ──
  HOME:             'Home',
  MARKETPLACE:      'Marketplace',
  CREATE_LISTING:   'CreateListing',
  LISTING_DETAIL:   'ListingDetail',
  EDIT_LISTING:     'EditListing',

  // ── Messaging ──
  THREADS:          'Threads',
  THREAD_DETAIL:    'ThreadDetail',

  // ── User Center ──
  USER_CENTER:      'UserCenter',

  // ── Moderation ──
  MODERATION:       'Moderation',

  // ── Support ──
  SUPPORT:          'Support',

  // ── Admin ──
  ADMIN:            'Admin',
});
