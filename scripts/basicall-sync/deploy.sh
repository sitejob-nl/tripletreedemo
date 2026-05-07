#!/usr/bin/env bash
# Deploy basicall-sync naar VPS Hetzner (85.10.132.126 / user sitejob-tt)
#
# Voorwaarde: ssh-key gekoppeld, alias "sitejob-tt" in ~/.ssh/config OF directe user@host.
# Bij eerste run op VPS: `cd /opt/basicall-sync && npm install` + `.env` invullen.
#
# Gebruik:
#   ./deploy.sh              # rsync + dry-run-samenvatting
#   ./deploy.sh --apply      # daadwerkelijk overzetten
#   ./deploy.sh --restart    # na apply: cron pakt het vanzelf op; dit is alleen voor handmatige sync-test
#
# Bestanden die over gaan: sync.js, package.json, package-lock.json (niet .env, niet node_modules).

set -euo pipefail

VPS_USER="${VPS_USER:-sitejob-tt}"
VPS_HOST="${VPS_HOST:-85.10.132.126}"
VPS_PATH="${VPS_PATH:-/opt/basicall-sync}"
MODE="${1:-dry-run}"

RSYNC_FLAGS=(
  -av
  --delete
  --exclude=".env"
  --exclude="node_modules"
  --exclude=".git"
  --exclude="deploy.sh"
  --exclude=".env.example"
)

if [[ "$MODE" != "--apply" && "$MODE" != "--restart" ]]; then
  RSYNC_FLAGS+=(--dry-run)
  echo "[dry-run] geen wijzigingen doorgevoerd. Gebruik './deploy.sh --apply' om echt te deployen."
fi

echo "--> rsync naar ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
rsync "${RSYNC_FLAGS[@]}" ./ "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

if [[ "$MODE" == "--apply" || "$MODE" == "--restart" ]]; then
  echo "--> npm install op VPS"
  ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_PATH} && npm install --omit=dev --no-audit --no-fund"
  echo "--> klaar. Volgende cron-run pakt de nieuwe versie op."
fi

if [[ "$MODE" == "--restart" ]]; then
  echo "--> handmatige test-sync starten (log live)"
  ssh -t "${VPS_USER}@${VPS_HOST}" "cd ${VPS_PATH} && node sync.js"
fi
