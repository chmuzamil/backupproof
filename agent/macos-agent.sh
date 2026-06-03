#!/usr/bin/env bash
# Friendly Restore Dashboard - macOS agent stub
set -euo pipefail
FRD_API_URL="${FRD_API_URL:-http://localhost:8787/api}"
FRD_AGENT_TOKEN="${FRD_AGENT_TOKEN:?Set FRD_AGENT_TOKEN}"
FRD_AGENT_NAME="${FRD_AGENT_NAME:-$(scutil --get ComputerName)}"

curl -sf -X POST "$FRD_API_URL/agents/register" \
  -H "content-type: application/json" \
  -d "{\"name\":\"$FRD_AGENT_NAME\",\"hostname\":\"$(hostname)\",\"platform\":\"darwin\",\"token\":\"$FRD_AGENT_TOKEN\"}"

while true; do
  curl -sf -X POST "$FRD_API_URL/agents/heartbeat" \
    -H "content-type: application/json" \
    -d "{\"token\":\"$FRD_AGENT_TOKEN\"}" || true
  sleep 300
done
