#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
[[ "${1:-}" == "--help" ]] && { echo "Usage: ./scripts/check.sh"; exit 0; }
[[ $# -eq 0 ]] || { echo "Unknown argument: $1" >&2; exit 2; }
for command_name in yarn php; do command -v "${command_name}" >/dev/null || { echo "Missing: ${command_name}" >&2; exit 1; }; done
for package_name in core ui main admin blocks; do echo "Linting ${package_name}"; yarn --cwd "${REPO_ROOT}/${package_name}" lint; done
echo "Testing core"; yarn --cwd "${REPO_ROOT}/core" test
echo "Testing UI"; yarn --cwd "${REPO_ROOT}/ui" test
echo "Testing admin"; yarn --cwd "${REPO_ROOT}/admin" test
echo "Testing block fallback"; yarn --cwd "${REPO_ROOT}/blocks" test
php "${REPO_ROOT}/tests/abilities-fallback.test.php"
php "${REPO_ROOT}/tests/kb-review-notice.test.php"
php "${REPO_ROOT}/tests/source-publication-status.test.php"
php "${REPO_ROOT}/tests/knowledge-sync-outbox.test.php"
php "${REPO_ROOT}/tests/knowledge-sync-transport.test.php"
while IFS= read -r -d '' php_file; do php -l "${php_file}" >/dev/null; done < <(find "${REPO_ROOT}" -type f -name '*.php' -not -path '*/vendor/*' -not -path '*/node_modules/*' -print0)
echo "AI Kit checks passed."
