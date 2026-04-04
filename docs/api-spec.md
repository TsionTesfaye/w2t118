# TradeLoop API Specification

> Offline Vue 3 SPA — all operations execute client-side against IndexedDB.
> There is no network API; services are called directly from Vue components.

---

## Table of Contents

- [Architecture](#architecture)
- [Session & Authentication](#session--authentication)
- [Roles & Permissions](#roles--permissions)
- [Error Types](#error-types)
- [Validation Limits](#validation-limits)
- [Status Enums](#status-enums)
- [Services](#services)
  - [AuthService](#authservice)
  - [UserService](#userservice)
  - [ListingService](#listingservice)
  - [CommentService](#commentservice)
  - [TransactionService](#transactionservice)
  - [ThreadService](#threadservice)
  - [DeliveryService](#deliveryservice)
  - [AddressService](#addressservice)
  - [ModerationService](#moderationservice)
  - [SupportService](#supportservice)
  - [NotificationService](#notificationservice)
  - [AnalyticsService](#analyticsservice)
  - [AdminService](#adminservice)
  - [ExportImportService](#exportimportservice)
  - [AuditService](#auditservice)
  - [InitService](#initservice)

---

## Architecture

```
UI Layer (Vue views / components)
  ↓
Service Layer (all business logic — single source of truth)
  ↓
Repository Layer (IndexedDB abstraction)
  ↓
IndexedDB + LocalStorage
```

All validation, state transitions, permission checks, and side effects happen in the service layer. Views render and dispatch; services decide.

---

## Session & Authentication

**Session shape:**

```typescript
{
  userId:        string       // FK → users.id
  roles:         string[]     // snapshot of roles at login time
  createdAt:     number       // timestamp (ms)
  lastActivityAt: number      // timestamp (ms) — updated on each action
  tokenId:       string       // UUID
}
```

**Timeout rules:**

| Rule | Duration |
|------|----------|
| Idle timeout | 30 minutes of inactivity |
| Absolute timeout | 12 hours from session creation |

Sessions are stored in both IndexedDB and localStorage. Cross-tab sync is handled via `BroadcastChannel` (`SyncEvents.LOGOUT`, `SESSION_CHANGED`).

**Login throttle (pre-lookup):**

| Parameter | Value |
|-----------|-------|
| Max attempts per username | 5 |
| Attempt window | 10 minutes |
| Lockout duration | 15 minutes |
| Storage | localStorage (persistent across reloads, shared across tabs) |

The throttle applies **before** user lookup, so unknown usernames receive identical treatment to known ones (prevents enumeration).

---

## Roles & Permissions

### Roles

| Role | Description |
|------|-------------|
| `user` | Standard marketplace participant |
| `moderator` | Content review and moderation decisions |
| `support_agent` | Complaint handling and refund decisions |
| `admin` | Full access — includes all permissions from every role |

### Permissions

| Category | Permissions |
|----------|------------|
| Listings | `Listing:Create`, `Listing:Edit`, `Listing:Delete`, `Listing:Pin`, `Listing:Feature`, `Listing:View`, `Listing:Rollback` |
| Content | `Content:Create`, `Content:Edit`, `Content:Delete`, `Content:View` |
| Threads | `Thread:Create`, `Thread:View`, `Thread:SendMessage` |
| Transactions | `Transaction:Create`, `Transaction:Update`, `Transaction:View`, `Transaction:Cancel` |
| Delivery | `Delivery:Book`, `Delivery:Manage`, `Delivery:ViewCoverage`, `Delivery:ManageCoverage` |
| Addresses | `Address:Create`, `Address:Edit`, `Address:Delete`, `Address:View` |
| Moderation | `Moderation:Review`, `Moderation:Decide`, `Moderation:ViewQueue` |
| Reports | `Report:Create`, `Report:View`, `Report:Export` |
| Support | `Complaint:Create`, `Complaint:View`, `Complaint:Manage`, `Complaint:Resolve` |
| Refunds | `Refund:Request`, `Refund:Approve`, `Refund:View` |
| Users | `User:ViewProfile`, `User:EditProfile`, `User:Block`, `User:ViewAll`, `User:ManageRoles` |
| Admin | `Admin:Config`, `Admin:Export`, `Admin:Import`, `Admin:ViewAudit`, `Admin:ManageCategories`, `Admin:ManageSensitiveWords` |
| Analytics | `Analytics:View`, `Analytics:Export` |
| Notifications | `Notification:View`, `Notification:ManagePrefs` |

---

## Error Types

All errors extend `AppError` which includes `code`, `message`, `details`, and `timestamp`.

| Error Class | Code | Typical Cause |
|-------------|------|---------------|
| `ValidationError` | `VALIDATION_FAILED` | Invalid input; `details` contains per-field errors |
| `AuthenticationError` | `AUTHENTICATION_FAILED` | Bad credentials, expired session |
| `AuthorizationError` | `AUTHORIZATION_FAILED` | Missing permission; `details.requiredPermission` set |
| `NotFoundError` | `NOT_FOUND` | Entity does not exist; `details.entityType` and `entityId` |
| `StateTransitionError` | `INVALID_STATE_TRANSITION` | Illegal status change |
| `ConflictError` | `CONFLICT` | Duplicate or conflicting operation |
| `RateLimitError` | `RATE_LIMITED` | Too many attempts; `details.retryAfter` (ms) |
| `CapacityError` | `CAPACITY_EXCEEDED` | Resource at capacity (e.g. delivery slots) |

---

## Validation Limits

| Constant | Value |
|----------|-------|
| `PASSWORD_MIN_LENGTH` | 12 |
| `MAX_IMAGE_SIZE` | 2 MB |
| `MAX_VIDEO_SIZE` | 10 MB |
| `MAX_VIDEOS_PER_LISTING` | 2 |
| `MAX_LISTING_VERSIONS` | 10 |
| `MAX_DELIVERIES_PER_WINDOW` | 8 |
| `MAX_LOGIN_ATTEMPTS` | 5 |
| `LOGIN_ATTEMPT_WINDOW_MS` | 600 000 (10 min) |
| `LOCKOUT_DURATION_MS` | 900 000 (15 min) |
| `RECOVERY_MAX_ATTEMPTS` | 3 |
| `MAX_BIO_LENGTH` | 500 |
| `MAX_TITLE_LENGTH` | 200 |
| `MAX_COMMENT_LENGTH` | 5 000 |
| `MAX_DISPLAY_NAME_LENGTH` | 50 |

Password rules: min 12 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 symbol.

---

## Status Enums

### ListingStatus

```
DRAFT → ACTIVE → SOLD
  ↓        ↓
  └→ UNDER_REVIEW → APPROVED (→ ACTIVE) / REJECTED
                                              ↓
                                          (edit resubmits)
  Any non-terminal → ARCHIVED
```

### TransactionStatus

```
INQUIRY → RESERVED → AGREED → COMPLETED
  ↓          ↓         ↓
  └──────────┴─────────┴→ CANCELED
```

- `INQUIRY → RESERVED`: seller only
- `RESERVED → AGREED`: buyer only (30-min reservation timeout)
- `AGREED → COMPLETED`: buyer only (marks listing SOLD, thread read-only)

### ComplaintStatus

```
OPEN → INVESTIGATING → RESOLVED / REJECTED
```

### RefundStatus

```
REQUESTED → APPROVED / REJECTED
```

### ModerationStatus

```
PENDING → IN_REVIEW → APPROVED / REJECTED
```

### ReportStatus

```
OPEN → UNDER_REVIEW → RESOLVED / DISMISSED
```

### CancellationReasons

`BUYER_CHANGED_MIND` | `SELLER_UNAVAILABLE` | `ITEM_NO_LONGER_AVAILABLE` | `PRICE_DISAGREEMENT` | `RESERVATION_EXPIRED` | `OTHER`

---

## Services

---

### AuthService

`src/services/AuthService.js`

#### `register(input)`

Register a new user account.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `username` | string | yes | 3–30 chars, alphanumeric + underscores, unique |
| `password` | string | yes | Min 12 chars, complexity rules enforced |
| `displayName` | string | yes | Non-empty |
| `securityQuestions` | `{ question, answer }[]` | yes | Exactly 2 required |

**Returns:** Sanitized user (no credential fields).
**Permission:** None (public).
**Errors:** `ValidationError`

#### `login(username, password)`

Authenticate and create a session.

**Returns:** `{ user, session }`
**Permission:** None.
**Errors:** `AuthenticationError` (bad credentials or unknown user — same message), `RateLimitError` (lockout, with `details.retryAfter`).

Pre-lookup throttle applies to all usernames identically.

#### `validateCurrentSession()`

Re-validate and touch the current session from localStorage.

**Returns:** Updated session.
**Errors:** `AuthenticationError` (no session or expired).

#### `getCurrentSession()`

Get current session without side effects. Returns `null` if expired or missing. Never throws.

#### `logout()`

Invalidate session, clear localStorage.

#### `getSecurityQuestions(username)`

Get question text for password recovery.

**Returns:** `string[]` — question text only.
**Notes:** Returns generic placeholder questions for unknown usernames (no enumeration).

#### `recoverPassword(username, answers, newPassword)`

Reset password via security question answers.

**Returns:** `{ success: true }`
**Errors:** `AuthenticationError` (wrong answers — same message for unknown users), `RateLimitError` (3 failed recovery attempts), `ValidationError` (bad password).
**Side effect:** Invalidates all active sessions.

#### `changePassword(session, currentPassword, newPassword)`

Change password for authenticated user.

**Returns:** `{ success: true, requiresReLogin: true }`
**Permission:** Active session.
**Errors:** `AuthenticationError`, `ValidationError`.
**Side effect:** Forces logout.

---

### UserService

`src/services/UserService.js`

#### `getProfile(session, userId)`

**Returns:** Sanitized user object.
**Permission:** `User:ViewProfile`
**Errors:** `NotFoundError`

#### `updateProfile(session, updates)`

Update own profile fields: `displayName`, `avatar`, `bio`.

**Permission:** `User:EditProfile`
**Errors:** `ValidationError`

#### `updateNotificationPreferences(session, prefs)`

Update notification preference flags: `messages`, `moderation`, `transactions`, `complaints`.

**Permission:** `Notification:ManagePrefs`

#### `blockUser(session, targetUserId)`

Block another user. All shared threads become read-only immediately.

**Permission:** `User:Block`
**Errors:** `ValidationError` (self-block), `ConflictError` (already blocked), `NotFoundError`

#### `unblockUser(session, targetUserId)`

**Permission:** `User:Block`
**Errors:** `NotFoundError`

#### `isEitherBlocked(userId1, userId2)`

Internal check. Returns `boolean`.

#### `getAllUsers(session)`

**Permission:** `User:ViewAll`
**Returns:** Array of sanitized users.

#### `assignRole(session, userId, role)` / `removeRole(session, userId, role)`

**Permission:** `User:ManageRoles`
**Errors:** `ConflictError` (already has role), `ValidationError` (cannot remove last role), `NotFoundError`

#### `getBlockedUsers(session)`

**Permission:** `User:Block`
**Returns:** Array of block records.

---

### ListingService

`src/services/ListingService.js`

#### `create(session, data)`

| Field | Type | Required |
|-------|------|----------|
| `title` | string | yes (3–100 chars) |
| `description` | string | yes (10–2000 chars) |
| `categoryId` | string | yes |
| `price` | number | yes (>= 0, USD cents) |
| `deliveryOptions` | `{ pickup, delivery }` | yes (at least one true) |
| `tagIds` | string[] | no |
| `media` | object[] | no (image <= 2MB, video <= 10MB, max 2 videos) |

**Returns:** Listing (status: `DRAFT`).
**Permission:** `Listing:Create`

#### `update(session, listingId, updates)`

**Permission:** `Listing:Edit` + ownership.
**Side effect:** Creates a version snapshot before update. Rejected listings resubmit to `UNDER_REVIEW`.

#### `publish(session, listingId)`

Move from `DRAFT` → `ACTIVE` (or `UNDER_REVIEW` if flagged).

**Returns:** `{ listing, flagged: boolean, flaggedWords?: string[] }`
**Permission:** `Listing:Edit` + ownership.

#### `changeStatus(session, listingId, newStatus)`

Moderator status transitions (`UNDER_REVIEW → APPROVED/REJECTED`).

**Permission:** `Moderation:Decide`

#### `rollback(session, listingId, versionId)`

Restore a previous version snapshot.

**Permission:** `Listing:Rollback` + ownership.

#### `getVersions(session, listingId)`

**Permission:** `Listing:View` + ownership.
**Returns:** Array of versions (max 10 retained).

#### `getById(session, listingId)` / `getActiveListings(session)` / `getMyListings(session)`

Standard read operations. `Listing:View` required for first two.

#### `togglePin(session, listingId)` / `toggleFeature(session, listingId)`

**Permission:** `Listing:Pin` / `Listing:Feature` (moderator/admin).

#### `archive(session, listingId)`

**Permission:** `Listing:Delete` + ownership.

---

### CommentService

`src/services/CommentService.js`

#### `create(session, data)`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `listingId` | string | yes | |
| `content` | string | yes | Max 5000 chars |
| `type` | `'comment'` \| `'question'` \| `'answer'` | no | Defaults to `'comment'` |
| `parentId` | string | no | Required for answers (must reference a question) |
| `media` | object[] | no | Image/video attachments |

**Permission:** `Content:Create`
**Side effect:** Pre-screens content; creates moderation case if flagged. Only listing seller can post answers.

#### `update(session, commentId, updates)` / `delete(session, commentId)`

**Permission:** `Content:Edit` / `Content:Delete` + ownership.
Delete is soft (sets `isDeleted: true`, content `→ "[deleted]"`).

#### `getByListingId(session, listingId)` / `getQAByListingId(session, listingId)`

**Permission:** `Content:View`

---

### TransactionService

`src/services/TransactionService.js`

#### `create(session, threadId)`

Buyer initiates. One active transaction per thread.

**Returns:** Transaction (status: `INQUIRY`).
**Permission:** `Transaction:Create`
**Errors:** `ValidationError`, `ConflictError`

#### `transition(session, transactionId, targetStatus)`

State machine with role-based step ownership:

| Transition | Actor |
|------------|-------|
| `INQUIRY → RESERVED` | seller |
| `RESERVED → AGREED` | buyer (30-min reservation timeout enforced) |
| `AGREED → COMPLETED` | buyer (marks listing `SOLD`, thread read-only) |

**Permission:** `Transaction:Update`
**Errors:** `StateTransitionError`, `ValidationError`

#### `cancel(session, transactionId, reasonCode)`

Either participant. Marks thread read-only.

**Permission:** `Transaction:Cancel`

#### `getById(session, transactionId)` / `getByThreadId(session, threadId)` / `getMyTransactions(session)`

**Permission:** `Transaction:View` (ownership enforced for regular users).

#### `expireStaleReservations()`

System task — cancels `RESERVED` transactions older than 30 minutes.

---

### ThreadService

`src/services/ThreadService.js`

#### `create(session, listingId)`

One thread per buyer/listing pair. Checks block status.

**Permission:** `Thread:Create`
**Errors:** `ConflictError`, `AuthorizationError`

#### `sendMessage(session, threadId, content)`

Max 2000 chars. Rejects if thread read-only or block detected.

**Permission:** `Thread:SendMessage`

#### `getMessages(session, threadId)` / `getMyThreads(session)` / `getById(session, threadId)`

**Permission:** `Thread:View`

#### `archive(session, threadId)` / `unarchive(session, threadId)`

Per-user soft archive.
**Permission:** `Thread:View`

---

### DeliveryService

`src/services/DeliveryService.js`

#### `isZipCovered(zipCode)`

Checks if the 5-digit ZIP matches any 3-digit coverage prefix. No session required.

#### `getAvailableWindows(session, date)`

**Returns:** `{ windowKey, bookedCount, availableSlots, isFull }[]`
**Permission:** `Delivery:ViewCoverage`

#### `bookDelivery(session, { transactionId, windowKey, zipCode })`

**Permission:** `Delivery:Book`
**Errors:** `CapacityError` (max 8 per window), `ValidationError` (ZIP not covered, listing doesn't offer delivery)

#### `addCoveragePrefix(session, prefix)` / `removeCoveragePrefix(session, prefix)`

**Permission:** `Delivery:ManageCoverage` (admin only).

#### `getAllCoverage(session)`

**Permission:** `Delivery:ViewCoverage`

---

### AddressService

`src/services/AddressService.js`

#### `create(session, data)`

| Field | Type | Required |
|-------|------|----------|
| `street` | string | yes |
| `street2` | string | no |
| `city` | string | yes |
| `state` | string | yes (2-letter US state code) |
| `zipCode` | string | yes (5-digit) |
| `phone` | string | no (formatted `(###) ###-####`) |
| `isDefault` | boolean | no |

**Permission:** `Address:Create`
First address auto-set as default. New default unsets previous.

#### `update(session, addressId, updates)` / `delete(session, addressId)`

**Permission:** `Address:Edit` / `Address:Delete` + ownership.
If default deleted, first remaining becomes default.

#### `getMyAddresses(session)` / `getDefaultAddress(session)` / `setDefault(session, addressId)`

---

### ModerationService

`src/services/ModerationService.js`

#### `preScreenContent(text)`

**Returns:** `string[]` — flagged words (empty = clean). No session required.

#### `createCase(session, data)`

Internal. Creates moderation queue item.

| Field | Type |
|-------|------|
| `contentId` | string |
| `contentType` | `'listing'` \| `'comment'` \| `'user'` |
| `reason` | string |
| `flaggedWords` | string[] (optional) |
| `reportId` | string (optional) |

#### `pickUpCase(session, caseId)`

Transition to `IN_REVIEW`. Advances linked report to `UNDER_REVIEW`.

**Permission:** `Moderation:Review`

#### `decide(session, caseId, decision)`

| Field | Type | Notes |
|-------|------|-------|
| `decision` | `'approved'` \| `'rejected'` | |
| `violationTags` | string[] | Required on rejection |
| `penalty` | string \| null | Optional |

**Permission:** `Moderation:Decide`
**Side effects:** Closes linked report; updates listing status if applicable.

#### `getReviewQueue(session)` / `getCaseById(session, caseId)`

**Permission:** `Moderation:ViewQueue` / `Moderation:Review`

#### `createReport(session, data)`

| Field | Type |
|-------|------|
| `targetId` | string |
| `targetType` | `'user'` \| `'listing'` \| `'comment'` |
| `reason` | string |
| `description` | string (optional) |

**Permission:** `Report:Create`
**Side effect:** Auto-creates a moderation case.

#### `updateReportStatus(session, reportId, newStatus)` / `getAllReports(session)`

**Permission:** `Moderation:Decide` / `Report:View`

#### `addSensitiveWord(session, word, matchType?)` / `removeSensitiveWord(session, wordId)` / `getAllSensitiveWords(session)`

**Permission:** `Admin:ManageSensitiveWords`
`matchType`: `'exact'` | `'substring'` (default: `'substring'`).

---

### SupportService

`src/services/SupportService.js`

#### `createComplaint(session, data)`

| Field | Type |
|-------|------|
| `transactionId` | string |
| `issueType` | string (e.g. `'item_not_received'`, `'fraud'`) |
| `description` | string |

**Permission:** `Complaint:Create`
**Constraints:** Only on `AGREED` or `COMPLETED` transactions. One complaint per user per transaction. 24-hour SLA auto-set.

#### `transitionComplaint(session, complaintId, newStatus, resolution?)`

**Permission:** `Complaint:Manage`
Resolution text required for `RESOLVED` / `REJECTED`. Sets `assignedTo` on `INVESTIGATING`.

#### `getComplaintById(session, id)` / `getMyComplaints(session)` / `getAllComplaints(session, pagination?)` / `getOpenComplaints(session, pagination?)`

Pagination: `{ page: 1, pageSize: 50 }` → `{ items, total, page, pageSize }`.
**Permission:** `Complaint:View` (own) / `Complaint:Manage` (all).

#### `requestRefund(session, { complaintId, reason })`

**Permission:** `Refund:Request`
**Constraints:** Only complaint creator; only on `INVESTIGATING` or `RESOLVED` complaints; one refund per complaint.

#### `decideRefund(session, refundId, decision)`

`decision`: `'approved'` | `'rejected'`.
**Permission:** `Refund:Approve`

#### `getRefundByComplaint(session, complaintId)` / `getAllRefunds(session)`

**Permission:** `Refund:View` (own) / `Refund:Approve` (all).

---

### NotificationService

`src/services/NotificationService.js`

#### `create(userId, type, referenceId, message)` (internal)

Called by other services. Respects user notification preferences. Deduplicates unread notifications.

`type`: `'message'` | `'transaction'` | `'moderation'` | `'complaint'` | `'refund'`

#### `getMyNotifications(session)`

**Permission:** `Notification:View`
**Returns:** Array sorted by `createdAt` descending.

#### `getUnreadCount(session)`

**Permission:** `Notification:View`

#### `markAsRead(session, notificationId)` / `markAllAsRead(session)`

Ownership check enforced (no explicit permission beyond session).

---

### AnalyticsService

`src/services/AnalyticsService.js`

#### `computeKPIs(session)`

**Permission:** `Analytics:View`
**Returns:**

```typescript
{
  postVolume: { total, last24h, last7d, last30d },
  claimRate: { totalTransactions, totalComplaints, rate, percentage },
  avgHandlingTime: { averageMs, averageHours, resolvedCount },
  computedAt: number
}
```

#### `computeTrends(session, options)`

| Option | Type | Default |
|--------|------|---------|
| `metric` | `'listings'` \| `'transactions'` \| `'complaints'` | required |
| `periodDays` | number | 30 |
| `bucketSize` | `'day'` \| `'week'` \| `'month'` | `'day'` |

**Permission:** `Analytics:View`
**Returns:** `{ date, count }[]`

---

### AdminService

`src/services/AdminService.js`

#### `createCategory(session, { name, parentId?, sortOrder? })`

**Permission:** `Admin:ManageCategories`
`parentId`: FK → categories.id for nesting; null for root. `sortOrder`: numeric (default 0).

#### `updateCategory(session, categoryId, updates)`

**Permission:** `Admin:ManageCategories`
Cannot set category as its own parent.

#### `getAllCategories(session)` / `getCategoryTree(session)`

No permission required. Tree returns nested `{ ...category, children: [] }` structure.

---

### ExportImportService

`src/services/ExportImportService.js`

#### Export Modes

| Method | Mode | Users | Restores login? |
|--------|------|-------|----------------|
| `exportRedactedSnapshot(session)` | Redacted | Credentials stripped | No |
| `exportRestorableSnapshot(session, passphrase)` | Restorable | AES-256-GCM encrypted | Yes (with passphrase) |
| `exportFullSnapshot(session)` | _(deprecated alias)_ | → `exportRedactedSnapshot` | No |

#### `exportRedactedSnapshot(session)`

**Permission:** `Admin:Export`
**Returns:** Snapshot JSON with all stores. User records have `passwordHash`, `salt`, `securityQuestions[].answerHash`, `securityQuestions[].answerSalt` removed. Each user carries `_credentialsRedacted: true`. `_meta.mode: 'redacted'`, `_meta.redacted: true`.

#### `exportRestorableSnapshot(session, passphrase)`

**Permission:** `Admin:Export`
**Passphrase:** string, minimum 8 characters.
**Returns:** Same as redacted but also includes `_encryptedUsers: { ciphertext, iv, salt }` — the full user records encrypted with AES-256-GCM (PBKDF2-derived key, 100k iterations). Visible `users` array is still redacted. `_meta.mode: 'restorable'`, `_meta.redacted: false`.

#### `exportFiltered(session, storeNames)`

**Permission:** `Admin:Export`
Selected stores only. User credentials always redacted when `users` is included.

#### `exportReports(session, filters?)` / `exportReportsCSV(session, filters?)`

**Permission:** `Report:Export`
Filters: `status`, `targetType`, `reason`, `dateFrom`, `dateTo`.
CSV includes formula-injection protection (CWE-1236).

#### `exportAnalytics(session)`

**Permission:** `Analytics:Export`
**Returns:** `{ analytics: { kpis }, _meta }`

#### `importSnapshot(session, snapshot, options?)`

**Permission:** `Admin:Import`

| Snapshot mode | `options.passphrase` | Users behavior |
|---------------|---------------------|----------------|
| `mode: 'redacted'` | ignored | Users skipped |
| `mode: 'restorable'` | provided | Users decrypted and imported |
| `mode: 'restorable'` | missing | Users skipped |
| Legacy (no `mode`) | ignored | Users imported as-is |

`auditLogs` and `sessions` are never overwritten.
**Returns:** `{ success, importedStores, usersRestored }`
**Errors:** `ValidationError` (bad format, wrong passphrase, unsupported version)

#### `toCSV(data)`

Sync. Converts array of objects to CSV string with formula-injection protection.

#### `getAvailableStores()`

Sync. Returns all store names for export UI.

---

### AuditService

`src/services/AuditService.js`

Append-only event log. Protected from import/overwrite.

#### `log(actorId, action, entityType, entityId, metadata?)`

Internal. Called by all services. `actorId` is userId or `'system'`.

#### `getAll(session)`

**Permission:** `Admin:ViewAudit`

#### `getByActor(actorId)` / `getByEntityType(entityType)` / `count()`

Internal (no session required).

#### Audit Actions

```
USER_REGISTERED, USER_LOGIN, USER_LOGIN_FAILED, USER_LOGOUT, USER_LOCKED,
PASSWORD_CHANGED, PASSWORD_RECOVERED, PROFILE_UPDATED,
ROLE_ASSIGNED, ROLE_REMOVED,
LISTING_CREATED, LISTING_UPDATED, LISTING_STATUS_CHANGED,
LISTING_ROLLED_BACK, LISTING_DELETED,
TRANSACTION_CREATED, TRANSACTION_STATUS_CHANGED,
TRANSACTION_CANCELED, TRANSACTION_EXPIRED,
THREAD_CREATED, MESSAGE_SENT,
USER_BLOCKED, USER_UNBLOCKED,
REPORT_CREATED, REPORT_STATUS_CHANGED,
MODERATION_CASE_CREATED, MODERATION_DECISION,
COMPLAINT_CREATED, COMPLAINT_STATUS_CHANGED,
REFUND_REQUESTED, REFUND_DECISION,
DELIVERY_BOOKED,
CATEGORY_CREATED, CATEGORY_UPDATED,
SENSITIVE_WORD_ADDED, SENSITIVE_WORD_REMOVED,
DATA_EXPORTED, DATA_IMPORTED,
COVERAGE_UPDATED
```

---

### InitService

`src/services/InitService.js`

First-run setup service. Used only during initial application bootstrap.

#### `isInitialized()`

Returns `boolean` — true if any admin user exists. No session required.

#### `createInitialAdmin(input)`

Same fields as `AuthService.register()`. Creates user with `admin` role. Throws if already initialized.

#### `createBaselineCategories(session, categories)`

Creates initial category set during setup step 2.

#### `defaultCategories()`

Sync. Returns default category list for setup UI.
