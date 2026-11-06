#!/usr/bin/env sh
# =====================================================================
# Spid3rWeb — one-click installer
# =====================================================================
# Auto-detects the OS and installs, in order:
#   1. The Spid3r language toolchain (skipped if already on PATH)
#   2. This framework project: .env, database migrations, optional seeding
#
# Supported:
#   - Linux (x86_64 / arm64)      -> official release tarball via install.sh
#   - macOS (Intel / Apple Silicon) -> official release tarball via install.sh
#   - Windows (Git Bash / MSYS2)  -> Spid3r-Setup-<version>.exe from releases
#
# Usage:
#   sh install.sh            # install language (if needed) + set up project
#   sh install.sh --serve    # ...then start the dev server on :8000
#   SPID3R_PORT=3000 sh install.sh --serve
#
# On Windows, run this script from Git Bash (it handles the .exe installer).
# SQLite is the default database — no database server required.
# =====================================================================
set -e

# ---------- pretty output ----------
if [ -t 1 ]; then
  BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"; OFF="\033[0m"
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; CYAN=""; OFF=""
fi
say()  { printf "%b\n" "${GREEN}==>${OFF} ${BOLD}$*${OFF}"; }
warn() { printf "%b\n" "${YELLOW}warning:${OFF} $*"; }
die()  { printf "%b\n" "${RED}error:${OFF} $*" >&2; exit 1; }

# ---------- repo constants ----------
SPID3R_REPO="needyamin/spid3r"
SPID3R_INSTALL_SH="https://raw.githubusercontent.com/$SPID3R_REPO/main/install.sh"
SPID3R_SETUP_FALLBACK="https://github.com/$SPID3R_REPO/releases/download/v1.0.0/Spid3r-Setup-1.0.0.exe"
APP_PORT="${SPID3R_PORT:-8000}"

# ---------- locate the project root (this script's directory) ----------
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
    arm64|aarch64) ARCH="arm64" ;;
    *)             ARCH="x86_64" ;;
  esac
}

# =====================================================================
# Download helpers (curl, wget, or PowerShell fallback on Windows)
# =====================================================================
have_downloader() {
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || [ "$PLATFORM" = "windows" ]
}

fetch() { # fetch <url> <outfile>
  _url="$1"; _out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$_url" -o "$_out"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$_out" "$_url"
  elif [ "$PLATFORM" = "windows" ]; then
    # last resort on a bare Windows box: PowerShell
    _winurl=$(printf '%s' "$_url" | sed 's|/|\\\\|g')
    powershell.exe -NoProfile -Command "\$c=New-Object Net.WebClient; \$c.DownloadFile('$_url', '$_out')"
  else
    return 1
  fi
}

# Auto-install curl via the system package manager when neither
# curl nor wget exists (Linux mainly; macOS/Windows always have one).
ensure_downloader() {
  if have_downloader; then return 0; fi

  say "Neither curl nor wget found — installing curl ..."
  SUDO=""
  if [ "$(id -u 2>/dev/null || echo 1)" != "0" ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  fi
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update -y && $SUDO apt-get install -y curl
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y curl
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y curl
  elif command -v apk >/dev/null 2>&1; then
    $SUDO apk add --no-cache curl
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm curl
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y curl
  elif command -v brew >/dev/null 2>&1; then
    brew install curl
  else
    die "no supported package manager found — install curl or wget manually, then re-run"
  fi
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 \
    || die "downloader still missing after installation"
}

# =====================================================================
# PATH helpers — make `spid3r` visible in THIS shell after install
# =====================================================================
path_has() { case ":$PATH:" in *":$1:"*) return 0 ;; *) return 1 ;; esac; }

add_path_dir() { # add_path_dir <dir> — silently extend session PATH
  [ -d "$1" ] || return 0
  path_has "$1" && return 0
  PATH="$PATH:$1"
  export PATH
}

fix_session_path() {
  # Where installers are known to drop the binary
  add_path_dir "$HOME/.spid3r/bin"                       # Linux/macOS official installer
  add_path_dir "$HOME/.local/bin"                        # cargo / manual installs
  add_path_dir "/usr/local/bin"
  if [ -n "${LOCALAPPDATA:-}" ]; then
    add_path_dir "$LOCALAPPDATA/Programs/Spid3r"         # Windows NSIS installer
  fi
}

path_hint() {
  printf "\n"
  warn "spid3r was installed but is not on this shell's PATH yet."
  warn "Open a NEW terminal, or run one of these now:"
  warn "  export PATH=\"\$PATH:\$HOME/.spid3r/bin\"        # Linux/macOS default"
  if [ -n "${LOCALAPPDATA:-}" ]; then
    warn "  export PATH=\"\$PATH:$LOCALAPPDATA/Programs/Spid3r\"  # Windows"
  fi
}

