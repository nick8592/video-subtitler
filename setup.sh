#!/usr/bin/env bash
set -euo pipefail

# ── Parse flags ──────────────────────────────────────────────────────────────
AUTO_YES=false
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=true ;;
    --help|-h)
      echo "Usage: ./setup.sh [--yes|-y]"
      echo ""
      echo "  --yes, -y   Auto-accept all prompts (fully non-interactive)"
      echo "  --help, -h  Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Usage: ./setup.sh [--yes|-y]" >&2
      exit 1
      ;;
  esac
done

ask_yes() {
  if [ "$AUTO_YES" = true ]; then
    echo "$1 [Y/n] Y (auto)"
    return 0
  fi
  read -rp "$1 [Y/n] " answer
  answer="${answer:-Y}"
  [ "$answer" = "Y" ] || [ "$answer" = "y" ]
}

echo "=== Video Subtitler Setup ==="
echo ""

# ── 1. ffmpeg ─────────────────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
    echo "ffmpeg not found."
    OS="$(uname -s)"
    if [ "$OS" = "Linux" ]; then
        if command -v apt-get &>/dev/null; then
            if ask_yes "Install ffmpeg via apt?"; then
                sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
            else
                echo "Install it manually: sudo apt install ffmpeg"
                exit 1
            fi
        elif command -v dnf &>/dev/null; then
            if ask_yes "Install ffmpeg via dnf?"; then
                sudo dnf install -y ffmpeg
            else
                echo "Install it manually: sudo dnf install ffmpeg"
                exit 1
            fi
        else
            echo "Install it manually and re-run this script."
            exit 1
        fi
    elif [ "$OS" = "Darwin" ]; then
        if command -v brew &>/dev/null; then
            if ask_yes "Install ffmpeg via Homebrew?"; then
                brew install ffmpeg
            else
                echo "Install it manually: brew install ffmpeg"
                exit 1
            fi
        else
            echo "Install Homebrew first, then: brew install ffmpeg"
            exit 1
        fi
    else
        echo "Install ffmpeg manually and re-run this script."
        exit 1
    fi
    echo ""
fi

# ── 2. uv (recommended) or pip ───────────────────────────────────────────────
if ! command -v uv &>/dev/null && ! command -v pip3 &>/dev/null; then
    echo "Neither uv nor pip3 found."
    if ask_yes "Install uv (recommended package manager)?"; then
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
        if ! command -v uv &>/dev/null; then
            echo "uv installed but not on PATH. Please restart your terminal and re-run."
            exit 1
        fi
    else
        echo "Install uv:  curl -LsSf https://astral.sh/uv/install.sh | sh"
        echo "Or install pip3 for your system."
        exit 1
    fi
    echo ""
fi

# ── 3. Create virtual environment & install deps ──────────────────────────────
if command -v uv &>/dev/null; then
    if [ ! -d ".venv" ]; then
        echo "Creating venv with uv..."
        uv venv .venv
    fi
    echo "Installing dependencies..."
    uv pip install -r requirements.txt
else
    if [ ! -d ".venv" ]; then
        echo "Creating venv with python3..."
        python3 -m venv .venv
    fi
    echo "Installing dependencies..."
    .venv/bin/pip install -r requirements.txt
fi

echo ""

# ── 4. Pre-download default Whisper model ──────────────────────────────────────
# Download the 'large-v3' model — the default for both CLI and web UI.
DEFAULT_MODEL="large-v3"

if [ -n "${HF_TOKEN:-}" ]; then
    echo "Pre-downloading Whisper model '${DEFAULT_MODEL}' (HF_TOKEN set for faster download)..."
else
    echo "Pre-downloading Whisper model '${DEFAULT_MODEL}' (~3 GB)..."
    echo "  Tip: set HF_TOKEN env var for faster downloads & higher rate limits."
    echo "  https://huggingface.co/settings/tokens"
fi

HF_HUB_ENABLE_HF_TRANSFER=1 .venv/bin/python3 -c "
import os
os.environ.pop('HF_HUB_ENABLE_HF_TRANSFER', None)  # avoid import issues if hf_transfer not installed
from faster_whisper import WhisperModel
print(f'  Downloading ${DEFAULT_MODEL} model...', flush=True)
WhisperModel('${DEFAULT_MODEL}', device='cpu', compute_type='int8')
print(f'  ✓ ${DEFAULT_MODEL} model cached')
"

echo ""
echo "Done! To use:"
echo "  ./start.sh                    # Web UI (recommended) — browser opens automatically"
echo "  source .venv/bin/activate"
echo "  python3 add_subtitles.py /path/to/videos --srt    # CLI batch mode"
