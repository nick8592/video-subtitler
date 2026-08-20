# Video Subtitler

Batch generate and embed subtitles for `.mp4` videos using [faster-whisper](https://github.com/SYSTRAN/fater-whisper) (GPU-accelerated Whisper) and ffmpeg.

Transcribes speech to `.srt`, then muxes subtitles into video as a toggleable soft subtitle track — no re-encode, original quality preserved.

## Quick Start

```bash
git clone https://github.com/nick8592/video-subtitler.git
cd video-subtitler
./setup.sh
```

That's it. `setup.sh` creates a venv and installs everything. Then:

```bash
source .venv/bin/activate
python3 add_subtitles.py /path/to/videos --srt
```

### Prerequisites

- [ffmpeg](https://ffmpeg.org/) (`apt install ffmpeg` / `brew install ffmpeg`)
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) (recommended) or `python3-venv`
- NVIDIA GPU with CUDA (recommended) — falls back to CPU automatically

## Usage

```bash
# Full pipeline: transcribe + mux soft subtitle into video
python3 add_subtitles.py /path/to/videos

# Generate .srt files only (no mux — e.g. for editing in CapCut)
python3 add_subtitles.py /path/to/videos --srt

# Mux existing .srt files into videos (skip transcription)
python3 add_subtitles.py /path/to/videos --mux

# Use a smaller/faster model (less VRAM, less accurate)
python3 add_subtitles.py /path/to/videos --model medium
```

## Example

A 10-second sample from a 4K travel video (Indonesia, Mount Bromo) is included in `example/`.

### Input

| File | Resolution | Duration | Size | Codec |
|---|---|---|---|---|
| `sample.mp4` | 3840×2880 | 10.0s | 5 MB | HEVC |

### Output

| File | Description |
|---|---|
| `sample.srt` | Transcribed subtitle (Chinese, Whisper large-v3) |
| `sample_subtitled.mp4` | Original video + soft subtitle track (no re-encode) |

### Generated subtitle (`sample.srt`)

```srt
1
00:00:00,000 --> 00:00:05,010
就在那边就开会了

2
00:00:05,010 --> 00:00:07,010
下班下班

3
00:00:07,010 --> 00:00:09,010
他比我来年要务
```

### How it was made

```bash
# Extract 10s clip from full video
ffmpeg -i "bromo perfect timing.mp4" -t 10 -c copy example/sample.mp4

# Generate subtitle
python3 add_subtitles.py example --srt

# Mux subtitle into video
python3 add_subtitles.py example
```

## How it works

For each `.mp4` in the target directory:

1. **Extract audio** — 16 kHz mono WAV via ffmpeg
2. **Transcribe** — faster-whisper `large-v3` model (GPU, float16), primary language `zh` with automatic English detection
3. **Save `.srt`** — written next to the original video
4. **Mux** — embed `.srt` as a soft subtitle track (`mov_text`) into a new `_subtitled.mp4` (no re-encode)

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
