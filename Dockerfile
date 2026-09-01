FROM python:3.11-slim

# ── System dependencies ────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source ────────────────────────────────────────────────────
COPY add_subtitles.py .
COPY server.py .
COPY web/ ./web/

# ── Pre-download Whisper model at build time ──────────────────────────────
# Small model for CPU — faster inference, decent accuracy for short clips
ENV WHISPER_MODEL=small
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# ── Runtime defaults (CPU-only) ──────────────────────────────────────────
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8
ENV MAX_VIDEO_DURATION_S=120
# Bind to all interfaces so `docker run -p 7860:7860` can reach the app.
ENV VIDEO_SUBTITLER_HOST=0.0.0.0

# HF Spaces requires port 7860
EXPOSE 7860

CMD ["python3", "server.py"]
