#!/bin/sh
# tools/serve_fast.sh — bytecode fast-path server launcher (LOCAL DEV).
#
# Why: `spid3r run server.matrix` / `spid3r magic serve` recompile the whole
# .matrix import graph on EVERY boot (~21s for this store; measured
# 2026-11-21: run=21.3s, compile=21s, exec of precompiled bytecode=~1s).
# Booting from precompiled bytecode is ~20x faster.
#
# This launcher:
#   1. rebuilds dist/server.matrixc when any .matrix source is newer than it
#      (or it is missing / --rebuild was passed),
#   2. then boots the app via `spid3r exec dist/server.matrixc`.
#
# Template/view edits (.bd.html) do NOT require a rebuild — templates are
# loaded at runtime — but .matrix edits do.
#
# Usage:
#   tools/serve_fast.sh [--port N] [--rebuild]
#
# Notes:
#   - The port travels via the SPID3R_PORT env var (`spid3r exec` cannot pass
#     CLI args through to the program; server.matrix honours SPID3R_PORT).
#   - Production deployments should use `magic build --release` (AOT) or
#     Docker per docs/DEPLOY.md. This helper is a developer convenience.

set -e

PORT="${SPID3R_PORT:-8000}"
REBUILD=0
while [ $# -gt 0 ]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --port=*) PORT="${1#--port=}"; shift ;;
        --rebuild) REBUILD=1; shift ;;
        *) echo "unknown option: $1 (usage: tools/serve_fast.sh [--port N] [--rebuild])" >&2; exit 2 ;;
    esac
done

SPID3R="${SPID3R_BIN:-$LOCALAPPDATA/Programs/Spid3r/spid3r}"
BYTECODE="dist/server.matrixc"

# Newest modification time across all .matrix sources (entry + app +
# framework + config + routes + tools + tests).
newest_src=$(find . -name "*.matrix" -not -path "./.git/*" -newer "$BYTECODE" -print -quit 2>/dev/null || true)

if [ "$REBUILD" = "1" ] || [ ! -f "$BYTECODE" ] || [ -n "$newest_src" ]; then
    if [ -n "$newest_src" ]; then
        echo "[serve_fast] source changed since last build ($newest_src) — recompiling..."
    else
        echo "[serve_fast] no bytecode yet — compiling..."
    fi
    SPID3R_PATH=. "$SPID3R" compile server.matrix -o "$BYTECODE"
else
    echo "[serve_fast] bytecode is up to date — skipping compile"
fi

echo "[serve_fast] booting from bytecode on port $PORT (~1s)..."
# NOTE: do NOT use the shell's `exec` builtin or the `env` program here —
# on Windows/MSYS that combination silently prevents the server from
# binding its port. Plain env-var prefixing works.
SPID3R_PATH=. SPID3R_PORT="$PORT" "$SPID3R" exec "$BYTECODE"
