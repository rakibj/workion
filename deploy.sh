#!/usr/bin/env bash
set -euo pipefail

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
die()   { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ── flags ─────────────────────────────────────────────────────────────────────
NO_CACHE=false
SKIP_MIGRATE=false

for arg in "$@"; do
  case $arg in
    --no-cache)     NO_CACHE=true ;;
    --skip-migrate) SKIP_MIGRATE=true ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--no-cache] [--skip-migrate]"
      echo "  --no-cache      Pass --no-cache to docker build (slower, use after dep changes)"
      echo "  --skip-migrate  Skip running migrations"
      exit 0 ;;
    *) die "Unknown flag: $arg" ;;
  esac
done

# ── main ──────────────────────────────────────────────────────────────────────
COMPOSE="docker compose -f docker-compose.prod.yml"

step "Pulling latest code"
git pull origin main
ok "Code up to date"

step "Building Docker image"
BUILD_ARGS=""
$NO_CACHE && BUILD_ARGS="--no-cache" && warn "Building without cache (this will take longer)"
$COMPOSE build $BUILD_ARGS app
ok "Build complete"

step "Restarting containers"
$COMPOSE up -d
ok "Containers running"

if $SKIP_MIGRATE; then
  warn "Skipping migrations (--skip-migrate)"
else
  step "Running migrations"
  $COMPOSE exec app pnpm --filter server migration:latest
  ok "Migrations applied"
fi

echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deploy complete → projects.gameloops.io${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
