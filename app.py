#!/usr/bin/env python3
"""Gradio web UI for Video Subtitler.

Wraps the CLI functions from add_subtitles.py into a web interface.
Works locally (GPU) or on Hugging Face Spaces (CPU).
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
    build_force_style,
    hex_to_ass_color,
    generate_preview_frame,
)

# ── Config (override via env vars) ────────────────────────────────────────
APP_MODEL = os.environ.get("WHISPER_MODEL", MODEL_SIZE)
APP_DEVICE = os.environ.get("WHISPER_DEVICE", DEVICE)
APP_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", COMPUTE_TYPE)

MAX_VIDEO_DURATION_S = int(os.environ.get("MAX_VIDEO_DURATION_S", "0"))  # 0 = no limit

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


def get_system_fonts() -> list[str]:
    """Return sorted list of system font family names via fc-list."""
    import subprocess
    try:
        result = subprocess.run(
            ["fc-list", "--format=%{family}\n"],
            capture_output=True, text=True, check=True,
        )
        # fc-list may return comma-separated families; flatten and deduplicate
        families = set()
        for line in result.stdout.strip().splitlines():
            for name in line.split(","):
                name = name.strip()
                if name:
                    families.add(name)
        return sorted(families)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Fallback if fc-list is not available
        return ["Arial", "DejaVu Sans", "Liberation Sans", "Noto Sans", "Literata"]


def process_video(
    video_file,
    language: str,
    mode: str,
    model_size: str,
    device: str,
    compute_type: str,
    font_name: str,
    font_size: int,
    font_color: str,
    outline: int,
    shadow: int,
    border_style: int,
    alignment: int,
    margin_v: int,
    progress=gr.Progress(),
):
    """Process an uploaded video and return the subtitled file + SRT content + state."""
    if video_file is None:
        return None, "", None, None, "Please upload a video file."

    video_path = Path(video_file)

    # ── Duration check ──────────────────────────────────────────────────
    progress(0, desc="Checking video...")
    if MAX_VIDEO_DURATION_S > 0:
        duration = _get_video_duration(video_path)
        if duration > MAX_VIDEO_DURATION_S:
            return None, "", None, None, f"Video is {duration:.0f}s — max is {MAX_VIDEO_DURATION_S}s. Please upload a shorter clip."

    tmpdir = tempfile.mkdtemp()
    srt_path = Path(tmpdir) / f"{video_path.stem}.srt"
    output_path = Path(tmpdir) / f"{video_path.stem}_subtitled.mp4"
    audio_path = Path(tmpdir) / "audio.wav"

    # ── Extract audio ──────────────────────────────────────────────────
    progress(0.1, desc="Extracting audio...")
    extract_audio(video_path, audio_path)

    # ── Transcribe ─────────────────────────────────────────────────────
    progress(0.2, desc=f"Loading Whisper model ({model_size})...")
    lang_arg = None if language == "auto" else language
    transcribe_to_srt(
        audio_path, srt_path, model_size, lang_arg,
        device=device, compute_type=compute_type,
    )

    # ── Mux / Hardcode ─────────────────────────────────────────────────
    if mode == "Hardcode (burned in)":
        progress(0.7, desc="Burning subtitles into video (2-pass encode)...")
        style = build_force_style(
            font_name=font_name,
            font_size=font_size,
            primary_colour=hex_to_ass_color(font_color),
            outline=outline,
            shadow=shadow,
            border_style=border_style,
            alignment=alignment,
            margin_v=margin_v,
        )
        hardcode_subtitle(video_path, srt_path, output_path, force_style=style)
    else:
        progress(0.7, desc="Muxing soft subtitle track...")
        mux_subtitle(video_path, srt_path, output_path)

    progress(1.0, desc="Done!")

    srt_content = srt_path.read_text(encoding="utf-8") if srt_path.exists() else ""

    # Clean up temp audio (keep tmpdir for regeneration)
    audio_path.unlink(missing_ok=True)

    pipeline_state = {"video_path": str(video_path), "tmpdir": tmpdir}

    return str(output_path), srt_content, str(srt_path), pipeline_state, ""


def regenerate_video(
    srt_text: str,
    mode: str,
    pipeline_state: dict | None,
    font_name: str,
    font_size: int,
    font_color: str,
    outline: int,
    shadow: int,
    border_style: int,
    alignment: int,
    margin_v: int,
    progress=gr.Progress(),
):
    """Regenerate video from edited SRT content."""
    if pipeline_state is None or "video_path" not in pipeline_state or "tmpdir" not in pipeline_state:
        return None, "", None, pipeline_state, "Generate subtitles first before regenerating."

    video_path = Path(pipeline_state["video_path"])
    tmpdir = pipeline_state["tmpdir"]
    edited_srt_path = Path(tmpdir) / f"{video_path.stem}_edited.srt"

    # Write edited SRT content to file
    edited_srt_path.write_text(srt_text, encoding="utf-8")

    output_path = Path(tmpdir) / f"{video_path.stem}_subtitled.mp4"

    # Mux or hardcode using the edited SRT
    if mode == "Hardcode (burned in)":
        progress(0.1, desc="Burning edited subtitles into video (2-pass encode)...")
        style = build_force_style(
            font_name=font_name,
            font_size=font_size,
            primary_colour=hex_to_ass_color(font_color),
            outline=outline,
            shadow=shadow,
            border_style=border_style,
            alignment=alignment,
            margin_v=margin_v,
        )
        hardcode_subtitle(video_path, edited_srt_path, output_path, force_style=style)
    else:
        progress(0.1, desc="Muxing edited soft subtitle track...")
        mux_subtitle(video_path, edited_srt_path, output_path)

    progress(1.0, desc="Done!")

    return str(output_path), srt_text, str(edited_srt_path), pipeline_state, ""


def preview_subtitle(
    video_file,
    font_name: str,
    font_size: int,
    font_color: str,
    outline: int,
    shadow: int,
    border_style: int,
    alignment: int,
    margin_v: int,
):
    """Generate a single-frame preview with sample subtitle using current font settings."""
    if video_file is None:
        return None

    video_path = Path(video_file)
    style = build_force_style(
        font_name=font_name,
        font_size=font_size,
        primary_colour=hex_to_ass_color(font_color),
        outline=outline,
        shadow=shadow,
        border_style=border_style,
        alignment=alignment,
        margin_v=margin_v,
    )

    try:
        preview_path = generate_preview_frame(
            video_path=video_path,
            force_style=style,
            sample_text="Sample Subtitle Text 样例字幕",
        )
        return str(preview_path)
    except Exception as e:
        print(f"Preview error: {e}")
        return None


# ── Gradio Interface ───────────────────────────────────────────────────────

with gr.Blocks(title="Video Subtitler") as demo:
    gr.Markdown("""
    # 🎬 Video Subtitler
    Auto-generate subtitles for MP4 videos using **faster-whisper** + FFmpeg.

    Upload a video → get back a subtitled version + SRT file. Edit the SRT and regenerate!
    """)

    pipeline_state = gr.State(None)

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
                    value="Hardcode (burned in)",
                    label="Subtitle Mode",
                    info="Soft = can toggle on/off; Hardcode = always visible",
                )
            with gr.Row():
                model_input = gr.Dropdown(
                    choices=["tiny", "base", "small", "medium", "large-v3"],
                    value=APP_MODEL,
                    label="Whisper Model",
                    info="Larger = more accurate, slower",
                )
                device_input = gr.Dropdown(
                    choices=["cuda", "cpu"],
                    value=APP_DEVICE,
                    label="Device",
                    info="cuda requires NVIDIA GPU",
                )
                compute_input = gr.Dropdown(
                    choices=["float16", "int8_float16", "int8"],
                    value=APP_COMPUTE_TYPE,
                    label="Compute Type",
                    info="Lower precision = less VRAM, slightly less accurate",
                )
            with gr.Accordion("Font Customization", open=False, visible=True) as font_accordion:
                font_name_input = gr.Dropdown(
                    choices=get_system_fonts(),
                    value="Literata",
                    label="Font Name",
                    info="Select a system font for hardcoded subtitles",
                    allow_custom_value=True,
                    filterable=True,
                )
                with gr.Row():
                    font_size_input = gr.Slider(
                        minimum=8, maximum=72, value=12, step=1,
                        label="Font Size",
                        info="Subtitle font size in points",
                    )
                    outline_input = gr.Slider(
                        minimum=0, maximum=10, value=0, step=1,
                        label="Outline Width",
                        info="Border/outline thickness",
                    )
                with gr.Row():
                    font_color_input = gr.ColorPicker(
                        value="#FFFFFF",
                        label="Font Color",
                        info="Text color (hex)",
                    )
                    shadow_input = gr.Slider(
                        minimum=0, maximum=10, value=0, step=1,
                        label="Shadow Depth",
                        info="Shadow offset in pixels",
                    )
                with gr.Row():
                    border_style_input = gr.Dropdown(
                        choices=[("Outline + Shadow", 1), ("Opaque Box", 3)],
                        value=1,
                        label="Border Style",
                        info="1=outline+shadow, 3=opaque box behind text",
                    )
                    alignment_input = gr.Dropdown(
                        choices=[
                            ("Bottom Left", 1), ("Bottom Center", 2), ("Bottom Right", 3),
                            ("Top Left", 5), ("Top Center", 6), ("Top Right", 7),
                            ("Mid Left", 9), ("Mid Center", 10), ("Mid Right", 11),
                        ],
                        value=2,
                        label="Alignment",
                        info="Subtitle position on screen (SSA alignment values)",
                    )
                margin_v_input = gr.Slider(
                    minimum=0, maximum=200, value=20, step=5,
                    label="Vertical Margin",
                    info="Distance from bottom edge in pixels",
                )
                with gr.Row():
                    preview_btn = gr.Button("Preview Font", variant="secondary")
            submit_btn = gr.Button("Generate Subtitles", variant="primary", size="lg")

        with gr.Column():
            preview_output = gr.Image(
                label="Font Preview",
                type="filepath",
                visible=True,
            )
            video_output = gr.Video(label="Subtitled Video")
            srt_output = gr.Textbox(
                label="SRT Content (editable)",
                lines=15,
                max_lines=50,
                info="Edit the SRT content below, then click Regenerate Video",
            )
            with gr.Row():
                srt_download = gr.File(
                    label="Download SRT",
                    file_types=[".srt"],
                )
                regenerate_btn = gr.Button("Regenerate Video", variant="secondary")
            error_msg = gr.Markdown("", visible=True)

    gr.Markdown("""
    ---
    **Config:** Model, device, and compute type are set via the dropdowns above.
    """)

    # ── Event wiring ──────────────────────────────────────────────────
    submit_btn.click(
        fn=process_video,
        inputs=[
            video_input, language_input, mode_input, model_input, device_input, compute_input,
            font_name_input, font_size_input, font_color_input,
            outline_input, shadow_input, border_style_input, alignment_input, margin_v_input,
        ],
        outputs=[video_output, srt_output, srt_download, pipeline_state, error_msg],
    )

    regenerate_btn.click(
        fn=regenerate_video,
        inputs=[
            srt_output, mode_input, pipeline_state,
            font_name_input, font_size_input, font_color_input,
            outline_input, shadow_input, border_style_input, alignment_input, margin_v_input,
        ],
        outputs=[video_output, srt_output, srt_download, pipeline_state, error_msg],
    )

    # Toggle font customization visibility based on subtitle mode
    mode_input.change(
        fn=lambda mode: gr.update(visible=(mode == "Hardcode (burned in)")),
        inputs=[mode_input],
        outputs=[font_accordion],
    )

    # Also toggle preview visibility
    mode_input.change(
        fn=lambda mode: gr.update(visible=(mode == "Hardcode (burned in)")),
        inputs=[mode_input],
        outputs=[preview_output],
    )

    preview_btn.click(
        fn=preview_subtitle,
        inputs=[
            video_input, font_name_input, font_size_input, font_color_input,
            outline_input, shadow_input, border_style_input, alignment_input,
            margin_v_input,
        ],
        outputs=[preview_output],
    )


if __name__ == "__main__":
    demo.launch()
