#!/usr/bin/env python3
"""Batch subtitle generator & muxer for .mp4 videos.

Usage:
  python3 add_subtitles.py /path/to/videos              # soft subtitle (default)
  python3 add_subtitles.py /path/to/videos --hardcode    # burn subtitles into video
  python3 add_subtitles.py /path/to/videos --srt         # generate .srt only
  python3 add_subtitles.py /path/to/videos --mux         # mux existing .srt only
  python3 add_subtitles.py /path/to/videos --model medium
  python3 add_subtitles.py /path/to/video.mp4 --file     # process a single file
"""

import argparse
import json
import os
import re
import site
import subprocess
import sys
import tempfile
from pathlib import Path

_all_sites = site.getsitepackages() + ([site.getusersitepackages()] if site.getusersitepackages() else [])
_cuda_paths = []
for _sp in _all_sites:
    _nvidia_dir = os.path.join(_sp, "nvidia")
    if os.path.isdir(_nvidia_dir):
        for _sub in ("cublas/lib", "cuda_nvrtc/lib", "cudnn/lib"):
            _p = os.path.join(_nvidia_dir, _sub)
            if os.path.isdir(_p):
                _cuda_paths.append(_p)
if _cuda_paths and "___CUDA_FIXED" not in os.environ:
    os.environ["LD_LIBRARY_PATH"] = ":".join(_cuda_paths) + ":" + os.environ.get("LD_LIBRARY_PATH", "")
    os.environ["___CUDA_FIXED"] = "1"
    os.execv(sys.executable, [sys.executable] + sys.argv)

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "float16")
LANGUAGE = "auto"
BEAM_SIZE = 5
VAD_FILTER = True
# Maximum duration per VAD speech chunk — forces shorter segments from the start
MAX_SPEECH_DURATION_S = 8
# Maximum duration per final SRT entry — segments longer than this get split
MAX_SEGMENT_DURATION_S = 5
# Minimum gap between split segments (seconds)
MIN_SPLIT_GAP_S = 0.15
HARDCODE_STYLE = "FontName=Literata,FontSize=12,PrimaryColour=&HFFFFFF,Outline=0,Shadow=0,BorderStyle=1,Alignment=2,MarginV=20"
HARDCODE_CODEC = "libx264"


def hex_to_ass_color(hex_color: str) -> str:
    """Convert HTML hex color (#RRGGBB or RRGGBB) to ASS color format (&HBBGGRR&)."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return "&HFFFFFF&"  # fallback to white
    r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
    return f"&H{b}{g}{r}&"


def build_force_style(
    font_name: str = "Literata",
    font_size: int = 12,
    primary_colour: str = "&HFFFFFF&",
    outline: int = 0,
    shadow: int = 0,
    border_style: int = 1,
    alignment: int = 2,
    margin_v: int = 20,
) -> str:
    """Build an ASS force_style string for FFmpeg's subtitles filter."""
    return (
        f"FontName={font_name},FontSize={font_size},"
        f"PrimaryColour={primary_colour},"
        f"Outline={outline},Shadow={shadow},"
        f"BorderStyle={border_style},Alignment={alignment},"
        f"MarginV={margin_v}"
    )


# Phrase-boundary markers: split after these words when re-segmenting
_PHRASE_BREAKS = re.compile(r"[,.!?:;]|\b(and|but|so|or|because|however|while|although|though|yet|when|if|then|that|which|who)\b", re.IGNORECASE)


