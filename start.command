#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Video Subtitler — macOS Launcher
#
# Double-click this file in Finder to start Video Subtitler.
# It calls start.sh which handles all setup and launches the web UI.
# ──────────────────────────────────────────────────────────────────────────────
cd "$(dirname "$0")"
exec ./start.sh
