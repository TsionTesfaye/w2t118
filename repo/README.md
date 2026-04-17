# TradeLoop

**Type:** `web` — pure frontend SPA (no backend, no server, no HTTP endpoints)

A fully offline, browser-based marketplace with built-in moderation, support workflows, and role-based administration. All data lives in IndexedDB and localStorage.

---

## Architecture & Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Vue 3 (Composition API, `<script setup>`) |
| State | Pinia stores |
| Routing | Vue Router 4 (hash history) |
| Persistence | IndexedDB (via `BaseRepository`), localStorage |
| Crypto | Web Crypto API — PBKDF2 key derivation, AES-256-GCM encryption |
| Build | Vite 5 |
| Unit / E2E tests | Node `--experimental-vm-modules` |
| Component tests | Vitest + @vue/test-utils + jsdom |
| Browser tests | Playwright (Chromium) |
| Container | Docker (multi-stage, node:18-alpine) |

### Layered design

```
Vue views / components
       ↓
  Pinia stores
       ↓
  Service layer   ← all business logic lives here
       ↓
Repository layer  ← IndexedDB abstraction
       ↓
  IndexedDB + localStorage
```

- **Service layer is the single source of truth** — views only render and dispatch.
- **Fail-closed** — invalid operations throw structured errors; nothing silently succeeds.
- **Append-only audit log** — every critical action is recorded and cannot be deleted.

---

## Project Structure

```
repo/
├── src/
│   ├── app/
│   │   ├── router/          # Vue Router routes + navigation guards
│   │   └── store/           # Pinia stores (auth, notifications, ui, etc.)
│   ├── components/          # Shared UI components (modals, toasts, etc.)
│   ├── composables/         # Vue composables (useToast, useUserProfile, …)
│   ├── dev/
│   │   └── seedAccounts.js  # Demo account seeder (runs once on fresh DB)
│   ├── domain/
│   │   ├── dataDictionary.js  # Canonical field definitions for all 20 entities
│   │   ├── enums/             # Roles, permissions, statuses
│   │   └── policies/          # Permission guard, session policy
│   ├── repositories/        # IndexedDB repository layer
│   ├── services/            # Business logic (AuthService, ListingService, …)
│   ├── utils/               # Errors, validators, helpers
│   └── views/
│       ├── admin/           # AdminView + 7 tab components
│       ├── auth/            # Login, Register, Recovery
│       ├── marketplace/     # MarketplaceView, ListingDetailView, ListingFormView
│       ├── messaging/       # ThreadsView, ThreadDetailView + sub-components
│       ├── moderation/      # ModerationView
│       ├── setup/           # SetupView (first-run wizard — bypassed by seed)
│       ├── support/         # SupportView
│       └── user/            # UserCenterView
├── unit_tests/              # Unit tests: domain, services, routing, ui
├── component_tests/         # Vue component + Pinia store tests (Vitest + jsdom)
├── e2e_tests/               # Service-level end-to-end flow tests (no browser)
├── browser_tests/           # Playwright browser E2E tests
├── run_tests.sh             # Unified test runner
├── playwright.config.js
├── vitest.config.js
├── Dockerfile
├── docker-compose.yml
└── vite.config.js
```

---

## Running the Application

```bash
docker-compose up --build
```

The app is served at **http://localhost:3000** once the build completes.

---

## Demo Accounts

**No setup wizard needed.** On the first load of a fresh instance the app automatically seeds all accounts and redirects you to the login page. This takes ~5 seconds the first time (PBKDF2 hashing runs in the browser); every subsequent load is instant.

Sign in at **`/#/login`** with any of the following credentials:

| Role | Username | Password | What you can test |
|------|----------|----------|-------------------|
| Admin | `admin` | `Admin@TradeLoop1!` | Full system access, user management, analytics, categories, data export |
| Moderator | `moderator` | `Mod@TradeLoop1!` | Review queue, pin/feature listings, content deletion |
| Support Agent | `support` | `Support@TradeLoop1!` | Complaints, refund approvals, transaction context |
| Regular user (buyer) | `alice` | `Alice@TradeLoop1!` | Browsing, messaging, buying, filing complaints |
| Regular user (seller) | `bob` | `Bob@TradeLoop1!` | Creating listings, managing transactions, answering Q&A |

> **Password requirements** (enforced for all accounts): minimum 12 characters, at least one uppercase letter, one lowercase letter, one digit, and one special character.

> **Security question answers** for all seeded accounts:
> - *"What is the name of this demo app?"* → `tradeloop`
> - *"What is the test environment called?"* → `demo`

---

## Testing

```bash
./run_tests.sh                  # all suites
./run_tests.sh --unit           # unit tests only       (unit_tests/)
./run_tests.sh --component      # component tests only  (component_tests/ — Vitest)
./run_tests.sh --e2e            # service e2e only      (e2e_tests/)
./run_tests.sh --browser        # Playwright browser tests (browser_tests/)
```

Docker runs unit + component + e2e tests automatically during `docker-compose up --build`.

---

## Data Persistence

All data is stored **locally in the browser** (IndexedDB + localStorage). There is no server, no cloud sync, and no account recovery through a remote service.

- Clearing browser cache / site data erases everything — including the seeded accounts. Reload the page to re-trigger seeding.
- Data does **not** transfer between browsers or devices automatically.
- Use **Admin → Data** to export an AES-256-GCM encrypted snapshot and import it into another browser.

---

## Security & Crypto Design

| Concern | Implementation |
|---------|---------------|
| Password hashing | PBKDF2-SHA256, 100,000 iterations, random 16-byte salt per user |
| Export backups | AES-256-GCM with a user-supplied passphrase; passphrase never stored |
| Session tokens | Random 32-byte hex tokens stored in localStorage; invalidated on logout |
| Permission enforcement | Every service method calls `requirePermission()` before any operation |

Crypto operations run entirely in the browser via the **Web Crypto API** — no secrets leave the device.

---

## Production Deployment

```bash
docker-compose up --build
```

Builds the app and serves it via `vite preview` on port **3000**. No local Node.js installation required. Because routing uses hash history (`/#/...`), no server-side rewrite rules are needed.

---

## Troubleshooting

**Port 3000 already in use**
Edit `docker-compose.yml` and change `"3000:4173"` to e.g. `"3001:4173"`, then re-run `docker-compose up --build`.

---

**Accounts missing after clearing browser data**
Seeding is triggered automatically on the next page load — wait ~5 seconds for the PBKDF2 hashing to complete, then log in normally.
