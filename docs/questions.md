# questions.md

## Business Logic Questions Log

---

### 1. Transaction State Machine Enforcement

**Question:**  
The prompt defines transaction states (`inquiry → reserved → agreed → completed`) with cancellation allowed at certain stages, but does not explicitly define invalid transitions or concurrency handling (e.g., two buyers attempting to reserve simultaneously).

**Assumption:**  
- State transitions must be strictly linear and enforced at the service/store layer.  
- Only one active buyer can reserve at a time.  
- Reserved state includes a lock on the listing for 30 minutes.

**Solution:**  
Implemented a transaction state machine in the service layer with:
- Explicit allowed transitions
- Guard clauses rejecting invalid transitions
- Reservation lock with timestamp expiration
- Conflict resolution: first valid reserve wins, others fail

---

### 2. Reservation Timer Expiry Behavior

**Question:**  
The prompt specifies a 30-minute hold timer for `reserved` but does not define what happens after expiration.

**Assumption:**  
- If the timer expires without moving to `agreed`, the reservation is automatically canceled.
- Listing becomes available again.

**Solution:**  
Implemented:
- Background timer check (computed on access in SPA)
- Auto-transition from reserved → canceled
- UI reflects expired reservations and unlocks listing

---

### 3. Messaging Thread Ownership and Lifecycle

**Question:**  
Threads are tied to listings, but ownership rules (who can delete, archive, or reopen threads) are unclear.

**Assumption:**  
- Threads cannot be deleted (for audit purposes)
- Threads can be archived by users individually
- Threads become read-only if:
  - user is blocked
  - transaction is completed/canceled

**Solution:**  
- Implemented soft archive per user
- Enforced read-only state based on:
  - block status
  - transaction final states
- No hard deletion allowed

---

### 4. Blocking vs Reporting Behavior

**Question:**  
The difference between "block" and "report" actions and their interaction is not explicitly defined.

**Assumption:**  
- Block = personal restriction (prevents interaction)
- Report = moderation-triggering event
- Blocking does NOT automatically report

**Solution:**  
- Block:
  - Prevents new threads
  - Locks existing threads (read-only)
- Report:
  - Creates moderation case
  - Triggers review workflow
- Stored separately in IndexedDB

---

### 5. Moderation Workflow Depth

**Question:**  
The prompt describes "pre-screen + human review + penalty" but does not define rejection loops or re-submission behavior.

**Assumption:**  
- Content flagged in pre-screen is still saved but marked pending review
- Moderator can:
  - approve
  - reject with violation tags
- Rejected content can be edited and resubmitted

**Solution:**  
Implemented moderation pipeline:
- Pre-screen → flagged status
- Review queue for moderators
- Decision creates audit log
- Editable rejected content creates new version

---

### 6. Versioning Scope for Listings

**Question:**  
The prompt states versioning with rollback up to last 10 versions but does not specify what fields are versioned.

**Assumption:**  
- Entire listing snapshot (title, description, media, tags) is versioned
- Metadata (views, likes) is NOT versioned

**Solution:**  
- Stored full snapshot history (max 10)
- Implemented rollback replacing current version
- Non-versioned fields excluded from snapshots

---

### 7. Delivery Coverage Logic

**Question:**  
ZIP-based coverage validation is mentioned, but matching logic (exact vs prefix vs range) is unclear.

**Assumption:**  
- Coverage is based on ZIP prefix matching (first 3 digits)
- Admin manages allowed prefixes

**Solution:**  
- Implemented prefix-based matching (e.g., 070* matches)
- Coverage table stored in IndexedDB
- Validation occurs before checkout/booking

---

### 8. Delivery Capacity Enforcement

**Question:**  
The rule "max 8 deliveries per 2-hour window" does not define scope (global vs per seller vs per region).

**Assumption:**  
- Capacity is global per system (simplified offline model)
- Applies per time window slot

**Solution:**  
- IndexedDB stores delivery bookings by time window
- Validation checks count < 8 before allowing booking
- Rejects otherwise with UI feedback

---

### 9. Address Validation Strictness

**Question:**  
US address rules are specified, but edge cases (international users, formatting flexibility) are not defined.

