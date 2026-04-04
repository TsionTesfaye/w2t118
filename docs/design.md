# design.md

## 1. System Overview

TradeLoop is a fully offline, browser-based Vue.js SPA for a secondhand marketplace with built-in moderation, support workflows, and administration.

The system supports:
- marketplace browsing and listing management
- private messaging tied to listings
- transaction lifecycle management
- delivery and pickup coordination
- reporting and moderation workflows
- support complaint handling
- role-based administration
- local analytics and data export/import

All logic runs client-side. Data is stored in IndexedDB (primary) and LocalStorage (secondary).

⚠️ SECURITY LIMITATION  
This is a client-only system:
- RBAC is not secure
- sessions can be tampered with
- this is simulation-grade security only

---

## 2. Design Goals

- Fully offline operation with no backend dependency
- Strong service-layer enforcement of all rules
- Deterministic workflows (transactions, moderation, delivery, complaints)
- No undefined lifecycle states
- Complete auditability

---

## 3. High-Level Architecture

UI Layer  
↓  
Store Layer  
↓  
Service Layer  
↓  
Repository Layer  
↓  
IndexedDB + LocalStorage  

### Key Principle

All business logic must exist in services.  
UI must not enforce rules.

---

## 4. Core Modules

- Auth
- Users
- Addresses
- Listings
- Threads
- Transactions
- Delivery
- Comments & Q&A
- Reports
- Moderation
- Support
- Admin
- Analytics
- Notifications
- Audit logging
- Import/Export

---

## 5. Core Domain Models

### User
- id, username
- passwordHash, salt
- roles[]
- displayName, avatar, bio
- securityQuestions (hashed)
- notificationPreferences
- lockoutUntil, failedAttempts

---

### Address
- userId
- full address fields
- zipCode (5 digits)
- state (required)
- phone (formatted)
- isDefault

Rule: one default per user

---

### Listing

#### Fields
- sellerId
- title
- description
- categoryId
- tagIds[]
- media[]
- price
- deliveryOptions
- isPinned
- isFeatured
- createdAt

#### States (NEW)
- draft
- active
- under_review
- rejected
- sold
- archived

#### Rules
- sold when transaction completes
- rejected listings editable and resubmittable
- archived listings hidden but retained

---

### ListingVersion
- full snapshot of listing
- max 10 retained

---

### Category (NEW)
- id
- name
- parentId
- sortOrder

---

### Thread
- listingId
- buyerId, sellerId
- messages[]
- isReadOnly

---

### Transaction

#### States
- inquiry
- reserved
- agreed
- completed
- canceled

#### Transitions
- inquiry → reserved → agreed → completed
- inquiry/reserved/agreed → canceled

#### Rules
- cancellation requires reason
- only one active reservation
- reserved expires after 30 minutes
- expiration → canceled
- listing becomes available after cancel

---

### Complaint (FULLY DEFINED)

#### Fields
- id
- userId
- transactionId
- issueType
- description
- status
- resolution
- createdAt

#### States
- open
- investigating
- resolved
- rejected

#### Rules
- support agent controls transitions
- SLA enforced for response
- resolution required

---

### Refund

- id
- complaintId
- transactionId
- status
- reason

#### States
- requested
- approved
- rejected

Rules:
- tied to complaint resolution
- logical only (no payments)

---

### Notification

- id
- userId
- type
- referenceId
- message
- isRead
- createdAt

Triggers:
- new message
- moderation decision
- transaction update
- complaint update

---

### Comment / QA

- id
- listingId
- userId
- content
- media[]
- type
- createdAt

Rules:
- seller can answer questions
- moderation applies

---

### SensitiveWord

- id
- word
- matchType

Rules:
- admin-managed
- used in pre-screen

---

### AuditLog
- actorId
- action
- entityType
- entityId
- timestamp
- metadata

---

## 6. Transaction State Machine

- strict transitions
- no invalid transitions allowed
- expiration handled by:
  - periodic check
  - validation on read

---

## 7. Messaging Rules

- threads tied to listings
- blocked users cannot create threads
- completed/canceled → read-only
- no deletion allowed

---

## 8. Delivery System

### Coverage
- ZIP prefix matching

### Scheduling
- configurable daily time slots
- 2-hour windows
- max 8 deliveries per window
- supports future dates

---

## 9. Moderation Pipeline

report → pre-screen → review → decision → penalty

Pre-screen:
- uses SensitiveWord table

---

## 10. Notifications

- stored in IndexedDB
- unread count maintained
- marked read on access

---

## 11. RBAC

- flat permission model
- enforced in UI + services

⚠️ NOT secure (client-only)

---

## 12. Authentication & Security

- Web Crypto hashing
- idle timeout: 30 min
- absolute timeout: 12h

---

## 13. Multi-Tab Sync

- BroadcastChannel API
- last-write-wins

---

## 14. Persistence

IndexedDB:
- all data

LocalStorage:
- preferences
- session metadata

---

## 15. Analytics

- computed from event timestamps

KPIs:
- post volume
- claim rate
- handling time

---

## 16. Import / Export

- admin only
- full or filtered export
- import:
  - overwrite or cancel
  - no merging

---

## 17. Validation Rules

All enforced in services.

---

## 18. Error Handling

- no silent failures
- structured errors

---

## 19. Logging & Audit

append-only logs for:
- transactions
- moderation
- complaints
- role changes

---

## 20. Additional System Rules

### Search
- client-side filtering

### Pagination
- required for large datasets

### Media Limits
- images ≤ 2MB
- videos ≤ 10MB (max 2)

### Data Retention
- no deletion of audit logs