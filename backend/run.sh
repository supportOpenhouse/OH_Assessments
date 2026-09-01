#!/usr/bin/env bash
#
# LOCAL development only. Render runs `uvicorn app.main:app` directly, so nothing
# in this file reaches production — which is why it can safely relax defaults
# that must stay strict on a deployed service.
#
#   ./run.sh
#
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { cp .env.example .env
  echo "→ created backend/.env from the template. Fill it in, then re-run."; exit 1; }

set -a; . ./.env; set +a

# ── local-only defaults ───────────────────────────────────────────────────
# A Secure cookie is never sent over http, so sign-in fails silently at
# localhost. Production sets COOKIE_SECURE=true in render.yaml.
export COOKIE_SECURE="${COOKIE_SECURE:-false}"

# ── say what is missing, rather than failing three layers down ────────────
missing=()
[ -z "${DATABASE_URL:-}" ]           && missing+=("DATABASE_URL            (Neon pooled connection string)")
[ -z "${GOOGLE_OAUTH_CLIENT_ID:-}" ] && missing+=("GOOGLE_OAUTH_CLIENT_ID  (sign-in will 401 without it)")
if [ ${#missing[@]} -gt 0 ]; then
  echo; echo "backend/.env is missing:"; printf '  · %s\n' "${missing[@]}"; echo
  exit 1
fi

# The app will not start without a 32+ char signing key. Generate one once and
# keep it, so restarting the server does not sign you out.
if [ -z "${JWT_SECRET:-}" ]; then
  [ -f .dev-secret ] || { openssl rand -hex 32 > .dev-secret; chmod 600 .dev-secret
    echo "→ generated backend/.dev-secret (gitignored, local only)"; }
  export JWT_SECRET="$(cat .dev-secret)"
fi

# These only bite once something is actually scored, so warn rather than block.
for v in ELEVENLABS_API_KEY ANTHROPIC_API_KEY R2_BUCKET; do
  [ -z "${!v:-}" ] && echo "⚠  $v is unset — uploads will fail at that step"
done

echo "→ http://localhost:5060   (COOKIE_SECURE=$COOKIE_SECURE)"
exec .venv/bin/uvicorn app.main:app --reload --port 5060
