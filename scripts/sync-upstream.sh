#!/usr/bin/env bash
# Merge the latest upstream pawverwatch into this fork without letting its Overwatch
# content (new heroes, maps, examples) leak in or cause conflicts.
#
#   scripts/sync-upstream.sh
#
# Upstream's editor code is merged normally. If it conflicts with ours the merge is left
# in progress for you to resolve by hand; nothing is ever pushed.
set -euo pipefail

UPSTREAM_URL="https://github.com/ThaiDuongVu/pawverwatch.git"
UPSTREAM_BRANCH="${1:-main}"

# Overwatch-only content, never wanted here. Deadlock art lives in public/images/deadlock and
# public/data/deadlock (generated, untracked), so these paths are upstream's alone.
OVERWATCH_PATHS=(
  public/data/heroes.json
  public/data/modes.json
  public/images/heroes
  public/images/items
  public/images/maps
  public/images/modes
  public/images/examples
  public/images/screenshots
)

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first, the working tree has to be clean." >&2
  exit 1
fi

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
# Lets .gitattributes "merge=ours" keep this fork's own files (README, home page, branding)
git config merge.ours.driver true

git fetch upstream "$UPSTREAM_BRANCH"
if git merge-base --is-ancestor FETCH_HEAD HEAD; then
  echo "Already up to date with upstream."
  exit 0
fi

merge_output="$(git merge --no-commit --no-ff FETCH_HEAD 2>&1)" || true
if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  echo "$merge_output" >&2
  echo "The merge could not start." >&2
  exit 1
fi

# Drop upstream's Overwatch content, whether it merged cleanly or conflicted
git rm -r -f -q --ignore-unmatch -- "${OVERWATCH_PATHS[@]}"

# Anything else we deleted on purpose and upstream then edited stays deleted
git diff --name-only --diff-filter=U -z | while IFS= read -r -d '' path; do
  if [ -z "$(git ls-files --stage -- "$path" | awk '$3 == 2')" ]; then
    git rm -f -q -- "$path"
  fi
done

conflicts="$(git diff --name-only --diff-filter=U)"
if [ -n "$conflicts" ]; then
  echo "Upstream changed code that this fork also changed. Resolve these, then run 'git commit':" >&2
  echo "$conflicts" | sed 's/^/  /' >&2
  exit 1
fi

git commit -q -m "Merge upstream pawverwatch"
echo "Merged upstream. Rebuild to pick up any editor changes."
