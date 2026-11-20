#!/usr/bin/env sh
# =====================================================================
# Spid3rWeb — installer & project bootstrap
# =====================================================================
# Auto-detects the OS and installs, in order:
#   1. The pinned Spid3r language toolchain (verified with SHA-256)
#   2. This framework project: .env (0600), APP_KEY, storage/ perms, migrations
#
# Never invokes sudo or system package managers automatically — if a
# prerequisite downloader is missing, exact manual commands are printed.
#
# Usage:
#   sh install.sh            # install language (if needed) + set up project
#   sh install.sh --serve    # ...then start the dev server on :8000
#   SPID3R_PORT=3000 sh install.sh --serve
# =====================================================================
set -eu

# ---------- pretty output ----------
if [ -t 1 ]; then
  BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"; OFF="\033[0m"
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; OFF=""
fi
say()  { printf "%b\n" "${GREEN}==>${OFF} ${BOLD}$*${OFF}"; }
warn() { printf "%b\n" "${YELLOW}warning:${OFF} $*"; }
die()  { printf "%b\n" "${RED}error:${OFF} $*" >&2; exit 1; }

# ---------- pinned release constants ----------
SPID3R_REPO="needyamin/spid3r"
SPID3R_VERSION="${SPID3R_VERSION:-1.1.1}"
SPID3R_SHA256="${SPID3R_SHA256:-}"
RELEASE_BASE="https://github.com/$SPID3R_REPO/releases/download/v${SPID3R_VERSION}"
APP_PORT="${SPID3R_PORT:-8000}"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

# =====================================================================
# Platform detection
# =====================================================================
detect_os() {
  UNAME_S=$(uname -s)
  case "$UNAME_S" in
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    Darwin)               PLATFORM="macos" ;;
    Linux)                PLATFORM="linux" ;;
    *)                    PLATFORM="unix" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH="aarch64" ;;
    *)             ARCH="x86_64" ;;
  esac
}

release_target() {
  case "${PLATFORM}:${ARCH}" in
    linux:x86_64)   printf '%s' "x86_64-unknown-linux-gnu" ;;
    linux:aarch64)  printf '%s' "aarch64-unknown-linux-gnu" ;;
    macos:x86_64)   printf '%s' "x86_64-apple-darwin" ;;
    macos:aarch64)  printf '%s' "aarch64-apple-darwin" ;;
    *)              return 1 ;;
  esac
}

# =====================================================================
# Download & checksum helpers (never auto-sudo)
# =====================================================================
have_downloader() {
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || [ "$PLATFORM" = "windows" ]
}

fetch() {
  _url="$1"
  _out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$_url" -o "$_out"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$_out" "$_url"
  elif [ "$PLATFORM" = "windows" ]; then
    powershell.exe -NoProfile -Command "Invoke-WebRequest -UseBasicParsing -Uri '$_url' -OutFile '$_out'"
  else
    return 1
  fi
}

verify_sha256() {
  _file="$1"
  _expected="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s  %s\n' "$_expected" "$_file" | sha256sum -c - >/dev/null
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s  %s\n' "$_expected" "$_file" | shasum -a 256 -c - >/dev/null
  else
    die "neither sha256sum nor shasum found — cannot verify release integrity"
  fi
}

ensure_downloader() {
  if have_downloader; then
    return 0
  fi
  warn "Neither 'curl' nor 'wget' was found."
  printf "Install one manually, then re-run this script:\n"
  printf "  Debian/Ubuntu : sudo apt-get update && sudo apt-get install -y curl ca-certificates\n"
  printf "  Fedora/RHEL   : sudo dnf install -y curl\n"
  printf "  Alpine        : sudo apk add curl\n"
  printf "  Arch          : sudo pacman -S curl\n"
  printf "  macOS         : brew install curl\n"
  die "missing required downloader (curl or wget)"
}

# =====================================================================
# PATH helpers
# =====================================================================
path_has() { case ":$PATH:" in *":$1:"*) return 0 ;; *) return 1 ;; esac; }

add_path_dir() {
  [ -d "$1" ] || return 0
  path_has "$1" && return 0
  PATH="$PATH:$1"
  export PATH
}

fix_session_path() {
  add_path_dir "$HOME/.spid3r/bin"
  add_path_dir "$HOME/.local/bin"
  add_path_dir "/usr/local/bin"
  if [ -n "${LOCALAPPDATA:-}" ]; then
    add_path_dir "$LOCALAPPDATA/Programs/Spid3r"
  fi
}

path_hint() {
  printf "\n"
  warn "spid3r was installed into $HOME/.spid3r/bin, which is not on PATH yet."
  warn "Open a new terminal or run:"
  warn "  export PATH=\"\$PATH:\$HOME/.spid3r/bin\""
}

spid3r_ok() {
  command -v spid3r >/dev/null 2>&1 && spid3r --version >/dev/null 2>&1
}

