#!/usr/bin/env python3
"""Gradio web UI for Video Subtitler.

Wraps the CLI functions from add_subtitles.py into a web interface
for deployment on Hugging Face Spaces.
"""

import tempfile
import os
from pathlib import Path

import gradio as gr

from add_subtitles import (
    MODEL_SIZE,
    DEVICE,
    COMPUTE_TYPE,
    extract_audio,
    transcribe_to_srt,
    mux_subtitle,
    hardcode_subtitle,
)

# ── HF Spaces config ──────────────────────────────────────────────────────
# Override model via env vars (set in Dockerfile or HF Spaces settings)
HF_MODEL = os.environ.get("WHISPER_MODEL", MODEL_SIZE)
HF_DEVICE = os.environ.get("WHISPER_DEVICE", DEVICE)
HF_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", COMPUTE_TYPE)

MAX_VIDEO_DURATION_S = int(os.environ.get("MAX_VIDEO_DURATION_S", "300"))  # 5 min default

LANGUAGE_OPTIONS = [
    "auto", "en", "zh", "ja", "ko", "es", "fr", "de", "id",
    "pt", "ru", "it", "nl", "pl", "tr", "vi", "th", "ar", "hi",
]


def _get_video_duration(video_path: Path) -> float:
    """Return video duration in seconds via ffprobe."""
    import subprocess
    import json
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(video_path)],
            capture_output=True, text=True, check=True,
        )
        fmt = json.loads(result.stdout).get("format", {})
        return float(fmt.get("duration", 0))
    except (subprocess.CalledProcessError, json.JSONDecodeError, ValueError):
        return 0.0


def process_video(video_file: str, language: str, mode: str, progress=gr.Progress()):
    """Process an uploaded video and return the subtitled file + SRT content."""
    if video_file is None:
        return None, "Please upload a video file."

    video_path = Path(video_file)

    # ── Duration check ──────────────────────────────────────────────────
    progress(0, desc="Checking video...")
    duration = _get_video_duration(video_path)
    if duration > MAX_VIDEO_DURATION_S:
        return None, f"Video is {duration:.0f}s — max is {MAX_VIDEO_DURATION_S}s. Please upload a shorter clip."

    tmpdir = tempfile.mkdtemp()
    srt_path = Path(tmpdir) / f"{video_path.stem}.srt"
    output_path = Path(tmpdir) / f"{video_path.stem}_subtitled.mp4"
    audio_path = Path(tmpdir) / "audio.wav"

    # ── Extract audio ──────────────────────────────────────────────────
    progress(0.1, desc="Extracting audio...")
    extract_audio(video_path, audio_path)

    # ── Transcribe ─────────────────────────────────────────────────────
    progress(0.2, desc=f"Loading Whisper model ({HF_MODEL})...")
    lang_arg = None if language == "auto" else language
    transcribe_to_srt(audio_path, srt_path, HF_MODEL, lang_arg)

    # ── Mux / Hardcode ─────────────────────────────────────────────────
    if mode == "Hardcode (burned in)":
        progress(0.7, desc="Burning subtitles into video (2-pass encode)...")
        hardcode_subtitle(video_path, srt_path, output_path)
    else:
        progress(0.7, desc="Muxing soft subtitle track...")
        mux_subtitle(video_path, srt_path, output_path)

    progress(1.0, desc="Done!")

    srt_content = srt_path.read_text(encoding="utf-8") if srt_path.exists() else ""

    # Clean up temp audio
    audio_path.unlink(missing_ok=True)

    return str(output_path), srt_content


# ── Gradio Interface ───────────────────────────────────────────────────────

with gr.Blocks(title="Video Subtitler") as demo:
    gr.Markdown("""
    # 🎬 Video Subtitler
    Auto-generate subtitles for MP4 videos using **faster-whisper** + FFmpeg.

    Upload a video → get back a subtitled version + SRT file.

    > ⚡ Running on CPU — use short clips (< 2 min) for best results.
    """)

    with gr.Row():
        with gr.Column():
            video_input = gr.Video(label="Upload Video (.mp4)")
            with gr.Row():
                language_input = gr.Dropdown(
                    choices=LANGUAGE_OPTIONS,
                    value="auto",
                    label="Language",
                    info="Select 'auto' to detect language automatically",
                )
                mode_input = gr.Radio(
                    choices=["Soft subtitle (toggleable)", "Hardcode (burned in)"],
                    value="Soft subtitle (toggleable)",
                    label="Subtitle Mode",
                    info="Soft = can toggle on/off; Hardcode = always visible",
                )
            submit_btn = gr.Button("Generate Subtitles", variant="primary", size="lg")

        with gr.Column():
            video_output = gr.Video(label="Subtitled Video")
            srt_output = gr.Textbox(
                label="SRT Content",
                lines=12,
                max_lines=30,
                show_copy_button=True,
            )

    gr.Markdown(f"""
    ---
    **Config:** Model=`{HF_MODEL}` | Device=`{HF_DEVICE}` | Compute=`{HF_COMPUTE_TYPE}` | Max duration={MAX_VIDEO_DURATION_S}s
    """)

    submit_btn.click(
        fn=process_video,
        inputs=[video_input, language_input, mode_input],
        outputs=[video_output, srt_output],
    )


if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860)
