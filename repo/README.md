# TradeLoop Offline Marketplace & Moderation Console

A fully offline, browser-based Vue.js SPA for a secondhand marketplace with built-in moderation, support workflows, and role-based administration.

## Architecture

Layered frontend architecture:

```
UI Layer (Vue views/components)
  ↓
Store Layer (centralized reactive state)
  ↓
Service Layer (ALL business logic — single source of truth)
  ↓
Repository Layer (IndexedDB abstraction)
  ↓
IndexedDB + LocalStorage
```

### Key Principles

- **Service layer is the source of truth** for all validation, state transitions, and business rules
- **No business logic in UI** — views render and dispatch, services decide
- **Fail-closed** — invalid operations throw structured errors, never silently succeed
- **Append-only audit logs** — all critical actions logged, logs cannot be deleted

### Modules

| Module | Service | Responsibility |
|--------|---------|---------------|
| Auth | `AuthService` | Registration, login, session, lockout, recovery |
| Users | `UserService` | Profiles, blocking, preferences, role management |
| Addresses | `AddressService` | CRUD, US validation, default address enforcement |
| Listings | `ListingService` | CRUD, versioning (max 10), lifecycle, pre-screening |
| Threads | `ThreadService` | Messaging, block enforcement, read-only rules |
| Transactions | `TransactionService` | State machine, reservation locks, expiry |
| Delivery | `DeliveryService` | ZIP coverage, capacity (max 8/window), booking |
| Comments | `CommentService` | Comments & Q&A with moderation integration |
| Moderation | `ModerationService` | Pre-screen, review queue, decisions, reports |
| Support | `SupportService` | Complaints (SLA), refunds |
| Notifications | `NotificationService` | In-app notifications, unread counts |
| Analytics | `AnalyticsService` | KPIs, time-series trends |
| Admin | `AdminService` | Categories, configuration |
| Export/Import | `ExportImportService` | Full/filtered snapshot, CSV export |
| Audit | `AuditService` | Append-only event logging |

### State Machines

All state machines enforce strict transitions with no bypass:

- **Transaction**: inquiry → reserved → agreed → completed (cancel from any non-terminal)
- **Listing**: draft → active → sold/archived (under_review/rejected loop)
- **Complaint**: open → investigating → resolved/rejected
- **Refund**: requested → approved/rejected
- **Moderation**: pending → in_review → approved/rejected (resubmit loop)
- **Report**: open → under_review → resolved/dismissed

### RBAC

Four roles with flat permission model:
- **User** — marketplace operations (own resources only)
- **Moderator** — content review, pin/feature, reports
- **Support Agent** — complaints, refunds
- **Admin** — all permissions, configuration, import/export

### Security Limitations

This is a **client-only offline application**. All code runs in the user's browser.

