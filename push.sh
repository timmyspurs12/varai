#!/usr/bin/env bash
#
# VARAI — first push to GitHub.
#
#   bash push.sh https://github.com/YOURNAME/varai.git
#
# Safe to re-run: if the repo already exists it just commits and pushes.
# Refuses to continue if a secret would be committed.

set -euo pipefail

REMOTE="${1:-}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m  %s\n' "$*"; }
die()  { printf '\n\033[31mstopped:\033[0m %s\n\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- checks
say "Checking your tools"
command -v git  >/dev/null || die "git is not installed — https://git-scm.com/downloads"
ok "git $(git --version | awk '{print $3}')"

if command -v node >/dev/null; then
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  [ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old — VARAI needs v20 or higher"
  ok "node $(node -v)"
else
  printf '  \033[33mwarn\033[0m  node not found (only needed to run the app, not to push)\n'
fi

[ -f package.json ] || die "run this from inside the varai folder (no package.json here)"
ok "in the project folder"

# ---------------------------------------------------------------- identity
if [ -z "$(git config --global user.name || true)" ]; then
  die 'set your identity first:
  git config --global user.name  "Your Name"
  git config --global user.email "you@example.com"'
fi
ok "identity: $(git config --global user.name) <$(git config --global user.email)>"

# ---------------------------------------------------------------- stage
say "Staging files"
[ -d .git ] || { git init -q; ok "initialised a new repository"; }
git add -A
COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
ok "$COUNT files staged"

# ---------------------------------------------------------------- safety
say "Checking nothing secret is about to be committed"
LEAKS=$(git diff --cached --name-only | grep -E 'node_modules|\.env$|^dist/|__pycache__|\.pyc$' || true)
[ -z "$LEAKS" ] || die "these should never be committed:
$LEAKS

Fix .gitignore, then:  git rm -r --cached <path>"
ok "no node_modules, .env, dist or __pycache__"

KEYS=$(git diff --cached --name-only -z \
       | xargs -0 grep -lIE '(PRIVATE_KEY|SECRET)[[:space:]]*[=:][[:space:]]*.?0x[a-fA-F0-9]{40,}' 2>/dev/null || true)
[ -z "$KEYS" ] || die "a private key looks hardcoded in:
$KEYS"
ok "no hardcoded private keys"

# ---------------------------------------------------------------- commit
say "Committing"
if git diff --cached --quiet; then
  ok "nothing new to commit"
else
  DEFAULT_MSG="VARAI — The Internet's Referee: GenLayer football judgment platform"
  MSG="${COMMIT_MSG:-$DEFAULT_MSG}"
  git commit -q -m "$MSG"
  ok "$(git log -1 --oneline)"
fi
git branch -M main
ok "branch: main"

# ---------------------------------------------------------------- push
if [ -z "$REMOTE" ] && ! git remote get-url origin >/dev/null 2>&1; then
  say "Almost done — one step left"
  cat <<'EOF'
  Create an EMPTY repo at https://github.com/new  (no README, no .gitignore),
  then run:

      bash push.sh https://github.com/YOURNAME/varai.git

EOF
  exit 0
fi

if [ -n "$REMOTE" ]; then
  git remote get-url origin >/dev/null 2>&1 \
    && git remote set-url origin "$REMOTE" \
    || git remote add origin "$REMOTE"
fi
ok "remote: $(git remote get-url origin)"

say "Pushing to GitHub"
echo "  If prompted for a password, use a Personal Access Token:"
echo "  https://github.com/settings/tokens  →  Generate new token (classic)  →  tick 'repo'"
echo
git push -u origin main

say "Done"
echo "  Your code is on GitHub. Next: deploy it — see DEPLOY.md Part 2."
echo