**Assumption:**  
- Only US addresses are supported in this version
- Strict validation enforced:
  - ZIP = 5 digits
  - State required
  - Phone formatted

**Solution:**  
- Implemented strict validation rules
- Input masking for phone numbers
- Rejected invalid formats at form level

---

### 10. Authentication & Session Storage

**Question:**  
Session token behavior (refresh, multi-tab sync, invalidation) is not fully specified.

**Assumption:**  
- Single active session per user (per browser)
- Token stored in memory + IndexedDB fallback
- Idle timeout enforced via activity tracking

**Solution:**  
- Implemented:
  - Idle timeout (30 min)
  - Absolute timeout (12h)
- Auto logout on expiry
- Store sync ensures consistent state across tabs

---

### 11. Password Recovery via Security Questions

**Question:**  
The prompt requires offline recovery but does not define retry limits or security handling.

**Assumption:**  
- Limited attempts (e.g., 3 tries)
- Answers stored as salted hashes
- No plaintext recovery

**Solution:**  
- Implemented hashed answer verification using Web Crypto
- Retry limit enforced
- Lockout after repeated failures

---

### 12. RBAC Granularity

**Question:**  
The prompt mentions permissions like "Content:Delete" but does not define inheritance or grouping.

**Assumption:**  
- Flat permission model (no inheritance)
- Roles are collections of permissions

**Solution:**  
- Defined permission map
- Roles assigned explicit permissions
- UI + service layer checks for each action

---

### 13. Analytics Calculation Scope

**Question:**  
KPI definitions (claim rate, handling time) are mentioned but not mathematically defined.

**Assumption:**  
- Claim rate = (# complaints / # transactions)
- Handling time = avg(time from report → resolution)

**Solution:**  
- Computed KPIs from IndexedDB event timestamps
- Stored aggregates for dashboard rendering

---

### 14. Data Export Scope

**Question:**  
Export/import functionality is mentioned but not scoped (full DB vs filtered vs role-based).

**Assumption:**  
- Admin can:
  - export full snapshot
  - export filtered datasets (users, listings, reports)
- Other roles cannot export

**Solution:**  
- Implemented export service using Blob/FileSaver
- Role-restricted export actions
- CSV/Excel-compatible formatting

---

### 15. Media Storage Handling (Offline Constraints)

**Question:**  
The prompt allows images/videos but does not define storage limits or encoding.

**Assumption:**  
- Media stored as base64 or Blob in IndexedDB
- Size limits required for performance

**Solution:**  
- Implemented:
  - size limits (e.g., images ≤ 2MB)
  - compression before storage
- Stored references in IndexedDB

---

### 16. Audit Logging Scope

**Question:**  
Audit events are mentioned but not defined in detail (what actions are logged).

**Assumption:**  
- All critical actions must be logged:
  - login/logout
  - moderation decisions
  - transactions
  - role changes

**Solution:**  
- Implemented centralized audit log store
- Each event includes:
  - actor
  - action
  - timestamp
  - metadata

  ---

### 17. Complaint Workflow Definition

**Issue:**  
Complaint lifecycle missing.

**Resolution:**  
Defined states:
- open → investigating → resolved/rejected  

Support agent controls transitions.

---

### 18. Refund System Definition

**Issue:**  
Refund undefined.

**Resolution:**  
- Refund entity created
- tied to complaint
- logical only (no payments)

---

### 19. Notification System

**Issue:**  
Not defined.

**Resolution:**  
- Notification entity added
- event-driven creation

---

### 20. Multi-Tab Sync

**Issue:**  
Not defined.

**Resolution:**  
- BroadcastChannel API used
- last-write-wins strategy

---

### 21. Listing Lifecycle

**Issue:**  
States missing.

**Resolution:**  
States defined:
- draft, active, under_review, rejected, sold, archived

---

### 22. Sensitive Word Management

**Issue:**  
Word list undefined.

**Resolution:**  
- admin-managed table
- substring matching

---

### 23. Import Conflict Handling

**Issue:**  
Undefined.

**Resolution:**  
- overwrite or cancel
- no merging