def extract_audio(video_path: Path, audio_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(audio_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def _split_long_segment(segment, max_duration: float):
    """Split a single segment at phrase boundaries using word timestamps.

    Returns a list of (start, end, text) tuples, each ≤ max_duration seconds.
    """
    words = segment.words
    if not words or len(words) <= 1:
        return [(segment.start, segment.end, segment.text.strip())]

    duration = segment.end - segment.start
    if duration <= max_duration:
        return [(segment.start, segment.end, segment.text.strip())]

    # Walk through words and find natural phrase-break split points
    sub_segments = []
    chunk_start = words[0].start
    chunk_words = [words[0]]

    for w in words[1:]:
        candidate_end = w.end
        candidate_duration = candidate_end - chunk_start

        # Check if there's a phrase break between previous word and this one
        prev_text = chunk_words[-1].word.strip()
        has_break = _PHRASE_BREAKS.search(prev_text) is not None

        # Split conditions: phrase break + over max, or way over max
        should_split = (
            (has_break and candidate_duration >= max_duration * 0.6)
            or candidate_duration >= max_duration
        )

        if should_split and (candidate_duration >= 1.0):  # don't create <1s subs
            text = "".join(ww.word for ww in chunk_words).strip()
            sub_segments.append((chunk_start, chunk_words[-1].end + MIN_SPLIT_GAP_S, text))
            chunk_start = w.start
            chunk_words = [w]
        else:
            chunk_words.append(w)

    # Flush remaining words
    if chunk_words:
        text = "".join(ww.word for ww in chunk_words).strip()
        sub_segments.append((chunk_start, chunk_words[-1].end, text))

    return sub_segments


def transcribe_to_srt(audio_path: Path, srt_path: Path, model_size: str, language: str | None = None, device: str | None = None, compute_type: str | None = None) -> None:
    from faster_whisper import WhisperModel
    from faster_whisper.vad import VadOptions

    _device = device or DEVICE
    _compute_type = compute_type or COMPUTE_TYPE
    print(f"  Loading model {model_size} on {_device} ({_compute_type})…")
    model = WhisperModel(model_size, device=_device, compute_type=_compute_type)

    vad_params = VadOptions(
        max_speech_duration_s=MAX_SPEECH_DURATION_S,
        min_silence_duration_ms=500,  # more responsive VAD for conversational gaps
    )

    lang_kwarg = {}
    if language and language != "auto":
        lang_kwarg["language"] = language

    print(f"  Transcribing {audio_path.name} (lang={language or 'auto'}, max segment {MAX_SEGMENT_DURATION_S}s)…")
    segments, info = model.transcribe(
        str(audio_path),
        beam_size=BEAM_SIZE,
        vad_filter=VAD_FILTER,
        vad_parameters=vad_params,
        word_timestamps=True,
        **lang_kwarg,
    )
    detected = info.language if not lang_kwarg.get("language") else lang_kwarg["language"]
    print(f"  Detected language: {detected} (prob {info.language_probability:.2f})")

    # Collect and re-segment for short conversational subtitles
    final_entries = []
    for segment in segments:
        if segment.end - segment.start <= MAX_SEGMENT_DURATION_S:
            final_entries.append((segment.start, segment.end, segment.text.strip()))
        else:
            sub = _split_long_segment(segment, MAX_SEGMENT_DURATION_S)
            final_entries.extend(sub)

    final_entries = [(s, e, _capitalize(text)) for s, e, text in final_entries]

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, (start, end, text) in enumerate(final_entries, start=1):
            f.write(f"{i}\n{_format_timestamp(start)} --> {_format_timestamp(end)}\n{text}\n\n")

    print(f"  Saved {srt_path.name} ({len(final_entries)} segments)")


def _capitalize(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def _format_timestamp(seconds: float) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def mux_subtitle(video_path: Path, srt_path: Path, output_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(srt_path),
        "-c", "copy",
        "-c:s", "mov_text",
        "-metadata:s:s:0", "language=en",
        "-metadata:s:s:0", "title=English Subtitles",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"  Muxed (soft) → {output_path.name}")


def _get_video_rotation(video_path: Path) -> int | None:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_streams", str(video_path)],
            capture_output=True, text=True, check=True,
        )
        streams = json.loads(result.stdout).get("streams", [])
        for s in streams:
            if s.get("codec_type") == "video":
                for sd in s.get("side_data_list", []):
                    if "rotation" in sd:
                        return sd["rotation"]
        return None
    except (subprocess.CalledProcessError, json.JSONDecodeError):
        return None


def _get_video_bitrate(video_path: Path) -> int | None:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(video_path)],
            capture_output=True, text=True, check=True,
        )
        fmt = json.loads(result.stdout).get("format", {})
        br = int(fmt.get("bit_rate", 0))
        return br if br > 0 else None
    except (subprocess.CalledProcessError, json.JSONDecodeError, ValueError):
        return None


