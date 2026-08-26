FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

# ── System dependencies ────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# ── Application source ────────────────────────────────────────────────────
COPY add_subtitles.py .
COPY app.py .

# ── Pre-download Whisper model at build time ──────────────────────────────
# This avoids a slow download on first request.
# Uses CPU/int8 for build-time download only; runtime uses GPU.
ENV WHISPER_MODEL=medium
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('medium', device='cpu', compute_type='int8')"

# ── Runtime defaults ──────────────────────────────────────────────────────
ENV WHISPER_DEVICE=cuda
ENV WHISPER_COMPUTE_TYPE=float16
ENV MAX_VIDEO_DURATION_S=300

# HF Spaces requires port 7860
EXPOSE 7860

CMD ["python3", "app.py"]
