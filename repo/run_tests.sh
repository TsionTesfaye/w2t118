#!/bin/bash
# TradeLoop Test Runner
#
# Directory structure:
#   unit_tests/   — pure unit tests (domain, services, routing, ui)
#   API_tests/    — API contract / service integration tests
#   e2e_tests/    — service-level end-to-end flow tests (no browser)
#   browser_tests/— Playwright browser E2E tests
#
# Usage:
#   ./run_tests.sh              — all suites
#   ./run_tests.sh --unit       — unit_tests only
#   ./run_tests.sh --api        — API_tests only
#   ./run_tests.sh --e2e        — e2e_tests only
#   ./run_tests.sh --browser    — browser_tests (Playwright) only
#   ./run_tests.sh --all        — all suites (same as default)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Dependency Check ──
if [ ! -d "node_modules" ]; then
  echo "  node_modules not found — running npm install..."
  npm install --ignore-scripts 2>&1 | tail -1
fi

# ── Build Validation ──
echo "============================================"
echo "  BUILD VALIDATION"
echo "============================================"
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?
if [ $BUILD_EXIT -eq 0 ]; then
  echo "  Build succeeded"
else
  echo "  BUILD FAILED — aborting tests"
  echo ""
  echo "  Build output:"
  echo "$BUILD_OUTPUT" | tail -20
  echo ""
  exit 1
fi

PASSED=0
FAILED=0
TOTAL=0
FAILED_TESTS=""

run_test() {
  local test_file="$1"
  TOTAL=$((TOTAL + 1))

  echo ""
  echo "Running: $test_file"
  if node --experimental-vm-modules "$test_file" 2>&1; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    FAILED_TESTS="$FAILED_TESTS\n  - $test_file"
  fi
}

run_unit_tests() {
  echo "============================================"
  echo "  UNIT TESTS  (unit_tests/)"
  echo "============================================"

  for f in unit_tests/domain/*.js unit_tests/services/*.js unit_tests/routing/*.js unit_tests/ui/*.js; do
    [ -f "$f" ] && run_test "$f"
  done
}

run_api_tests() {
  echo ""
  echo "============================================"
  echo "  API / INTEGRATION TESTS  (API_tests/)"
  echo "============================================"

  for f in API_tests/*.js; do
    [ -f "$f" ] && run_test "$f"
  done
}

run_e2e_service_tests() {
  echo ""
  echo "============================================"
  echo "  SERVICE-LEVEL E2E TESTS  (e2e_tests/)"
  echo "============================================"

  for f in e2e_tests/*.js; do
    [ -f "$f" ] && run_test "$f"
  done
}

run_browser_tests() {
  echo ""
  echo "============================================"
  echo "  BROWSER E2E TESTS  (browser_tests/ — Playwright)"
  echo "============================================"
  echo "  Requires: built app (npm run build already ran above)"
  echo "  Server:   Playwright auto-starts via webServer config"
  TOTAL=$((TOTAL + 1))
  if npx playwright test; then
    PASSED=$((PASSED + 1))
  else
    FAILED=$((FAILED + 1))
    FAILED_TESTS="$FAILED_TESTS\n  - browser_tests/playwright"
  fi
}

# ── Parse arguments ──
MODE="${1:---all}"

case "$MODE" in
  --unit)
    run_unit_tests
    ;;
  --api)
    run_api_tests
    ;;
  --e2e)
    run_e2e_service_tests
    ;;
  --browser)
    run_browser_tests
    ;;
  --all|*)
    run_unit_tests
    run_api_tests
    run_e2e_service_tests
    run_browser_tests
    ;;
esac

# ── Summary ──
echo ""
echo "============================================"
echo "  FINAL SUMMARY"
echo "============================================"
echo "  Total test suites: $TOTAL"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "  Failed test suites:"
  echo -e "$FAILED_TESTS"
  echo ""
  exit 1
else
  echo ""
  echo "  All tests passed!"
  echo ""
  exit 0
fi
