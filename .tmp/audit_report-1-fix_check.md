# Previous Inspection Issue Recheck (2026-04-08)

Scope: Re-verify the two previously reported issues only.

## Issue 1
**Original conclusion:** “Full snapshot export/import does not provide full account round-trip restoration.”  
**Status:** **PASS (Fixed)**

### Evidence
- Restorable snapshot export now exists and explicitly supports credential-bearing restore:
  - `src/services/ExportImportService.js:209-246` (`exportRestorableSnapshot`)
  - Sets `_meta.mode = "restorable"` and `_meta.redacted = false` at `src/services/ExportImportService.js:236-237`
  - Stores encrypted user bundle in `_encryptedUsers` at `src/services/ExportImportService.js:230`
- Import path now restores users when passphrase is provided:
  - `src/services/ExportImportService.js:424-443` (decrypt + import users)
  - Returns `usersRestored` flag at `src/services/ExportImportService.js:461-465`
- Admin UI exposes this path (not service-only):
  - Restorable export controls: `src/views/admin/tabs/AdminDataTab.vue:17-35`
  - Restorable import detection + passphrase input: `src/views/admin/tabs/AdminDataTab.vue:153-173,393-399`
  - Import uses passphrase option: `src/views/admin/tabs/AdminDataTab.vue:425-429`
- Runtime verification of round-trip restore passed:
  - Command: `node --experimental-vm-modules e2e_tests/test_e2e_backup_restore.js`
  - Result: `10 passed, 0 failed`

### Note
- `exportFullSnapshot` remains a deprecated alias to redacted export (`src/services/ExportImportService.js:197-200`).
- Full account restoration is now provided via the explicit **restorable snapshot** flow.

---

## Issue 2
**Original conclusion:** “Tests enforce reduced snapshot contract and do not guard full-snapshot expectation.”  
**Status:** **PASS (Fixed)**

### Evidence
- Unit tests now assert restorable export/import behavior:
  - Restorable metadata/encryption checks: `unit_tests/services/test_export_service.js:612-624`
  - Restorable import with passphrase restores users: `unit_tests/services/test_export_service.js:650-676`
  - Restorable import without passphrase skips users: `unit_tests/services/test_export_service.js:678-693`
  - Wrong passphrase fails: `unit_tests/services/test_export_service.js:695-706`
- E2E tests now cover account round-trip login restoration:
  - Round-trip restore + login success after import: `e2e_tests/test_e2e_backup_restore.js:161-190`
  - Wrong password still fails after restore: `e2e_tests/test_e2e_backup_restore.js:192-225`
- Runtime verification of test suites passed:
  - Command: `node --experimental-vm-modules unit_tests/services/test_export_service.js` → `41 passed, 0 failed`
  - Command: `node --experimental-vm-modules e2e_tests/test_e2e_backup_restore.js` → `10 passed, 0 failed`

---

## Final Result
- Issue 1: **PASS (Fixed)**
- Issue 2: **PASS (Fixed)**
