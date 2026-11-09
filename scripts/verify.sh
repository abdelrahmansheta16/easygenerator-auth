#!/usr/bin/env bash
# One-command verification: lint + build + unit tests for both apps.
# Backend e2e tests additionally run when MongoDB is reachable on :27017.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== backend: lint, build, unit tests =="
npm --prefix backend run lint
npm --prefix backend run build
npm --prefix backend test

if nc -z localhost 27017 >/dev/null 2>&1; then
  echo "== backend: e2e tests (MongoDB reachable) =="
  npm --prefix backend run test:e2e
else
  echo "== backend e2e SKIPPED: start MongoDB first (docker compose up -d mongo) =="
fi

echo "== frontend: lint, build =="
npm --prefix frontend run lint
npm --prefix frontend run build

echo "VERIFY_OK"
