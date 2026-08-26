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
if [ -n "${HF_TOKEN:-}" ]; then
  echo "Pre-downloading Whisper models (HF_TOKEN set)..."
else
  echo "Pre-downloading Whisper models..."
  echo "  Tip: set HF_TOKEN env var for faster downloads & higher rate limits."
  echo "  https://huggingface.co/settings/tokens"
fi
HF_HUB_ENABLE_HF_TRANSFER=1 .venv/bin/python3 -c "
import os
os.environ.pop('HF_HUB_ENABLE_HF_TRANSFER', None)  # avoid import issues if hf_transfer not installed
from faster_whisper import WhisperModel
for size in ['tiny', 'base', 'small', 'medium', 'large-v3']:
    print(f'  Downloading {size}...', flush=True)
    WhisperModel(size, device='cpu', compute_type='int8')
    print(f'  ✓ {size}')
print('All models cached.')
"

echo ""
echo "Done! To use:"
echo "  source .venv/bin/activate"
echo "  python3 add_subtitles.py /path/to/videos --srt"
echo "  python3 app.py          # Gradio web UI"
