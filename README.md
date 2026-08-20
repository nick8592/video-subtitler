# Video Subtitler

Batch generate and embed subtitles for `.mp4` videos using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (GPU-accelerated Whisper) and ffmpeg.

Transcribes speech to `.srt`, then muxes subtitles into video as a toggleable soft subtitle track — no re-encode, original quality preserved.

## Requirements

- Python 3.10+
- [ffmpeg](https://ffmpeg.org/) (`apt install ffmpeg`)
- NVIDIA GPU with CUDA (recommended) or CPU fallback
- [faster-whisper](https://pypi.org/project/faster-whisper/)

## Install

```bash
# Create virtual environment (requires uv or python3-venv)
uv venv .venv

# Install dependencies
uv pip install faster-whisper nvidia-cublas-cu12
```

## Usage

```bash
# Activate the venv first
source .venv/bin/activate

# Full pipeline: transcribe + mux soft subtitle into video
python3 add_subtitles.py /path/to/videos

# Generate .srt files only (no mux — e.g. for editing in CapCut)
python3 add_subtitles.py /path/to/videos --srt

# Mux existing .srt files into videos (skip transcription)
python3 add_subtitles.py /path/to/videos --mux

# Use a smaller/faster model (less VRAM, less accurate)
python3 add_subtitles.py /path/to/videos --model medium
```

## What it does

For each `.mp4` in the target directory:

1. **Extract audio** — 16 kHz mono WAV via ffmpeg
2. **Transcribe** — faster-whisper `large-v3` model (GPU, float16), primary language `zh` with automatic English detection
3. **Save `.srt`** — written next to the original video
4. **Mux** — embed `.srt` as a soft subtitle track (`mov_text`) into a new `_subtitled.mp4` (no re-encode)

### Output

| Input | Output |
|---|---|
| `trip.mp4` | `trip.srt` + `trip_subtitled.mp4` |

Idempotent — skips files that already have `.srt` or `_subtitled.mp4`. Delete those files to re-run.

## Configuration

Edit the constants at the top of `add_subtitles.py`:

| Constant | Default | Description |
|---|---|---|
| `MODEL_SIZE` | `large-v3` | Whisper model size (`tiny`, `base`, `small`, `medium`, `large-v3`) |
| `DEVICE` | `cuda` | `cuda` for GPU, `cpu` for CPU |
| `COMPUTE_TYPE` | `float16` | `int8_float16` for less VRAM |
| `LANGUAGE` | `zh` | Primary language (Whisper auto-detects mixed segments) |
| `VAD_FILTER` | `True` | Skip silence during transcription |

## License

MIT
