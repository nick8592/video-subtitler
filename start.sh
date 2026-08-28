#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Video Subtitler — One-Click Launcher (Linux / macOS)
#
# This script does everything: installs prerequisites if missing, sets up the
# Python environment, and starts the web UI.  Just double-click or run:
#
#   ./start.sh          # interactive (prompts before installing)
#   ./start.sh --yes    # fully automatic (no prompts)
#
# The browser opens automatically.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse flags ──────────────────────────────────────────────────────────────
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --help|-h)
      echo "Usage: ./start.sh [--yes|-y]"
      echo ""
      echo "  --yes, -y   Auto-accept all prompts (fully non-interactive)"
      echo "  --help, -h  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Usage: ./start.sh [--yes|-y]" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${GREEN}✔${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$*"; }
error() { printf "${RED}✖${RESET} %s\n" "$*" >&2; }

ask_yes() {
  if [ "$AUTO_YES" = true ]; then
    echo "$1 [Y/n] Y (auto)"
    return 0
  fi
  read -rp "$1 [Y/n] " answer
  answer="${answer:-Y}"
  [ "$answer" = "Y" ] || [ "$answer" = "y" ]
}

# ── 1. ffmpeg ─────────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
    echo ""
    warn "ffmpeg is not installed — Video Subtitler needs it to process videos."
    echo ""

    OS="$(uname -s)"
    if [ "$OS" = "Linux" ]; then
        if command -v apt-get &>/dev/null; then
            echo "  Install with:  sudo apt install ffmpeg"
            if ask_yes "  Install now?"; then
                sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
                info "ffmpeg installed."
            else
                error "Cannot continue without ffmpeg. Exiting."
                exit 1
            fi
        elif command -v dnf &>/dev/null; then
            echo "  Install with:  sudo dnf install ffmpeg"
            if ask_yes "  Install now?"; then
                sudo dnf install -y ffmpeg
                info "ffmpeg installed."
            else
                error "Cannot continue without ffmpeg. Exiting."
                exit 1
            fi
        else
            error "Please install ffmpeg manually and re-run this script."
            exit 1
        fi
    elif [ "$OS" = "Darwin" ]; then
        if command -v brew &>/dev/null; then
            if ask_yes "  Install ffmpeg via Homebrew?"; then
                brew install ffmpeg
                info "ffmpeg installed."
            else
                error "Cannot continue without ffmpeg. Exiting."
                exit 1
            fi
        else
            echo "  Install Homebrew first:  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            echo "  Then:  brew install ffmpeg"
            error "Cannot continue without ffmpeg. Exiting."
            exit 1
        fi
    else
        error "Unsupported OS. Please install ffmpeg manually."
        exit 1
    fi
    echo ""
fi

# ── 2. Python ─────────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    error "Python 3 is not installed."
    echo ""
    echo "  Please install Python 3.10 or newer:"
    echo "    Linux:  sudo apt install python3 python3-venv"
    echo "    macOS:  brew install python3"
    echo ""
    echo "  Download from: https://www.python.org/downloads/"
    exit 1
fi

PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info[0])')"
PY_MINOR="$(python3 -c 'import sys; print(sys.version_info[1])')"
if [ "$PY_MAJOR" -lt 3 ] || [ "$PY_MINOR" -lt 10 ]; then
    error "Python 3.10+ required (found 3.${PY_MINOR}). Please upgrade."
    exit 1
fi

# ── 3. uv (optional, preferred) ───────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
    echo ""
    echo "${BOLD}uv${RESET} is a fast Python package manager that makes installation quicker."
    if ask_yes "Install uv now?"; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
        if command -v uv &>/dev/null; then
            info "uv installed."
        else
            warn "uv installed but not on PATH. Falling back to pip."
        fi
    else
        warn "Continuing without uv (will use pip instead — slower but works)."
    fi
    echo ""
fi

# ── 4. Create / update virtual environment ────────────────────────────────────
NEEDS_INSTALL=false
if [ ! -d ".venv" ]; then
    NEEDS_INSTALL=true
elif [ ! -f ".venv/bin/python3" ]; then
    NEEDS_INSTALL=true
fi

# If venv exists but packages might be outdated, just reinstall deps (no venv recreation).
if [ "$NEEDS_INSTALL" = false ] && [ -f "requirements.txt" ]; then
    VENV_MODIFIED="$(stat -c %Y .venv/bin/python3 2>/dev/null || stat -f %m .venv/bin/python3 2>/dev/null || echo 0)"
    REQ_MODIFIED="$(stat -c %Y requirements.txt 2>/dev/null || stat -f %m requirements.txt 2>/dev/null || echo 0)"
    if [ "$REQ_MODIFIED" -gt "$VENV_MODIFIED" ] 2>/dev/null; then
        NEEDS_INSTALL=true
    fi
fi

if [ "$NEEDS_INSTALL" = true ]; then
    echo ""
    echo "${BOLD}Setting up Video Subtitler…${RESET}"
    echo ""

    if command -v uv &>/dev/null; then
        if [ ! -d ".venv" ]; then
            info "Creating virtual environment with uv…"
            uv venv .venv
        fi
        info "Installing Python packages…"
        uv pip install -r requirements.txt
    else
        if [ ! -d ".venv" ]; then
            info "Creating virtual environment with python3…"
            python3 -m venv .venv
        fi
        info "Installing Python packages…"
        .venv/bin/pip install --upgrade pip -q
        .venv/bin/pip install -r requirements.txt
    fi

    echo ""
    info "Setup complete!"
    echo ""
fi

# ── 5. Pre-download default Whisper model (if not cached) ─────────────────────
# Download large-v3 — the default model for both CLI and web UI.
MODEL_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/huggingface/hub"
if [ ! -d "$MODEL_CACHE_DIR" ] || ! find "$MODEL_CACHE_DIR" -path "*/models--Systran--faster-whisper-large-v3" -maxdepth 2 -print -quit 2>/dev/null | grep -q .; then
    echo ""
    echo "${BOLD}Downloading Whisper model (large-v3, ~3 GB)…${RESET}"
    echo ""
    if [ -n "${HF_TOKEN:-}" ]; then
        info "Using HF_TOKEN for faster download."
    fi
    HF_HUB_ENABLE_HF_TRANSFER=1 .venv/bin/python3 -c "
import os
os.environ.pop('HF_HUB_ENABLE_HF_TRANSFER', None)
from faster_whisper import WhisperModel
print('  Downloading large-v3 model…', flush=True)
WhisperModel('large-v3', device='cpu', compute_type='int8')
print('  ✓ large-v3 model cached')
"
    echo ""
fi

# ── 6. Start the web UI ──────────────────────────────────────────────────────
echo ""
echo "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo "${BOLD}║        Video Subtitler — Starting…              ║${RESET}"
echo "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""
info "Opening web UI in your browser…"
echo "  If the browser doesn't open, go to: ${BOLD}http://127.0.0.1:7860${RESET}"
echo ""
info "Press Ctrl+C to stop the server."
echo ""

.venv/bin/python3 server.py
