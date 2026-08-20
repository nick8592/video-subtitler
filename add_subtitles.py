#!/usr/bin/env python3
"""Batch subtitle generator & muxer for .mp4 videos.

Usage:
  python3 add_subtitles.py /path/to/videos              # soft subtitle (default)
  python3 add_subtitles.py /path/to/videos --hardcode    # burn subtitles into video
  python3 add_subtitles.py /path/to/videos --srt         # generate .srt only
  python3 add_subtitles.py /path/to/videos --mux         # mux existing .srt only
  python3 add_subtitles.py /path/to/videos --model medium
"""

import argparse
import os
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

MODEL_SIZE = "large-v3"
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
LANGUAGE = "en"
BEAM_SIZE = 5
VAD_FILTER = True
HARDCODE_STYLE = "FontName=Literata,FontSize=10,PrimaryColour=&HFFFFFF,Outline=0,Shadow=0,BorderStyle=1,Alignment=2,MarginV=20"


def extract_audio(video_path: Path, audio_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        str(audio_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def transcribe_to_srt(audio_path: Path, srt_path: Path, model_size: str) -> None:
    from faster_whisper import WhisperModel

    print(f"  Loading model {model_size} on {DEVICE} ({COMPUTE_TYPE})…")
    model = WhisperModel(model_size, device=DEVICE, compute_type=COMPUTE_TYPE)

    print(f"  Transcribing {audio_path.name}…")
    segments, info = model.transcribe(
        str(audio_path),
        language=LANGUAGE,
        beam_size=BEAM_SIZE,
        vad_filter=VAD_FILTER,
    )

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(segments, start=1):
            start = _format_timestamp(segment.start)
            end = _format_timestamp(segment.end)
            f.write(f"{i}\n{start} --> {end}\n{segment.text.strip()}\n\n")

    print(f"  Saved {srt_path.name}")


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


def hardcode_subtitle(video_path: Path, srt_path: Path, output_path: Path) -> None:
    escaped_srt = str(srt_path).replace(":", "\\:").replace("'", "\\'")
    vf = f"subtitles='{escaped_srt}':force_style='{HARDCODE_STYLE}'"
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vf", vf,
        "-c:v", "libx264", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"  Hardcoded → {output_path.name}")


def process_directory(video_dir: Path, srt_only: bool, mux_only: bool, hardcode: bool, model_size: str) -> None:
    videos = sorted(v for v in video_dir.glob("*.mp4") if not v.name.startswith("._"))
    if not videos:
        print(f"No .mp4 files found in {video_dir}")
        sys.exit(1)

    print(f"Found {len(videos)} video(s) in {video_dir}\n")

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
                    transcribe_to_srt(audio_path, srt_path, model_size)

        if not srt_only:
            if not srt_path.exists():
                print(f"  ⚠ No .srt found for {video.name} — skipping")
                continue
            if output_path.exists():
                print(f"  Output already exists — skipping (delete to re-run)")
            else:
                if hardcode:
                    hardcode_subtitle(video, srt_path, output_path)
                else:
                    mux_subtitle(video, srt_path, output_path)

        print()


def main():
    parser = argparse.ArgumentParser(description="Batch subtitle generator & muxer for .mp4 videos")
    parser.add_argument("directory", type=Path, help="Directory containing .mp4 files")
    parser.add_argument("--srt", action="store_true", help="Generate .srt only (skip mux/hardcode)")
    parser.add_argument("--mux", action="store_true", help="Mux existing .srt only (skip transcription)")
    parser.add_argument("--hardcode", action="store_true", help="Burn subtitles into video instead of soft mux")
    parser.add_argument("--model", default=MODEL_SIZE, help=f"Whisper model size (default: {MODEL_SIZE})")
    args = parser.parse_args()

    if not args.directory.is_dir():
        print(f"Error: {args.directory} is not a directory")
        sys.exit(1)

    process_directory(args.directory, args.srt, args.mux, args.hardcode, args.model)


if __name__ == "__main__":
    main()
