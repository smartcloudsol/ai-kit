#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
[[ "${1:-}" == "--help" ]] && { echo "Usage: ./scripts/debug-info.sh"; exit 0; }
[[ $# -eq 0 ]] || { echo "Unknown argument: $1" >&2; exit 2; }
echo "Repository: ${REPO_ROOT}"
echo "PHP: $(php --version 2>/dev/null | head -n 1 || echo unavailable)"
echo "Node: $(node --version 2>/dev/null || echo unavailable)"
echo "Yarn: $(yarn --version 2>/dev/null || echo unavailable)"
for package_name in core ui main admin blocks; do
    manifest="${REPO_ROOT}/${package_name}/package.json"
    # JavaScript template literal, not a shell expansion.
    # shellcheck disable=SC2016
    node -e 'const p=require(process.argv[1]); console.log(`${p.name}@${p.version}`)' "${manifest}"
done
for expected_file in smartcloud-ai-kit.php admin/php/admin.php admin/php/kb/repository.php includes/abilities-provider.php; do [[ -f "${REPO_ROOT}/${expected_file}" ]] && echo "Present: ${expected_file}" || echo "Missing: ${expected_file}"; done
echo "Git status (read-only):"
git -C "${REPO_ROOT}" status --short
