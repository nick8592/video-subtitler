#!/usr/bin/env python3
"""FastAPI backend for Video Subtitler.

Replaces the Gradio UI in app.py with a REST + SSE API. Mirrors the validation,
CUDA check, duration check, and pipeline stages from app.py; runs blocking
ffmpeg / Whisper calls in asyncio.to_thread so the event loop stays responsive
for SSE progress events.

Run:  python3 server.py    (listens on http://127.0.0.1:7860)
"""

import asyncio
import json
import os
import subprocess
import tempfile
import uuid
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse

from add_subtitles import (
    MODEL_SIZE,
    DEVICE,
    COMPUTE_TYPE,
    build_force_style,
    extract_audio,
    generate_preview_frame,
    hardcode_subtitle,
    hex_to_ass_color,
    mux_subtitle,
    transcribe_to_srt,
)

# ── Config (override via env vars) ────────────────────────────────────────


def _cuda_available() -> bool:
    """Check whether a CUDA-capable GPU is accessible to CTranslate2."""
    try:
        import ctranslate2
        return ctranslate2.get_cuda_device_count() > 0
    except Exception:
        return False


HAS_CUDA = _cuda_available()

APP_MODEL = os.environ.get("WHISPER_MODEL", "small")
APP_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda" if HAS_CUDA else "cpu")
APP_COMPUTE_TYPE = os.environ.get(
    "WHISPER_COMPUTE_TYPE", COMPUTE_TYPE if HAS_CUDA else "int8"
)

MAX_VIDEO_DURATION_S = int(os.environ.get("MAX_VIDEO_DURATION_S", "0"))  # 0 = no limit

LANGUAGE_OPTIONS = [
    "auto", "en", "zh", "ja", "ko", "es", "fr", "de", "id",
    "pt", "ru", "it", "nl", "pl", "tr", "vi", "th", "ar", "hi",
]

# ── Helpers (mirror app.py) ───────────────────────────────────────────────


