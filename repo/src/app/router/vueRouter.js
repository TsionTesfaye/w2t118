import { createRouter, createWebHashHistory } from 'vue-router';
import { Roles } from '../../domain/enums/roles.js';
import { RouteNames } from './routeNames.js';
import { getInitializationState } from '../bootstrap/index.js';
import { InitService } from '../../services/InitService.js';
import { useNotificationStore } from '../store/notificationStore.js';
import { useTransactionStore } from '../store/transactionStore.js';
import { useModerationStore } from '../store/moderationStore.js';
import { useUserProfile } from '../../composables/useUserProfile.js';

const Setup          = () => import('../../views/setup/SetupView.vue');
const Login          = () => import('../../views/auth/LoginView.vue');
const Register       = () => import('../../views/auth/RegisterView.vue');
const Recovery       = () => import('../../views/auth/RecoveryView.vue');
const AppLayout      = () => import('../../views/AppLayout.vue');
const Home           = () => import('../../views/HomeView.vue');
const Marketplace    = () => import('../../views/marketplace/MarketplaceView.vue');
const ListingDetail  = () => import('../../views/marketplace/ListingDetailView.vue');
const ListingForm    = () => import('../../views/marketplace/ListingFormView.vue');
const Threads        = () => import('../../views/messaging/ThreadsView.vue');
const ThreadDetail   = () => import('../../views/messaging/ThreadDetailView.vue');
const UserCenter     = () => import('../../views/user/UserCenterView.vue');
const ModerationDashboard = () => import('../../views/moderation/ModerationView.vue');
const SupportDashboard    = () => import('../../views/support/SupportView.vue');
const AdminDashboard      = () => import('../../views/admin/AdminView.vue');

const routes = [
  // ── First-run setup (only accessible when uninitialized) ──
  { path: '/setup', name: RouteNames.SETUP, component: Setup, meta: { setup: true } },

  // ── Guest-only routes ──
  { path: '/login',    name: RouteNames.LOGIN,            component: Login,    meta: { guest: true } },
  { path: '/register', name: RouteNames.REGISTER,         component: Register, meta: { guest: true } },
  { path: '/recover',  name: RouteNames.RECOVER_PASSWORD, component: Recovery, meta: { guest: true } },

  // ── Authenticated routes (nested under AppLayout) ──
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '',                       name: RouteNames.HOME,            component: Home },
      { path: 'marketplace',            name: RouteNames.MARKETPLACE,     component: Marketplace },
      { path: 'listings/new',           name: RouteNames.CREATE_LISTING,  component: ListingForm },
      { path: 'listings/:id',           name: RouteNames.LISTING_DETAIL,  component: ListingDetail,  props: true },
      { path: 'listings/:id/edit',      name: RouteNames.EDIT_LISTING,    component: ListingForm,    props: true },
      { path: 'threads',                name: RouteNames.THREADS,         component: Threads },
      { path: 'threads/:id',            name: RouteNames.THREAD_DETAIL,   component: ThreadDetail,   props: true },
      // CANONICAL path: user-center/:tab? — matches sidebar and UserCenterView TAB_ROUTE_MAP
      { path: 'user-center/:tab?',      name: RouteNames.USER_CENTER,     component: UserCenter,     props: true },
      {
        path: 'moderation/:tab?',
        name: RouteNames.MODERATION,
        component: ModerationDashboard,
        props: true,
        meta: { roles: [Roles.MODERATOR, Roles.ADMIN] },
      },
      {
        path: 'support/:tab?',
        name: RouteNames.SUPPORT,
        component: SupportDashboard,
        props: true,
        meta: { roles: [Roles.SUPPORT_AGENT, Roles.ADMIN] },
      },
      {
        path: 'admin/:tab?',
        name: RouteNames.ADMIN,
        component: AdminDashboard,
        props: true,
        meta: { roles: [Roles.ADMIN] },
      },
    ],
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

/**
 * Reset all user-related stores when a session expires.
 * Mirrors the same cleanup that manual logout performs.
 * authStore.clearSession() has already been called by syncFromStorage().
 */
function _resetAllUserStores() {
  useNotificationStore().reset();
  useTransactionStore().reset();
  useModerationStore().reset();
  useUserProfile().clearCache();
}

/**
 * Navigation guard — installed after Pinia is ready.
 * Primary RBAC enforcement is in the service layer.
 * This guard handles redirects for unauthenticated, unauthorized,
 * uninitialized (fresh-install), and session-expired users.
 *
 * Session enforcement runs on EVERY navigation, not just periodically,
 * so an expired session can never access a protected route even if
 * the periodic checker hasn't fired yet.
 */
export function installRouterGuard(authStore) {
  router.beforeEach(async (to) => {
    // ── Session freshness check ──
    // Re-read and validate from localStorage on every navigation.
    // This is the authoritative check: the in-memory Pinia ref may lag
    // if lastActivityAt was modified externally (test injection, other tab).
    // getCurrentSession() validates both idle + absolute timeouts and
    // removes the localStorage key if expired.
    if (authStore.isAuthenticated) {
      const valid = authStore.syncFromStorage();
      if (!valid) {
        // Session expired — reset all user-scoped state, exactly like logout.
        _resetAllUserStores();
        // isAuthenticated is now false; fall through to normal redirect logic.
      }
    }

    // ── Initialization check ──
    // Resolve state from bootstrap cache; fall back to a direct check if
    // the guard fires before bootstrapApp() has completed (edge case).
    let initialized = getInitializationState();
    if (initialized === null) {
      initialized = await InitService.isInitialized();
    }

    // Uninitialized system: everyone goes to /setup
    if (!initialized && to.name !== RouteNames.SETUP) {
      return { name: RouteNames.SETUP };
    }

    // Initialized system: /setup is locked — redirect away
    if (initialized && to.meta.setup) {
      return { name: authStore.isAuthenticated ? RouteNames.HOME : RouteNames.LOGIN };
    }

    // ── Guest-only routes: redirect authenticated users to home ──
    if (to.meta.guest) {
      if (authStore.isAuthenticated) return { name: RouteNames.HOME };
      return true;
    }

    // ── Auth-required routes ──
    if (to.meta.requiresAuth || to.matched.some(r => r.meta.requiresAuth)) {
      if (!authStore.isAuthenticated) return { name: RouteNames.LOGIN };

      const routeRoles = to.meta.roles ?? to.matched.find(r => r.meta.roles)?.meta.roles;
      if (routeRoles?.length > 0) {
        const hasRole = routeRoles.some(r => authStore.roles.includes(r));
        if (!hasRole) return { name: RouteNames.HOME };
      }
    }

    return true;
  });
}
