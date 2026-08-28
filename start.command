#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Video Subtitler — macOS Launcher
#
# Double-click this file in Finder to start Video Subtitler.
# It calls start.sh which handles all setup and launches the web UI.
# ──────────────────────────────────────────────────────────────────────────────

# Fix execute permissions — macOS ZIP extraction strips them.
# When downloaded as a ZIP from GitHub, this file (and start.sh) may not be
# executable. Self-repair so double-click keeps working.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$SCRIPT_DIR/start.sh" ]; then
    chmod +x "$SCRIPT_DIR/start.sh" 2>/dev/null
fi

cd "$SCRIPT_DIR"
exec ./start.sh
