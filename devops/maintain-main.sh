#!/bin/bash
#
# Daily main-branch maintenance script.
# Fetches, fast-forward pulls, runs CI, then pushes origin/main if new commits exist.
# Exits early when the working tree is dirty to preserve the "no direct commits on main" rule.

set -euo pipefail

REPO_DIR="${REPO_DIR:-/Users/aurel/codex-jesus}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
CI_COMMAND="${CI_COMMAND:-}"

log() {
  printf '[maintain-main] %s\n' "$*"
}

die() {
  log "ERROR: $*"
  exit 1
}

[ -d "$REPO_DIR/.git" ] || die "Repo dir $REPO_DIR does not look like a git repository"
cd "$REPO_DIR"

# Safety: bail if there are unstaged/staged changes
if [ -n "$(git status --porcelain)" ]; then
  die "Working tree is dirty. Commit (on a feature branch) or stash before running this script."
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$MAIN_BRANCH" ]; then
  log "Switching from $current_branch to $MAIN_BRANCH"
  git checkout "$MAIN_BRANCH"
fi

log "Fetching latest refs from $REMOTE_NAME"
git fetch --prune "$REMOTE_NAME"

log "Fast-forwarding $MAIN_BRANCH"
git pull --ff-only "$REMOTE_NAME" "$MAIN_BRANCH"

[ -n "$CI_COMMAND" ] || die "CI_COMMAND is not set. Provide the test command to run before pushing."
log "Running CI command: $CI_COMMAND"
eval "$CI_COMMAND"

# Ensure we still have a clean tree after CI (in case tooling generated files)
if [ -n "$(git status --porcelain)" ]; then
  die "CI produced file changes. Commit or discard them on a feature branch before pushing main."
fi

local_sha="$(git rev-parse "$MAIN_BRANCH")"
remote_sha="$(git rev-parse "$REMOTE_NAME/$MAIN_BRANCH")"

if [ "$local_sha" = "$remote_sha" ]; then
  log "No new commits to push. $REMOTE_NAME/$MAIN_BRANCH already up to date."
  exit 0
fi

log "Pushing $MAIN_BRANCH to $REMOTE_NAME"
git push "$REMOTE_NAME" "$MAIN_BRANCH"
log "Done."

