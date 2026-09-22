#!/usr/bin/env bash
# Deploy basicall-sync naar VPS Hetzner (85.10.132.126 / user sitejob-tt)
#
# Voorwaarde: ssh-key gekoppeld (bijv. ~/.ssh/tt_vps + Host 85.10.132.126 / alias tt-vps in ~/.ssh/config).
# Sinds 2026-06-01 is /opt/basicall-sync eigendom van sitejob-tt -> rsync/deploy werkt ZONDER sudo.
# Sync draait als sitejob-tt (cron 04:00), logt naar /var/log/basicall.log.
# Bij eerste run op VPS: `cd /opt/basicall-sync && npm install` + `.env` invullen.
#
# Gebruik:
#   ./deploy.sh              # rsync + dry-run-samenvatting
#   ./deploy.sh --apply      # gewijzigde bestanden overzetten; dependencies alleen bij gewijzigde manifesten
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
  --exclude=".env"
  --exclude="node_modules"
  --exclude=".git"
  --exclude="deploy.sh"
  --exclude=".env.example"
)

# Op de VPS staat een package-lock.json die deze checkout niet heeft. Verwijder
# daarom geen serverbestanden. Voorkom ook een onnodige npm install wanneer
# uitsluitend sync.js verandert: zonder lokaal lockbestand kan die versies wijzigen.
MANIFEST_CHANGED=false
if [[ "$MODE" == "--apply" || "$MODE" == "--restart" ]]; then
  if [[ -n "$(rsync -ani --out-format='%n' package.json "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/" | grep -x 'package.json' || true)" ]]; then
    MANIFEST_CHANGED=true
  fi
  if [[ -f package-lock.json ]] && [[ -n "$(rsync -ani --out-format='%n' package-lock.json "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/" | grep -x 'package-lock.json' || true)" ]]; then
    MANIFEST_CHANGED=true
  fi
fi

if [[ "$MODE" != "--apply" && "$MODE" != "--restart" ]]; then
  RSYNC_FLAGS+=(--dry-run)
  echo "[dry-run] geen wijzigingen doorgevoerd. Gebruik './deploy.sh --apply' om echt te deployen."
fi

echo "--> rsync naar ${VPS_USER}@${VPS_HOST}:${VPS_PATH}"
rsync "${RSYNC_FLAGS[@]}" ./ "${VPS_USER}@${VPS_HOST}:${VPS_PATH}/"

if [[ "$MODE" == "--apply" || "$MODE" == "--restart" ]]; then
  if [[ "$MANIFEST_CHANGED" == true ]]; then
    echo "--> package manifest gewijzigd; npm install op VPS"
    ssh "${VPS_USER}@${VPS_HOST}" "cd ${VPS_PATH} && npm install --omit=dev --no-audit --no-fund"
  else
    echo "--> package manifest ongewijzigd; npm install overgeslagen"
  fi
  echo "--> klaar. Volgende cron-run pakt de nieuwe versie op."
fi

if [[ "$MODE" == "--restart" ]]; then
  echo "--> handmatige test-sync starten (log live)"
  ssh -t "${VPS_USER}@${VPS_HOST}" "cd ${VPS_PATH} && node sync.js"
fi
