@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ─────────────────────────────────────────────────────────────────────────────
REM Video Subtitler — One-Click Launcher (Windows)
REM
REM Double-click this file to start Video Subtitler.
REM It will set up the Python environment automatically and open the web UI.
REM ─────────────────────────────────────────────────────────────────────────────

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║        Video Subtitler — Starting…               ║
echo  ╚══════════════════════════════════════════════════╝
echo.

REM ── 1. Check ffmpeg ─────────────────────────────────────────────────────────
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] ffmpeg is not installed — Video Subtitler needs it to process videos.
    echo.
    echo      Please install ffmpeg:
    echo        1. Download from https://www.gyan.dev/ffmpeg/builds/ (release full)
    echo        2. Extract and add the 'bin' folder to your PATH
    echo        3. Or: winget install ffmpeg
    echo.
    echo      After installing ffmpeg, re-run this script.
    echo.
    pause
    exit /b 1
)

REM ── 2. Check Python ─────────────────────────────────────────────────────────
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Python is not installed.
    echo.
    echo      Please install Python 3.10+ from: https://www.python.org/downloads/
    echo      IMPORTANT: Check "Add Python to PATH" during installation.
    echo.
    echo      After installing Python, re-run this script.
    echo.
    pause
    exit /b 1
)

REM Check Python version (3.10+)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
for /f "tokens=1,2 delims=." %%a in ("%PYVER%") do (
    set PYMAJOR=%%a
    set PYMINOR=%%b
)
if %PYMAJOR% lss 3 (
    echo  [!] Python 3.10+ required. Found: %PYVER%
    echo      Download from: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
if %PYMAJOR% equ 3 if %PYMINOR% lss 10 (
    echo  [!] Python 3.10+ required. Found: %PYVER%
    echo      Download from: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM ── 3. Create / update virtual environment ───────────────────────────────────
if not exist ".venv\Scripts\python.exe" (
    echo  [~] Setting up Video Subtitler for the first time…
    echo.
    echo  [~] Creating virtual environment…
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo  [!] Failed to create virtual environment.
        echo      Make sure you have python-venv installed.
        echo.
        pause
        exit /b 1
    )

    echo  [~] Installing Python packages (this may take a few minutes)…
    .venv\Scripts\python.exe -m pip install --upgrade pip -q
    .venv\Scripts\pip.exe install -r requirements.txt
    if %errorlevel% neq 0 (
        echo  [!] Failed to install packages.
        echo.
        pause
        exit /b 1
    )

    echo.
    echo  [OK] Setup complete!
    echo.
)

REM ── 4. Start the web UI ─────────────────────────────────────────────────────
echo  [OK] Starting Video Subtitler…
echo.
echo  The web UI will open in your browser automatically.
echo  If it doesn't, go to: http://127.0.0.1:7860
echo.
echo  Press Ctrl+C to stop the server.
echo.

.venv\Scripts\python.exe server.py

pause
