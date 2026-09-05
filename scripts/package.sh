#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ASSEMBLER="${REPO_ROOT}/../smartcloud-agent-ready-product-family/scripts/build-wpsuite-plugins.sh"
[[ "${1:-}" == "--help" ]] && { echo "Usage: ./scripts/package.sh"; exit 0; }
[[ $# -eq 0 ]] || { echo "Unknown argument: $1" >&2; exit 2; }
[[ -x "${ASSEMBLER}" ]] || { echo "Canonical assembler is unavailable: ${ASSEMBLER}" >&2; exit 1; }
"${ASSEMBLER}" --plugin smartcloud-ai-kit

