#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
[[ "${1:-}" == "--help" ]] && { echo "Usage: ./scripts/build.sh"; exit 0; }
[[ $# -eq 0 ]] || { echo "Unknown argument: $1" >&2; exit 2; }
command -v yarn >/dev/null || { echo "Missing: yarn" >&2; exit 1; }
for package_name in core ui main admin blocks; do echo "Building ${package_name}"; yarn --cwd "${REPO_ROOT}/${package_name}" build; done
echo "Source builds complete. Use ./scripts/package.sh for the canonical WordPress ZIP."