def _get_video_duration(video_path: Path) -> float:
    """Return video duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", str(video_path)],
            capture_output=True, text=True, check=True,
        )
        return float(json.loads(result.stdout).get("format", {}).get("duration", 0))
    except (subprocess.CalledProcessError, json.JSONDecodeError, ValueError):
        return 0.0


def get_system_fonts() -> list[str]:
    """Return sorted list of system font family names via fc-list."""
    try:
        result = subprocess.run(
            ["fc-list", "--format=%{family}\n"],
            capture_output=True, text=True, check=True,
        )
        families: set[str] = set()
        for line in result.stdout.strip().splitlines():
            for name in line.split(","):
                name = name.strip()
                if name:
                    families.add(name)
        return sorted(families)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ["Arial", "DejaVu Sans", "Liberation Sans", "Noto Sans", "Literata"]


def _build_style(
    font_name: str, font_size: int, font_color: str,
    outline: int, shadow: int, border_style: int, alignment: int, margin_v: int, margin_h: int,
) -> str:
    back_colour = "&H80000000&" if border_style == 3 else "&H000000&"
    return build_force_style(
        font_name=font_name,
        font_size=font_size,
        primary_colour=hex_to_ass_color(font_color),
        outline=outline,
        shadow=shadow,
        border_style=border_style,
        alignment=alignment,
        margin_v=margin_v,
        margin_h=margin_h,
        back_colour=back_colour,
    )


def _burn_or_mux(mode: str, video_path: Path, srt_path: Path, output_path: Path, style: str) -> None:
    """Blocking helper — call from asyncio.to_thread."""
    if "burned" in mode.lower() or "hardcode" in mode.lower():
        hardcode_subtitle(video_path, srt_path, output_path, force_style=style)
    else:
        mux_subtitle(video_path, srt_path, output_path)


def _ffmpeg_error_message(exc: subprocess.CalledProcessError) -> str:
    stderr = exc.stderr.decode(errors="replace") if exc.stderr else ""
    lines = [ln for ln in stderr.strip().splitlines() if ln.strip()]
    tail = lines[-1] if lines else str(exc)
    return f"Video processing failed: {tail}"


def _validate_device(device: str, compute_type: str) -> str | None:
    """Return an error message string, or None if the combo is valid."""
    if device == "cuda" and not HAS_CUDA:
        return (
            "Your computer doesn't have a supported NVIDIA GPU. "
            "Please switch Device to 'CPU' in the settings."
        )
    if device == "cpu" and compute_type in ("float16", "int8_float16"):
        return (
            "This setting requires an NVIDIA GPU, but you're using CPU mode. "
            "Please switch Compute Type to 'int8' in the settings."
        )
    return None


def _save_upload(video: UploadFile, target: Path) -> None:
    """Stream an UploadFile to disk — sync, call inside asyncio.to_thread."""
    with target.open("wb") as f:
        while chunk := video.file.read(1024 * 1024):
            f.write(chunk)


# ── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(title="Video Subtitler")

# Local-only app — wide-open CORS so the frontend can hit the API from any origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# job_id → {"video_path", "tmpdir", "srt_path", "output_path"}
_jobs: dict[str, dict[str, Any]] = {}

WEB_DIR = Path(__file__).parent / "web"
if (WEB_DIR / "static").is_dir():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR / "static")), name="static")


def _web_route(path_name: str):
    """Serve a file from web/ at the wrapped route; 404 cleanly if missing."""
    target = WEB_DIR / path_name

    async def handler() -> FileResponse:
        if not target.is_file():
            raise HTTPException(
                status_code=404,
                detail=f"Frontend file '{path_name}' not found in web/.",
            )
        return FileResponse(target)

    handler.__name__ = f"serve_{path_name.replace('.', '_')}"
    return handler


app.get("/", include_in_schema=False)(_web_route("index.html"))
app.get("/app", include_in_schema=False)(_web_route("app.html"))
app.get("/demo", include_in_schema=False)(_web_route("demo.html"))


@app.get("/app.html", include_in_schema=False)
async def redirect_app_html():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/app")


# ── /api/config, /api/fonts, /api/files ────────────────────────────────────


@app.get("/api/config")
async def api_config() -> dict[str, Any]:
    return {
        "model_size": APP_MODEL,
        "device": APP_DEVICE,
        "compute_type": APP_COMPUTE_TYPE,
        "has_cuda": HAS_CUDA,
        "language_options": LANGUAGE_OPTIONS,
        "max_duration": MAX_VIDEO_DURATION_S,
    }


@app.get("/api/fonts")
async def api_fonts() -> dict[str, Any]:
    return {"fonts": get_system_fonts()}


@app.get("/api/files/{job_id}/{kind}")
async def api_files(job_id: str, kind: str) -> FileResponse:
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id.")
    if kind == "video":
        path = job.get("output_path")
        if not path or not Path(path).exists():
            raise HTTPException(status_code=404, detail="Video not ready.")
        return FileResponse(path, media_type="video/mp4", filename="subtitled.mp4")
    if kind == "srt":
        path = job.get("srt_path")
        if not path or not Path(path).exists():
            raise HTTPException(status_code=404, detail="SRT not ready.")
        return FileResponse(path, media_type="application/x-subrip", filename="subtitles.srt")
    raise HTTPException(status_code=400, detail="kind must be 'video' or 'srt'.")


# ── SSE helpers ────────────────────────────────────────────────────────────


def _sse(data: dict[str, Any]) -> dict[str, str]:
    """Wrap a dict payload as a single SSE `data:` line containing JSON."""
    return {"data": json.dumps(data, ensure_ascii=False)}


# ── /api/process ────────────────────────────────────────────────────────────


@app.post("/api/process")
async def api_process(
    video: UploadFile = File(...),
    language: str = Form("auto"),
    mode: str = Form("Toggleable (soft subtitle)"),
    model_size: str = Form(APP_MODEL),
    device: str = Form(APP_DEVICE),
    compute_type: str = Form(APP_COMPUTE_TYPE),
    font_name: str = Form("Literata"),
    font_size: int = Form(12),
    font_color: str = Form("#FFFFFF"),
    outline: int = Form(0),
    shadow: int = Form(0),
    border_style: int = Form(1),
    alignment: int = Form(2),
    margin_v: int = Form(20),
    margin_h: int = Form(10),
) -> EventSourceResponse:
    """Process an uploaded video → SSE progress stream → final result event."""
    job_id = uuid.uuid4().hex
    tmpdir = tempfile.mkdtemp(prefix=f"vs-{job_id}-")
    safe_name = Path(video.filename or "input.mp4").name or "input.mp4"
    upload_path = Path(tmpdir) / safe_name

    # Persist upload BEFORE opening the SSE stream so a dropped client doesn't
    # strand us with no source video on disk.
    try:
        await asyncio.to_thread(_save_upload, video, upload_path)
    finally:
        await video.close()

    async def stream() -> AsyncIterator[dict[str, str]]:
        try:
            yield _sse({"stage": "checking", "progress": 0, "message": "Checking video..."})

            if MAX_VIDEO_DURATION_S > 0:
                duration = await asyncio.to_thread(_get_video_duration, upload_path)
                if duration > MAX_VIDEO_DURATION_S:
                    yield _sse({
                        "stage": "error", "progress": 0,
                        "message": (
                            f"Video is {duration:.0f}s — max is {MAX_VIDEO_DURATION_S}s. "
                            "Please upload a shorter clip."
                        ),
                    })
                    return

            err = _validate_device(device, compute_type)
            if err is not None:
                yield _sse({"stage": "error", "progress": 0, "message": err})
                return

            stem = Path(safe_name).stem
            audio_path = Path(tmpdir) / "audio.wav"
            srt_path = Path(tmpdir) / f"{stem}.srt"
            output_path = Path(tmpdir) / f"{stem}_subtitled.mp4"
            style = _build_style(font_name, font_size, font_color,
                                 outline, shadow, border_style, alignment, margin_v, margin_h)

            yield _sse({"stage": "extracting", "progress": 10, "message": "Extracting audio..."})
            await asyncio.to_thread(extract_audio, upload_path, audio_path)

            yield _sse({
                "stage": "loading_model", "progress": 20,
                "message": f"Loading Whisper model ({model_size})...",
            })
            yield _sse({"stage": "transcribing", "progress": 50, "message": "Transcribing..."})
            lang_arg = None if language == "auto" else language
            await asyncio.to_thread(
                transcribe_to_srt, audio_path, srt_path,
                model_size, lang_arg, device, compute_type,
            )

            if mode == "Always visible (burned in)":
                yield _sse({
                    "stage": "burning", "progress": 70,
                    "message": "Burning subtitles into video (2-pass encode)...",
                })
            else:
                yield _sse({
                    "stage": "muxing", "progress": 70,
                    "message": "Adding subtitle track to video...",
                })
            await asyncio.to_thread(_burn_or_mux, mode, upload_path, srt_path, output_path, style)

            async with aiofiles.open(srt_path, "r", encoding="utf-8") as f:
                srt_content = await f.read()

            try:
                await asyncio.to_thread(audio_path.unlink)
            except FileNotFoundError:
                pass

            _jobs[job_id] = {
                "video_path": str(upload_path),
                "tmpdir": tmpdir,
                "srt_path": str(srt_path),
                "output_path": str(output_path),
            }
            yield _sse({
                "stage": "done", "progress": 100, "message": "Done!",
                "result": {
                    "video_url": f"/api/files/{job_id}/video",
                    "srt_url": f"/api/files/{job_id}/srt",
                    "srt_content": srt_content,
                },
            })

        except subprocess.CalledProcessError as exc:
            yield _sse({"stage": "error", "progress": 0, "message": _ffmpeg_error_message(exc)})
        except Exception as exc:
            yield _sse({"stage": "error", "progress": 0,
                        "message": f"{type(exc).__name__}: {exc}"})

    return EventSourceResponse(stream())


# ── /api/regenerate ─────────────────────────────────────────────────────────


@app.post("/api/regenerate")
async def api_regenerate(
    srt_text: str = Form(...),
    mode: str = Form(...),
    job_id: str = Form(...),
    font_name: str = Form("Literata"),
    font_size: int = Form(12),
    font_color: str = Form("#FFFFFF"),
    outline: int = Form(0),
    shadow: int = Form(0),
    border_style: int = Form(1),
    alignment: int = Form(2),
    margin_v: int = Form(20),
    margin_h: int = Form(10),
) -> EventSourceResponse:
    """Regenerate the subtitled video from edited SRT text for an existing job."""
    job = _jobs.get(job_id)

    async def stream() -> AsyncIterator[dict[str, str]]:
        try:
            if job is None or "video_path" not in job or "tmpdir" not in job:
                yield _sse({
                    "stage": "error", "progress": 0,
                    "message": "Generate subtitles first before regenerating.",
                })
                return

            video_path = Path(job["video_path"])
            tmpdir = job["tmpdir"]
            if not video_path.exists():
                yield _sse({
                    "stage": "error", "progress": 0,
                    "message": "Original video file is no longer available.",
                })
                return

            edited_srt_path = Path(tmpdir) / f"{video_path.stem}_edited.srt"
            output_path = Path(tmpdir) / f"{video_path.stem}_subtitled.mp4"
            style = _build_style(font_name, font_size, font_color,
                                 outline, shadow, border_style, alignment, margin_v, margin_h)

            yield _sse({"stage": "preparing", "progress": 10, "message": "Writing edited SRT..."})
            async with aiofiles.open(edited_srt_path, "w", encoding="utf-8") as f:
                await f.write(srt_text)

            if mode == "Always visible (burned in)":
                yield _sse({
                    "stage": "burning", "progress": 70,
                    "message": "Burning edited subtitles into video (2-pass encode)...",
                })
            else:
                yield _sse({
                    "stage": "muxing", "progress": 70,
                    "message": "Adding edited subtitle track to video...",
                })
            await asyncio.to_thread(_burn_or_mux, mode, video_path, edited_srt_path, output_path, style)

            _jobs[job_id]["srt_path"] = str(edited_srt_path)
            _jobs[job_id]["output_path"] = str(output_path)
            yield _sse({
                "stage": "done", "progress": 100, "message": "Done!",
                "result": {
                    "video_url": f"/api/files/{job_id}/video",
                    "srt_url": f"/api/files/{job_id}/srt",
                    "srt_content": srt_text,
                },
            })

        except subprocess.CalledProcessError as exc:
            yield _sse({"stage": "error", "progress": 0, "message": _ffmpeg_error_message(exc)})
        except Exception as exc:
            yield _sse({"stage": "error", "progress": 0,
                        "message": f"{type(exc).__name__}: {exc}"})

    return EventSourceResponse(stream())


# ── /api/preview ────────────────────────────────────────────────────────────


@app.post("/api/preview")
async def api_preview(
    video: UploadFile = File(...),
    font_name: str = Form("Literata"),
    font_size: int = Form(12),
    font_color: str = Form("#FFFFFF"),
    outline: int = Form(0),
    shadow: int = Form(0),
    border_style: int = Form(1),
    alignment: int = Form(2),
    margin_v: int = Form(20),
    margin_h: int = Form(10),
) -> FileResponse:
    """Render one frame with a sample subtitle and return the PNG."""
    tmpdir = tempfile.mkdtemp(prefix="vs-preview-")
    safe_name = Path(video.filename or "input.mp4").name or "input.mp4"
    upload_path = Path(tmpdir) / safe_name
    preview_path = Path(tmpdir) / "preview.png"

    try:
        await asyncio.to_thread(_save_upload, video, upload_path)
    finally:
        await video.close()

    style = _build_style(font_name, font_size, font_color,
                         outline, shadow, border_style, alignment, margin_v, margin_h)
    try:
        await asyncio.to_thread(
            generate_preview_frame,
            upload_path, None, style, preview_path, "Sample Subtitle Text 样例字幕",
        )
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=_ffmpeg_error_message(exc)) from exc
    return FileResponse(preview_path, media_type="image/png", filename="preview.png")


# ── Main ─────────────────────────────────────────────────────────────────────

def _open_browser(url: str) -> None:
    """Open the web UI in the default browser (best-effort, non-blocking)."""
    import threading
    import webbrowser

    def _opener():
        import time
        time.sleep(1.5)  # wait for server to be ready
        webbrowser.open(url)

    thread = threading.Thread(target=_opener, daemon=True)
    thread.start()


if __name__ == "__main__":
    import uvicorn

    HOST = "127.0.0.1"
    PORT = 7860
    url = f"http://{HOST}:{PORT}"
    _open_browser(url)
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
