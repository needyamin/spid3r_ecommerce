#!/bin/sh
# deploy/docker-smoke.sh — Phase 15 deployment verification, one command.
#
# Boots the REAL database engine from deploy/docker-compose.yml, migrates +
# seeds, starts the REAL Spid3r HTTP server on the host, smoke-tests it over
# TCP with curl, and (unless SMOKE_ONLY=1) runs the full test suite against
# the same engine. Every check is against a live server process, not the
# in-process request harness the test suites use.
#
# For the fully containerised app (multi-stage image, migrate-on-boot) see
# deploy/docker-compose.yml + deploy/Dockerfile — the smoke below verifies
# the host-process path that CI and `magic serve` deployments use.
#
# Usage:
#   ./deploy/docker-smoke.sh mysql        # default
#   SMOKE_ONLY=1 ./deploy/docker-smoke.sh mysql   # skip the full suite
#
# Environment:
#   PORT        HTTP port for the verification server (default 8010)
#   SMOKE_ONLY  1 = skip the full test suite (used in CI)

set -eu

ENGINE="${1:-mysql}"
PORT="${PORT:-8010}"
BASE="http://127.0.0.1:$PORT"
COMPOSE="docker compose -f deploy/docker-compose.yml"
failures=0

note() { printf '\n== %s ==\n' "$1"; }
check() {
    # check <description> <command...>
    desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        printf '  [PASS] %s\n' "$desc"
    else
        printf '  [FAIL] %s\n' "$desc"
        failures=$((failures + 1))
    fi
}

cd "$(dirname "$0")/.."

case "$ENGINE" in
    mysql)
        COMPOSE_SVC=mysql
        CONTAINER=spid3rweb-mysql
        export SPID3R_DB_DRIVER=mysql
        export SPID3R_MYSQL_HOST=127.0.0.1
        export SPID3R_MYSQL_PORT=3306
        export SPID3R_MYSQL_USER=spid3r
        export SPID3R_MYSQL_PASSWORD=spid3r
        export SPID3R_MYSQL_DATABASE=spid3r
        ;;
    *)
        printf 'unknown engine: %s (use mysql)\n' "$ENGINE" >&2
        exit 2
        ;;
esac

note "Starting the $ENGINE container"
$COMPOSE up -d "$COMPOSE_SVC"

printf 'Waiting for %s to be healthy' "$CONTAINER"
i=0
status="starting"
while [ $i -lt 60 ]; do
    status="$($COMPOSE exec -T "$COMPOSE_SVC" sh -c 'true' >/dev/null 2>&1 && docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && break
    printf '.'
    i=$((i + 1))
    sleep 2
done
printf '\n'
if [ "$status" != "healthy" ]; then
    printf 'container did not become healthy in time\n' >&2
    $COMPOSE down -v >/dev/null 2>&1 || true
    exit 1
fi

if [ "$ENGINE" = "mysql" ]; then
    # The runtime's MySQL client speaks mysql_native_password only. The
    # compose service already starts MySQL with that plugin; this grant is
    # a safety net for reused volumes.
    $COMPOSE exec -T mysql mysql -uroot -prootpass \
        -e "CREATE USER IF NOT EXISTS 'spid3r'@'%' IDENTIFIED WITH mysql_native_password BY 'spid3r'; GRANT ALL PRIVILEGES ON spid3r.* TO 'spid3r'@'%'; FLUSH PRIVILEGES;" \
        >/dev/null 2>&1 || true
fi

note "Migrate + seed ($ENGINE)"
spid3r magic migrate
spid3r magic db:seed

note "Booting the real server on :$PORT"
spid3r magic serve --port="$PORT" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

i=0
until curl -fsS "$BASE/health" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
        printf 'server did not become ready in time\n' >&2
        kill "$SERVER_PID" 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

note "HTTP smoke checks against the live server"
check "GET /health responds" curl -fsS "$BASE/health"
check "GET / serves the storefront" curl -fsS "$BASE/"
check "GET /catalog lists products" curl -fsS "$BASE/catalog"
check "GET /sitemap.xml is served" curl -fsS "$BASE/sitemap.xml"
check "GET /robots.txt is served" curl -fsS "$BASE/robots.txt"
check "GET /css/store.css is served" curl -fsS "$BASE/css/store.css"
check "GET /no-such-page is a 404" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/no-such-page")" = "404"
check "security headers present" sh -c "curl -fsS -D - -o /dev/null '$BASE/' | grep -qi 'content-security-policy'"
check "HEAD / works" curl -fsSI "$BASE/"
check "unknown API route is JSON 404" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/nope")" = "404"

if [ "${SMOKE_ONLY:-0}" != "1" ]; then
    note "Full test suite against $ENGINE"
    SPID3R_DB_DRIVER="$ENGINE" spid3r magic test
fi

note "Shutting down"
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true
trap - EXIT INT TERM
$COMPOSE down -v >/dev/null 2>&1 || true

if [ "$failures" -gt 0 ]; then
    printf '\nDEPLOYMENT SMOKE FAILED: %d check(s) failed\n' "$failures" >&2
    exit 1
fi
printf '\nDEPLOYMENT SMOKE PASSED — real server verified on %s\n' "$ENGINE"
