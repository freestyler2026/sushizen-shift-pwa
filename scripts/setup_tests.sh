#!/bin/bash
# setup_tests.sh — install test dependencies and run all tests locally
# Run from the project root: bash scripts/setup_tests.sh
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ROOT="$(dirname "$ROOT")/sushizen_shift_app_clean"

echo "=== Installing frontend test dependencies ==="
cd "$ROOT"
npm install --save-dev \
  vitest \
  @vitejs/plugin-react \
  @testing-library/react \
  @testing-library/user-event \
  @testing-library/jest-dom \
  jsdom

echo ""
echo "=== Installing backend test dependencies ==="
pip install pytest pytest-cov httpx

echo ""
echo "=== Setting up local PostgreSQL test database ==="
# macOS: use brew postgresql
# Linux: use system postgresql
if command -v createdb &>/dev/null; then
  createdb test_sushizen 2>/dev/null || echo "  test_sushizen already exists"
else
  echo "  PostgreSQL not found — install with: brew install postgresql@16"
  exit 1
fi

export TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/test_sushizen"

echo ""
echo "=== Running frontend tests (Vitest) ==="
cd "$ROOT"
npx vitest run --reporter=verbose

echo ""
echo "=== Running backend tests (pytest) ==="
cd "$BACKEND_ROOT"
TEST_DATABASE_URL="$TEST_DATABASE_URL" pytest tests/ -v --tb=short

echo ""
echo "✅ All tests passed!"
