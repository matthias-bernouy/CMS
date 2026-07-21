#!/usr/bin/env bash
set -euo pipefail

manifest_directory="${RUNNER_TEMP:?RUNNER_TEMP is required}"
first_manifest="${manifest_directory}/build-first.json"
second_manifest="${manifest_directory}/build-second.json"
worktree_status="${manifest_directory}/worktree-status"

bun run build
bun run quality/ci/determinism/build-manifest.ts "${first_manifest}"
bun run clean
bun run build
bun run quality/ci/determinism/build-manifest.ts "${second_manifest}"
diff --unified "${first_manifest}" "${second_manifest}"

git diff --exit-code
git status --porcelain --untracked-files=all > "${worktree_status}"
test ! -s "${worktree_status}"