- RBAC is enforced in JavaScript — it can be bypassed via DevTools
- Session tokens are self-issued and self-validated
- Session object is stored in `localStorage` (contains userId, roles, timestamps — no passwords or secrets)
- Logout clears localStorage session key and resets all in-memory stores; IndexedDB data persists (by design — it's the database)
- This is **simulation-grade security**, not production-grade
- Password hashing uses Web Crypto PBKDF2 (100k iterations)

## First-Run Initialization

TradeLoop requires a one-time setup on a fresh install. The system detects whether it has been initialized by checking whether any admin user exists in IndexedDB.

### What happens on a clean start

1. **App opens** → checks for an existing admin user.
2. **No admin found** → the app enters **Setup Mode** and redirects every route to `/setup`.
3. **Setup wizard runs** in two steps:
   - **Step 1 — Create Admin**: enter username, display name, password, and two security questions. This creates the initial administrator account.
   - **Step 2 — Initialize Categories**: review and confirm a starter set of marketplace categories (Electronics, Clothing, Books, etc.). You can add, rename, or remove entries before confirming.
4. **Setup completes** → the admin is logged in automatically and redirected to the Home dashboard.
5. **Normal flow begins**: login, listings, transactions, moderation — all unlocked.

### After setup

- The `/setup` route is locked. Any navigation to it redirects to Login (or Home if already authenticated).
- A new admin can be added later via Admin → Users → Assign Role.
- Categories can be managed at any time in Admin → Categories.

### Requirements

- Works with empty IndexedDB — no manual intervention required.
- No hardcoded or hidden seed users.
- Reproducible via `docker compose up` — every clean container starts at the setup flow.

---

## Docker (Recommended)

The fastest way to install, test, build, and run the app in one command:

```bash
docker compose up --build
```

This single command:
1. **Installs** all dependencies (`npm install`)
2. **Builds** the production bundle (`npm run build`)
3. **Runs** unit, API-contract, and service-level E2E tests — image build fails if any test fails
4. **Starts** the preview server

> **Note:** Browser tests (Playwright) are excluded from the Docker build stage because
> they require Chromium, which is not present in the Alpine image. To run browser tests
> locally: `./run_tests.sh --browser` (after `npm run build`).

**Access the app:** http://localhost:3000

> The container maps host port **3000** → internal port **4173** (Vite preview).

**On first access**, the app will redirect to `/setup` for first-run initialization (see [First-Run Initialization](#first-run-initialization) above).

### Rebuild after code changes

```bash
docker compose up --build
```

### Stop the container

```bash
docker compose down
```

### Run tests only (without starting the server)

```bash
docker build --target build -t tradeloop-test .
```

> The build stage runs unit, API, and service-level E2E tests and exits non-zero on any
> failure. Browser tests require Chromium — run those locally with `./run_tests.sh --browser`.

---

## Export / Import

All export and import operations are available in the Admin → Data tab and require admin-level permissions.

### Export modes

The system provides two distinct snapshot modes plus filtered/report/analytics exports:

| Operation | Format | Permission | Restores accounts? | Description |
|-----------|--------|------------|-------------------|-------------|
| **Redacted snapshot** | JSON | `Admin:Export` | No | Default safe export — credential fields stripped from users |
| **Restorable snapshot** | JSON | `Admin:Export` | Yes (with passphrase) | Disaster recovery — user credentials AES-256-GCM encrypted with admin passphrase |
| Filtered store export | JSON | `Admin:Export` | No | Selected stores; user credentials always redacted |
| Filtered store export | CSV | `Admin:Export` | No | Single store as flat `.csv`; user credentials redacted |
| Filtered report export | JSON | `Report:Export` | N/A | Reports filtered by status / targetType / reason / date range |
| Filtered report export | CSV | `Report:Export` | N/A | Same filters, spreadsheet-ready `.csv` |
| Analytics snapshot | JSON | `Analytics:Export` | N/A | Current KPI values |

### Redacted snapshot (safe / compliance)

The **default** export mode. Intended for governance, auditing, and data portability.

Redacted fields per user record:
- `passwordHash`
- `salt`
- `securityQuestions[].answerHash`
- `securityQuestions[].answerSalt`

All other fields are preserved. Exported user records carry `_credentialsRedacted: true`. The `_meta` object carries `"mode": "redacted"` and `"redacted": true`.

**Cannot restore login capability.** On import, the users store is skipped.

### Restorable snapshot (disaster recovery)

Intended for full backup/restore including user accounts and authentication.

The admin provides a passphrase (minimum 8 characters) at export time. User credential fields are encrypted with AES-256-GCM (PBKDF2-derived key, 100k iterations). The encrypted bundle is stored in `_encryptedUsers`. The visible `users` array in the file is still redacted — casual inspection never reveals credential material.

The `_meta` object carries `"mode": "restorable"` and `"redacted": false`.

On import, the admin provides the same passphrase to decrypt and restore user records with full login capability. If no passphrase is provided, users are skipped (same as redacted import).

### Snapshot format (JSON)

```json
{
  "users": [{ "id": "...", "username": "...", "_credentialsRedacted": true, ... }],
  "listings": [...],
  "_encryptedUsers": { "ciphertext": "...", "iv": "...", "salt": "..." },
  "_meta": {
    "exportedAt": 1712345678901,
    "exportedBy": "user-id",
    "version": 1,
    "mode": "restorable",
    "redacted": false
  }
}
```

`_encryptedUsers` is only present in restorable snapshots. Redacted snapshots omit it.

`_meta.version` is always `1`. The import endpoint rejects any other value.

### Filtered report export (CSV)

The CSV report export applies the same five filters available in the Admin UI:

- **Status** — `open`, `under_review`, `resolved`, `dismissed`
- **Target type** — `listing`, `user`, `comment`
- **Reason** — free-text match (exact)
- **Date from / Date to** — matched against `createdAt` (inclusive range)

The output is a standard comma-separated file with a header row. Object-type columns are JSON-encoded inline. Formula-injection characters (`= + - @`) are prefixed with a tab per CWE-1236.

### Import

Import behaviour depends on snapshot mode:

| Snapshot mode | Users restored? | Passphrase required? |
|---------------|----------------|---------------------|
| Redacted (`mode: "redacted"`) | No — users skipped | No |
| Restorable (`mode: "restorable"`) + passphrase | **Yes** — decrypted and imported | Yes |
| Restorable without passphrase | No — users skipped | No |
| Legacy (no `mode` field) | Yes — imported as-is | No |

In all modes, `auditLogs` are never overwritten (append-only). Requires `Admin:Import` permission. Version mismatch (`_meta.version !== 1`) is rejected before any data is written.

---

## Local Development

```bash
npm install

# Development server with hot-reload (http://localhost:5173)
npm run dev

# Production build (outputs to dist/)
npm run build
```

## Tests

### Test directory structure

| Directory | Contents |
|-----------|----------|
| `unit_tests/` | Pure unit tests — domain rules, services, routing, UI helpers |
| `API_tests/` | API contract and service integration tests |
| `e2e_tests/` | Service-level end-to-end flow tests (no browser required) |
| `browser_tests/` | Playwright browser E2E tests (Chromium) |

### Test commands

```bash
# Full test suite: unit + API + e2e + browser (Playwright)
./run_tests.sh

# Unit tests only (no browser required)
./run_tests.sh --unit

# API / integration tests only (no browser required)
./run_tests.sh --api

# Service-level E2E flow tests (no browser required)
./run_tests.sh --e2e

# Browser E2E tests only (Playwright — auto-starts the preview server)
./run_tests.sh --browser
```

Unit, API, and e2e_tests require Node.js 18+ (for ES module support). No browser needed for those.
Browser tests (`--browser`) run Playwright against a Chromium browser
(installed automatically via `npx playwright install`).

### Testing Approach

Tests run in Node.js using ES modules. They validate:

- **Domain layer**: validation rules, state machine transitions, permission checks, session policy
- **Validation hardening**: delivery options enforcement, cancellation enum, comment type, media format
- **RBAC hardening**: all role/permission combinations including ownership and override logic
- **Integration flows**: complete transaction lifecycle, moderation pipeline, complaint/refund workflow, Phase 5 hardening flows
- **Crypto integration**: real PBKDF2 hashing via Web Crypto API — salt uniqueness, hash determinism, tampered-hash rejection, full register/login/recovery lifecycle (no mocks)
- **Edge cases**: blocked user interactions, delivery capacity limits, all state machine terminal states, ownership violations, rate limiting

**Browser limitation**: Service-layer tests that require IndexedDB (full CRUD flows) need a browser context. Tests use InMemoryRepository stubs and direct domain logic calls where possible. The testing approach is simulation-based — real service functions are exercised without a browser UI.

## Project Structure

```
src/
├── app/
│   ├── bootstrap/      # App init, periodic tasks, multi-tab sync
│   ├── router/         # Routes with role-aware metadata, nav guard
│   └── store/          # Centralized reactive state
├── domain/
│   ├── enums/          # Roles, permissions, statuses, transitions
│   ├── policies/       # Permission guard, session policy
│   └── validation/     # Rules, state machine validator
├── modules/            # Feature modules (auth, listings, etc.)
├── repositories/       # IndexedDB abstraction per entity
├── services/           # ALL business logic lives here
├── utils/              # Crypto, time, formatting, errors, ID gen
└── components/         # Shared UI components (Phase 2)
```