# =====================================================================
# Step 1 — Pinned Spid3r language runtime (SHA-256 verified)
# =====================================================================
install_language() {
  fix_session_path
  if spid3r_ok; then
    say "Spid3r is already installed: $(spid3r --version 2>&1 | grep -i Version | head -n 1 || echo ok)"
    return 0
  fi

  say "Spid3r runtime not found — installing pinned v${SPID3R_VERSION} for ${PLATFORM} (${ARCH})..."
  ensure_downloader

  TMP=$(mktemp -d)
  if [ "$PLATFORM" = "windows" ]; then
    ASSET="Spid3r-Setup-${SPID3R_VERSION}.exe"
    say "Downloading ${ASSET} ..."
    fetch "${RELEASE_BASE}/${ASSET}" "${TMP}/${ASSET}" || die "could not download ${RELEASE_BASE}/${ASSET}"
    if [ -n "$SPID3R_SHA256" ]; then
      verify_sha256 "${TMP}/${ASSET}" "$SPID3R_SHA256"
    elif fetch "${RELEASE_BASE}/sha256sums.txt" "${TMP}/sha256sums.txt" 2>/dev/null; then
      EXPECTED=$(awk -v a="${ASSET}" '$2 == a || $2 == "*" a {print $1; exit}' "${TMP}/sha256sums.txt")
      [ -n "$EXPECTED" ] && verify_sha256 "${TMP}/${ASSET}" "$EXPECTED"
    fi
    say "Running installer (silent mode)..."
    if ! (cd "$TMP" && "./${ASSET}" /S); then
      warn "silent install failed — launching interactive installer."
      (cd "$TMP" && "./${ASSET}") || true
    fi
  else
    TARGET=$(release_target) || die "unsupported platform ${PLATFORM}/${ARCH} for prebuilt tarball"
    ASSET="spid3r-${TARGET}.tar.gz"
    say "Downloading ${ASSET} ..."
    fetch "${RELEASE_BASE}/${ASSET}" "${TMP}/${ASSET}" || die "could not download ${RELEASE_BASE}/${ASSET}"
    if [ -n "$SPID3R_SHA256" ]; then
      EXPECTED="$SPID3R_SHA256"
    else
      fetch "${RELEASE_BASE}/sha256sums.txt" "${TMP}/sha256sums.txt" || die "could not download ${RELEASE_BASE}/sha256sums.txt"
      EXPECTED=$(awk -v a="${ASSET}" '$2 == a || $2 == "*" a {print $1; exit}' "${TMP}/sha256sums.txt")
    fi
    [ -n "$EXPECTED" ] || die "empty SHA-256 checksum for ${ASSET}"
    say "Verifying SHA-256 checksum..."
    verify_sha256 "${TMP}/${ASSET}" "$EXPECTED"

    tar -xzf "${TMP}/${ASSET}" -C "$TMP"
    mkdir -p "$HOME/.spid3r/bin"
    BIN_SRC=$(find "$TMP" -type f -name spid3r | head -n 1 || true)
    [ -n "$BIN_SRC" ] || die "archive did not contain a 'spid3r' binary"
    cp "$BIN_SRC" "$HOME/.spid3r/bin/spid3r"
    chmod 0755 "$HOME/.spid3r/bin/spid3r"
    SELF_SRC=$(find "$TMP" -type f -name spid3r-self | head -n 1 || true)
    if [ -n "$SELF_SRC" ] && [ -f "$SELF_SRC" ]; then
      cp "$SELF_SRC" "$HOME/.spid3r/bin/spid3r-self"
      chmod 0755 "$HOME/.spid3r/bin/spid3r-self"
    fi
  fi
  rm -rf "$TMP"

  fix_session_path
  if spid3r_ok; then
    say "Spid3r installed cleanly."
  elif [ -x "$HOME/.spid3r/bin/spid3r" ]; then
    path_hint
    die "spid3r not reachable in this shell"
  else
    die "spid3r still not found after installation"
  fi
}

# =====================================================================
# Step 2 — Spid3rWeb project setup (.env 0600, APP_KEY, dirs, migrate)
# =====================================================================
setup_framework() {
  say "Setting up Spid3rWeb in $SCRIPT_DIR ..."
  cd "$SCRIPT_DIR"

  [ -f "server.matrix" ]       || die "server.matrix not found — run this script from the project root"
  [ -f ".env.example" ]        || die ".env.example not found — run this script from the project root"
  [ -d "database/migrations" ] || die "database/migrations not found — incomplete project?"

  if [ -f ".env" ]; then
    say ".env already exists — keeping existing configuration"
  else
    cp .env.example .env
    chmod 0600 .env
    say "Created .env (mode 0600) from .env.example"
  fi

  if [ -f ".env" ]; then
    chmod 0600 .env
    if ! grep -qE '^APP_KEY=.{16,}' .env; then
      say "Generating 256-bit APP_KEY..."
      spid3r magic key:generate
      chmod 0600 .env
    fi
  fi

  mkdir -p storage/logs storage/framework/cache storage/app storage/backups storage/database database
  chmod 0700 storage storage/logs storage/framework storage/framework/cache storage/app storage/backups storage/database database

  say "Running database migrations ..."
  spid3r magic migrate

  say "Running seeder ..."
  spid3r magic db:seed
}

# =====================================================================
# Main
# =====================================================================
detect_os
printf "%b\n" "${CYAN}${BOLD}"
printf "  ____  _     _              \n"
printf " / ___|(_) __| | ___ _ __    \n"
printf " \\___ \\| |/ _\` |/ _ \\ '__|  \n"
printf "  ___) | | (_| |  __/ |      \n"
printf " |____/|_|\\__,_|\\___|_|  web\n"
printf '%b' "$OFF"
printf "installer — %s (%s) detected\n\n" "$PLATFORM" "$ARCH"

install_language
setup_framework

printf "\n"
say "Spid3rWeb is ready!"
printf "  Health check : %bhttp://127.0.0.1:%s/health%b\n" "$BOLD" "$APP_PORT" "$OFF"
printf "  Diagnostics  : %bspid3r magic doctor%b\n\n" "$BOLD" "$OFF"

if [ "${1:-}" = "--serve" ]; then
  say "Starting dev server on http://127.0.0.1:$APP_PORT ..."
  exec spid3r magic serve --port "$APP_PORT"
fi

printf "Start the app:\n"
printf "  %bspid3r magic serve --port %s%b   then open http://127.0.0.1:%s\n" "$BOLD" "$APP_PORT" "$OFF" "$APP_PORT"
printf "  (or run %bsh install.sh --serve%b to start it automatically)\n" "$BOLD" "$OFF"