def hardcode_subtitle(
    video_path: Path,
    srt_path: Path,
    output_path: Path,
    force_style: str | None = None,
) -> None:
    escaped_srt = str(srt_path).replace(":", "\\:").replace("'", "\\'")
    style = force_style if force_style is not None else HARDCODE_STYLE
    sub_filter = f"subtitles='{escaped_srt}':force_style='{style}'"

    rotation = _get_video_rotation(video_path)
    has_rotation = rotation is not None

    if has_rotation:
        first_transpose = "1" if rotation in (-90, 270) else "2"
        second_transpose = "2" if rotation in (-90, 270) else "1"
        vf = f"transpose={first_transpose},{sub_filter},transpose={second_transpose}"
    else:
        vf = sub_filter

    source_bitrate = _get_video_bitrate(video_path)
    target_bitrate = source_bitrate if source_bitrate else 10_000_000
    target_kbps = target_bitrate // 1000

    passlog = Path(tempfile.mktemp(suffix=".log"))
    input_args = ["-y", *([] if not has_rotation else ["-noautorotate"]), "-i", str(video_path)]

    pass_cmd = [
        "ffmpeg", *input_args,
        "-vf", vf,
        "-c:v", HARDCODE_CODEC,
        "-b:v", f"{target_kbps}k",
        "-pass", "1",
        "-passlogfile", str(passlog),
        "-an", "-f", "mp4", "/dev/null",
    ]
    subprocess.run(pass_cmd, check=True, capture_output=True)

    pass2_cmd = [
        "ffmpeg", *input_args,
        "-vf", vf,
        "-c:v", HARDCODE_CODEC,
        "-b:v", f"{target_kbps}k",
        "-pass", "2",
        "-passlogfile", str(passlog),
        "-c:a", "aac", "-b:a", "128k",
        str(output_path),
    ]
    subprocess.run(pass2_cmd, check=True, capture_output=True)

    for p in passlog.parent.glob(passlog.name + "*"):
        p.unlink(missing_ok=True)

    orientation = " (vertical)" if has_rotation else ""
    print(f"  Hardcoded{orientation} → {output_path.name} (~{target_kbps}kbps)")


def generate_preview_frame(
    video_path: Path,
    srt_path: Path | None = None,
    force_style: str | None = None,
    output_image_path: Path | None = None,
    sample_text: str = "Sample Subtitle Text",
) -> Path:
    """Extract 1 frame from video and burn a sample subtitle for font preview.

    If srt_path is provided, uses the first subtitle entry.
    Otherwise, creates a temporary SRT with sample_text.
    Returns the path to the preview image (PNG).
    """
    style = force_style if force_style is not None else HARDCODE_STYLE

    if srt_path is None or not srt_path.exists():
        tmp_srt = Path(tempfile.mktemp(suffix=".srt"))
        tmp_srt.write_text(f"1\n00:00:00,000 --> 00:00:05,000\n{sample_text}\n", encoding="utf-8")
        srt_path = tmp_srt

    if output_image_path is None:
        output_image_path = Path(tempfile.mktemp(suffix=".png"))

    escaped_srt = str(srt_path).replace(":", "\\:").replace("'", "\\'")
    sub_filter = f"subtitles='{escaped_srt}':force_style='{style}'"

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", sub_filter,
        "-vframes", "1",
        "-ss", "1",
        str(output_image_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)

    return output_image_path


