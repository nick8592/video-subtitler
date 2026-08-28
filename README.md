<p align="center">
  <img src="docs/signboard_v5.png?v=1" alt="Video Subtitler" width="800">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-red?style=flat-square" alt="License: MIT">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/CUDA-GPU_Accelerated-76B900?style=flat-square&logo=nvidia&logoColor=white" alt="CUDA">
  <img src="https://img.shields.io/badge/faster--whisper-Powered-FF6F00?style=flat-square" alt="faster-whisper">
  <a href="https://nick8592.github.io/video-subtitler/"><img src="https://img.shields.io/badge/project-page-10b981?style=flat-square" alt="Project Page"></a>

</p>

Auto-generate and embed subtitles for `.mp4` videos — 100% local, no uploads, no API keys.

- **Toggleable subtitles** — add as a track viewers can turn on/off, original quality preserved
- **Always-visible subtitles** — burn into video for Instagram, TikTok, GitHub
- **Font customization** — choose font, size, color, outline, shadow, alignment and preview before generating
- **Local web UI** — upload a video, pick your settings, download the result — all from the browser
- **GPU accelerated** — uses NVIDIA GPU if available, falls back to CPU automatically

## Quick Start

### One-Click Launch (recommended)

**Mac / Linux:**
```bash
./start.sh
```

**Windows:**
```
start.bat
```

That's it. The script will:
1. Check for required tools (ffmpeg, Python) and offer to install them if missing
2. Set up the Python environment automatically
3. Download the default AI model (~500 MB)
4. Start the web UI and open it in your browser

### Manual Setup

If you prefer to set things up yourself:

```bash
git clone https://github.com/nick8592/video-subtitler.git
cd video-subtitler
./setup.sh
source .venv/bin/activate
python3 server.py
```

### What You Need

- **ffmpeg** — free video processing tool. Install: `apt install ffmpeg` (Linux) or `brew install ffmpeg` (Mac) or [download for Windows](https://www.gyan.dev/ffmpeg/builds/)
- **Python 3.10+** — [download here](https://www.python.org/downloads/) (Windows: check "Add to PATH")
- **NVIDIA GPU** — optional but makes subtitle generation much faster. Works without one.

### Using the Web UI

1. Open `http://127.0.0.1:7860` (opens automatically with `start.sh`)
2. Upload your video
3. Choose subtitle mode: **Toggleable** (viewers can turn on/off) or **Always visible** (burned into the video)
4. Click **Generate Subtitles**
5. Download the result

> **Tip:** The "Always visible" mode lets you customize fonts, colors, and positioning. Click "Render Frame" to preview how subtitles will look before generating the full video.

### Using the Command Line

For batch processing multiple videos:

```bash
source .venv/bin/activate

# Generate toggleable subtitles for all videos in a folder
python3 add_subtitles.py /path/to/videos

# Burn subtitles into video (always visible, for social media)
python3 add_subtitles.py /path/to/videos --hardcode

# Generate .srt files only (for editing in CapCut, etc.)
python3 add_subtitles.py /path/to/videos --srt

# Process a single .mp4 file
python3 add_subtitles.py /path/to/video.mp4 --file

# Override model and language
python3 add_subtitles.py /path/to/videos --model medium --language en

# Customize font styling (always-visible mode only)
python3 add_subtitles.py /path/to/videos --hardcode --font-name "Arial" --font-size 18 --font-color "#FFFF00" --outline 2
```

> **Note:** The CLI is the only way to process **multiple videos at once**. The web UI handles one video at a time.

## Example

A 10-second sample from a 4K travel video (Indonesia, Mount Bromo — cloud river) is included in `example/`.

### Before — Original

https://github.com/user-attachments/assets/8a65b94b-9e78-46a4-9be5-1746a26359a3

### After — With subtitles

https://github.com/user-attachments/assets/d996cfec-f958-4aba-aea8-9e8952b5877c

> **Note:** GitHub's video player doesn't support soft subtitle tracks. The "After" example above has subtitles burned in for visibility. The actual script outputs toggleable subtitles by default — use `--hardcode` to burn them in instead.

| File | Resolution | Duration | Size | Codec |
|---|---|---|---|---|
| `sample.mp4` | 1920×1440 | 10.0s | 7 MB | H.264 |
| `sample_subtitled.mp4` | 1920×1440 | 10.0s | 7 MB | H.264 (subtitles burned in) |

### Generated subtitle (`sample.srt`)

```srt
1
00:00:01,200 --> 00:00:05,200
yeah the cloud is climbing through the hill
```

## How it works

For each `.mp4` in the target directory:

1. **Extract audio** — 16 kHz mono WAV via ffmpeg
2. **Transcribe** — faster-whisper AI model detects speech and generates timestamps
3. **Save `.srt`** — written next to the original video
4. **Embed** — add subtitles into a new `_subtitled.mp4` (no quality loss for toggleable mode)

Idempotent — skips files that already have `.srt` or `_subtitled.mp4`. Delete those files to re-run.

## Configuration

### Web UI

All settings are configured through the web interface. The app automatically detects whether you have an NVIDIA GPU — if not, it uses CPU mode.

- **Model size** — bigger = more accurate but slower (default: small)
- **Advanced settings** — device (GPU/CPU) and quality level are available under "Advanced Settings"

Font customization controls (font name, size, color, outline, shadow, border style, alignment, vertical margin) are available when **Always visible** mode is selected. A **Render Frame** button shows exactly how subtitles will look before generating the full video.

> **Note:** The web UI processes one video at a time. For batch processing of multiple videos, use the command line.

### Command Line

Set via environment variables or edit the constants at the top of `add_subtitles.py`:

| Setting | Env Variable | Default | Description |
|---|---|---|---|
| Model size | `WHISPER_MODEL` | `large-v3` | `tiny`, `base`, `small`, `medium`, or `large-v3` |
| Device | `WHISPER_DEVICE` | `cuda` | `cuda` for GPU, `cpu` for CPU |
| Quality | `WHISPER_COMPUTE_TYPE` | `float16` | `int8_float16` for less memory, `int8` for CPU |
| Language | — | `auto` | Language code (e.g. `en`, `zh`) or `auto` to detect |
| Skip silence | — | `True` | Ignores silent parts during transcription |

Font styling options (always-visible mode only):

| CLI Flag | Default | Description |
|---|---|---|
| `--font-name` | `Literata` | Font family name |
| `--font-size` | `12` | Font size in points |
| `--font-color` | `#FFFFFF` | Text color (hex) |
| `--outline` | `0` | Outline/border thickness |
| `--shadow` | `0` | Shadow depth in pixels |
| `--border-style` | `1` | `1` = outline + shadow, `3` = opaque box |
| `--alignment` | `2` | Position: 1–3 bottom, 5–7 top, 9–11 mid |
| `--margin-v` | `20` | Vertical margin from edge in pixels |

## Acknowledgments

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — GPU-accelerated Whisper transcription using CTranslate2
- [OpenAI Whisper](https://github.com/openai/whisper) — the original Whisper speech recognition model

## License

MIT
