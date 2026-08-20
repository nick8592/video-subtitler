#!/usr/bin/env bash
set -euo pipefail

echo "=== Video Subtitler Setup ==="

if ! command -v ffmpeg &>/dev/null; then
  echo "ffmpeg not found. Install it first:"
  echo "  Ubuntu/Debian: sudo apt install ffmpeg"
  echo "  macOS:         brew install ffmpeg"
  exit 1
fi

if ! command -v uv &>/dev/null && ! command -v pip3 &>/dev/null; then
  echo "Neither uv nor pip3 found. Install one:"
  echo "  uv (recommended): curl -LsSf https://astral.sh/uv/install.sh | sh"
  exit 1
fi

if command -v uv &>/dev/null; then
  echo "Creating venv with uv..."
  uv venv .venv
  echo "Installing dependencies..."
  uv pip install -r requirements.txt
else
  echo "Creating venv with python3..."
  python3 -m venv .venv
  echo "Installing dependencies..."
  .venv/bin/pip install -r requirements.txt
fi

echo ""
echo "Done! To use:"
echo "  source .venv/bin/activate"
echo "  python3 add_subtitles.py /path/to/videos --srt"