def process_videos(
    videos: list[Path],
    srt_only: bool,
    mux_only: bool,
    hardcode: bool,
    model_size: str,
    language: str | None = None,
    font_name: str = "Literata",
    font_size: int = 12,
    font_color: str = "#FFFFFF",
    outline: int = 0,
    shadow: int = 0,
    border_style: int = 1,
    alignment: int = 2,
    margin_v: int = 20,
) -> None:
    print(f"Processing {len(videos)} video(s)\n")

    for video in videos:
        srt_path = video.with_suffix(".srt")
        out_suffix = "_subtitled.mp4"
        output_path = video.with_name(video.stem + out_suffix)

        print(f"▶ {video.name}")

        if not mux_only:
            if srt_path.exists():
                print(f"  .srt already exists — skipping (delete to re-run)")
            else:
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
                    audio_path = Path(tmp.name)
                    extract_audio(video, audio_path)
                    transcribe_to_srt(audio_path, srt_path, model_size, language)

        if not srt_only:
            if not srt_path.exists():
                print(f"  ⚠ No .srt found for {video.name} — skipping")
                continue
            if output_path.exists():
                print(f"  Output already exists — skipping (delete to re-run)")
            else:
                if hardcode:
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
                    hardcode_subtitle(video, srt_path, output_path, force_style=style)
                else:
                    mux_subtitle(video, srt_path, output_path)

        print()


def main():
    parser = argparse.ArgumentParser(description="Batch subtitle generator & muxer for .mp4 videos")
    parser.add_argument("path", type=Path, help="Directory containing .mp4 files, or a single .mp4 file with --file")
    parser.add_argument("--file", action="store_true", help="Process a single .mp4 file instead of a directory")
    parser.add_argument("--srt", action="store_true", help="Generate .srt only (skip mux/hardcode)")
    parser.add_argument("--mux", action="store_true", help="Mux existing .srt only (skip transcription)")
    parser.add_argument("--hardcode", action="store_true", help="Burn subtitles into video instead of soft mux")
    parser.add_argument("--model", default=MODEL_SIZE, help=f"Whisper model size (default: {MODEL_SIZE})")
    parser.add_argument("--language", default=LANGUAGE, help=f"Language code, e.g. en/zh/id, or 'auto' to detect (default: {LANGUAGE})")
    parser.add_argument("--font-name", default="Literata", help="Font name for hardcoded subtitles (default: Literata)")
    parser.add_argument("--font-size", type=int, default=12, help="Font size for hardcoded subtitles (default: 12)")
    parser.add_argument("--font-color", default="#FFFFFF", help="Font color as hex (#RRGGBB) for hardcoded subtitles (default: #FFFFFF)")
    parser.add_argument("--outline", type=int, default=0, help="Outline width for hardcoded subtitles (default: 0)")
    parser.add_argument("--shadow", type=int, default=0, help="Shadow depth for hardcoded subtitles (default: 0)")
    parser.add_argument("--border-style", type=int, default=1, choices=[1, 3], help="Border style: 1=outline+shadow, 3=opaque box (default: 1)")
    parser.add_argument("--alignment", type=int, default=2, choices=[1,2,3,5,6,7,9,10,11], help="Subtitle alignment: 1-3=bottom left/center/right, 5-7=top left/center/right, 9-11=mid left/center/right (default: 2)")
    parser.add_argument("--margin-v", type=int, default=20, help="Vertical margin in pixels for hardcoded subtitles (default: 20)")
    args = parser.parse_args()

    if args.file:
        if not args.path.is_file() or not args.path.suffix.lower() == ".mp4":
            print(f"Error: {args.path} is not an .mp4 file")
            sys.exit(1)
        videos = [args.path]
    else:
        if not args.path.is_dir():
            print(f"Error: {args.path} is not a directory")
            sys.exit(1)
        videos = sorted(v for v in args.path.glob("*.mp4") if not v.name.startswith("._"))
        if not videos:
            print(f"No .mp4 files found in {args.path}")
            sys.exit(1)

    process_videos(
        videos, args.srt, args.mux, args.hardcode, args.model, args.language,
        font_name=args.font_name, font_size=args.font_size, font_color=args.font_color,
        outline=args.outline, shadow=args.shadow, border_style=args.border_style,
        alignment=args.alignment, margin_v=args.margin_v,
    )


if __name__ == "__main__":
    main()
