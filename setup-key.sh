#!/usr/bin/env bash
#
# Put an existing GenLayer private key into .env, safely.
#
#   bash setup-key.sh 0xYOUR_PRIVATE_KEY
#   bash setup-key.sh 0xYOUR_PRIVATE_KEY testnetAsimov
#
# Creates or updates .env without touching your other settings, and prints the
# address the key controls so you can confirm it is the funded one.

set -euo pipefail

KEY="${1:-}"
NETWORK="${2:-studionet}"

RED=$'\033[31m'; GREEN=$'\033[32m'; YEL=$'\033[33m'; OFF=$'\033[0m'
ok()  { printf '  %sok%s  %s\n' "$GREEN" "$OFF" "$1"; }
die() { printf '\n%sstopped:%s %s\n\n' "$RED" "$OFF" "$1" >&2; exit 1; }

[ -f package.json ] || die "run this from inside the varai folder"

if [ -z "$KEY" ]; then
  cat <<'EOF'

Usage:  bash setup-key.sh 0xYOUR_PRIVATE_KEY [network]

  network defaults to studionet (also: testnetAsimov, localnet)

Do not have a key yet?   npm run genkey

EOF
  exit 1
fi

# Accept with or without the 0x prefix.
KEY="${KEY#0x}"
KEY="0x${KEY}"

# A GenLayer/EVM private key is 32 bytes = 64 hex chars after 0x.
if ! printf '%s' "$KEY" | grep -qE '^0x[a-fA-F0-9]{64}$'; then
  LEN=$(( ${#KEY} - 2 ))
  die "that does not look like a private key.
  Expected 64 hex characters after 0x, got ${LEN}.

  Tip: an ADDRESS is 40 characters (0x1234...) — you need the PRIVATE KEY,
  which is longer. Never paste an address here."
fi
ok "private key format valid"

case "$NETWORK" in
  studionet|testnetAsimov|localnet) ok "network: $NETWORK" ;;
  *) die "unknown network '$NETWORK' (studionet | testnetAsimov | localnet)" ;;
esac

# --- write .env without clobbering existing settings ------------------------
touch .env

set_var() {
  local k="$1" v="$2"
  if grep -qE "^${k}=" .env 2>/dev/null; then
    # Portable in-place edit (BSD and GNU sed differ on -i).
    grep -vE "^${k}=" .env > .env.tmp && mv .env.tmp .env
  fi
  printf '%s=%s\n' "$k" "$v" >> .env
}

set_var GENLAYER_PRIVATE_KEY "$KEY"
set_var GENLAYER_NETWORK "$NETWORK"
set_var VARAI_DEMO_MODE "false"
ok "wrote .env"

# --- show which address this key controls -----------------------------------
ADDR=$(node --input-type=module -e "
import { createAccount } from 'genlayer-js';
try { console.log(createAccount('$KEY').address); } catch { console.log(''); }
" 2>/dev/null || true)

if [ -n "$ADDR" ]; then
  ok "address: $ADDR"
  printf '\n  %sConfirm this is the address you funded.%s\n' "$YEL" "$OFF"
else
  printf '  %swarn%s  could not derive the address (run npm install first)\n' "$YEL" "$OFF"
fi

# --- safety -----------------------------------------------------------------
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git check-ignore -q .env 2>/dev/null; then
    ok ".env is gitignored — it will not be committed"
  else
    printf '\n%sWARNING:%s .env is NOT ignored by git. Add it to .gitignore now.\n' "$RED" "$OFF"
  fi
fi

cat <<EOF

Next:

  npm run deploy:contract     deploy the contract, prints the address

Then add the printed address to .env:

  GENLAYER_CONTRACT_ADDRESS=0x...

and run:

  npm run dev                 verify /api/health shows mode GENLAYER

EOF
