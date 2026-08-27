#!/usr/bin/env bash
# Local dev. Reads .env, starts uvicorn on :5060 to match the Vite proxy.
set -a; [ -f .env ] && . ./.env; set +a
exec .venv/bin/uvicorn app.main:app --reload --port 5060