spid3r_ok() {
  command -v spid3r >/dev/null 2>&1 && spid3r --version >/dev/null 2>&1
}

# =====================================================================
# Step 1 — Spid3r language
# =====================================================================
install_language() {
  fix_session_path
  if spid3r_ok; then
    say "Spid3r is already installed: $(spid3r --version 2>&1 | head -n 1)"
    return 0
  fi

  say "Spid3r language not found — installing for $PLATFORM ($ARCH) ..."
  ensure_downloader

  if [ "$PLATFORM" = "windows" ]; then
    # ------------------------------------------------ Windows ----------
    TMP=$(mktemp -d)
    say "Fetching latest Windows installer from GitHub releases..."
    SETUP_URL=""
    if fetch "https://api.github.com/repos/$SPID3R_REPO/releases/latest" "$TMP/rel.json" 2>/dev/null; then
      SETUP_URL=$(grep -o 'https://[^"]*Spid3r-Setup-[0-9.]*\.exe' "$TMP/rel.json" | head -n 1 || true)
    fi
    [ -z "$SETUP_URL" ] && SETUP_URL="$SPID3R_SETUP_FALLBACK"
    say "Downloading $(basename "$SETUP_URL") ..."
    fetch "$SETUP_URL" "$TMP/spid3r-setup.exe" || die "could not download $SETUP_URL"

    say "Running installer (silent mode) ..."
    # /S = silent install for NSIS installers; if it fails, run interactively
    if ! (cd "$TMP" && ./spid3r-setup.exe /S); then
      warn "silent install failed — launching the graphical installer instead."
      warn "click through the installer window, then re-run this script."
      (cd "$TMP" && ./spid3r-setup.exe) || true
    fi
    rm -rf "$TMP"
  else
    # ---------------------------------------- Linux / macOS / other ----
    say "Running the official Spid3r installer ..."
    if command -v curl >/dev/null 2>&1; then
      sh -c "$(curl -fsSL "$SPID3R_INSTALL_SH")" || die "official installer failed"
    else
      sh -c "$(wget -qO- "$SPID3R_INSTALL_SH")" || die "official installer failed"
    fi
  fi

  # Re-scan PATH and verify
  fix_session_path
  if spid3r_ok; then
    say "Spid3r installed: $(spid3r --version 2>&1 | head -n 1)"
  elif [ -x "$HOME/.spid3r/bin/spid3r" ] || [ -x "$HOME/.spid3r/bin/spid3r.exe" ] \
    || { [ -n "${LOCALAPPDATA:-}" ] && [ -x "$LOCALAPPDATA/Programs/Spid3r/spid3r.exe" ]; }; then
    path_hint
    die "spid3r not reachable in this shell"
  else
    die "spid3r still not found after installation"
  fi
}

# =====================================================================
# Step 2 — Spid3rWeb framework (this project)
# =====================================================================
setup_framework() {
  say "Setting up Spid3rWeb in $SCRIPT_DIR ..."
  cd "$SCRIPT_DIR"

  [ -f "server.matrix" ]       || die "server.matrix not found — run this script from the project root"
  [ -f ".env.example" ]        || die ".env.example not found — run this script from the project root"
  [ -d "database/migrations" ] || die "database/migrations not found — incomplete project?"

  # .env (never overwrite an existing one)
  if [ -f ".env" ]; then
    say ".env already exists — keeping your configuration"
  else
    cp .env.example .env
    say "created .env from .env.example (SQLite, dev mode, demo logins on)"
  fi

  # Database schema
  say "Running database migrations ..."
  spid3r magic migrate

  # Optional seed step (a no-op until you register seed data)
  say "Running seeder (no-op until you add seed data) ..."
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
printf "one-click installer — %s (%s) detected\n\n" "$PLATFORM" "$ARCH"

install_language
setup_framework

printf "\n"
say "Spid3rWeb is ready!"
printf "  Welcome page : %bhttp://127.0.0.1:%s%b  (resources/views/welcome.bd.html)\n" "$BOLD" "$APP_PORT" "$OFF"
printf "  First steps  : edit routes/web.matrix, then spid3r magic make:model / make:controller\n\n"

if [ "${1:-}" = "--serve" ]; then
  say "Starting dev server on http://127.0.0.1:$APP_PORT ..."
  printf "  press Ctrl+C to stop\n\n"
  exec spid3r magic serve --port "$APP_PORT"
fi

printf "Start the app:\n"
printf "  %bspid3r magic serve --port %s%b   then open http://127.0.0.1:%s\n" "$BOLD" "$APP_PORT" "$OFF" "$APP_PORT"
printf "  (or run %bsh install.sh --serve%b to do it automatically)\n" "$BOLD" "$OFF"
