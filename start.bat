@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

REM ─────────────────────────────────────────────────────────────────────────────
REM Video Subtitler — One-Click Launcher (Windows)
REM
REM Double-click this file to start Video Subtitler.
REM It will check for prerequisites, set up the Python environment,
REM download the AI model on first run, and open the web UI.
REM ─────────────────────────────────────────────────────────────────────────────

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║        Video Subtitler — Starting...            ║
echo  ╚══════════════════════════════════════════════════╝
echo.

REM ── 1. Check ffmpeg ─────────────────────────────────────────────────────────
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] ffmpeg is not installed — Video Subtitler needs it to process videos.
    echo.

    REM Try winget first (Windows 10 1709+)
    where winget >nul 2>&1
    if %errorlevel% equ 0 (
        echo      winget is available. Install ffmpeg now?
        echo.
        set /p "answer=      Install ffmpeg via winget? [Y/n] "
        if "!answer!"=="" set "answer=Y"
        if /i "!answer!"=="Y" (
            echo.
            echo  [~] Installing ffmpeg via winget...
            winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
            if !errorlevel! equ 0 (
                echo.
                echo  [OK] ffmpeg installed. Please close and re-open this terminal
                echo       so the new PATH takes effect, then run start.bat again.
                echo.
                pause
                exit /b 0
            ) else (
                echo  [!] winget install failed. Trying choco...
            )
        )
    ) else (
        echo      winget not found.
    )

    REM Try choco as fallback
    where choco >nul 2>&1
    if %errorlevel% equ 0 (
        echo.
        set /p "answer=      Install ffmpeg via Chocolatey? [Y/n] "
        if "!answer!"=="" set "answer=Y"
        if /i "!answer!"=="Y" (
            echo.
            echo  [~] Installing ffmpeg via Chocolatey...
            choco install ffmpeg -y
            if !errorlevel! equ 0 (
                echo.
                echo  [OK] ffmpeg installed. Please close and re-open this terminal
                echo       so the new PATH takes effect, then run start.bat again.
                echo.
                pause
                exit /b 0
            )
        )
    )

    REM Manual install instructions
    echo.
    echo      Please install ffmpeg manually:
    echo        1. Download from https://www.gyan.dev/ffmpeg/builds/  ^(release full^)
    echo        2. Extract and add the 'bin' folder to your PATH
    echo        3. Or open an Administrator terminal and run: winget install ffmpeg
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

REM ── 3. Check uv (optional, faster) ──────────────────────────────────────────
where uv >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  uv is a fast Python package manager that makes installation quicker.
    set /p "answer=  Install uv now? [Y/n] "
    if "!answer!"=="" set "answer=Y"
    if /i "!answer!"=="Y" (
        echo  [~] Installing uv...
        powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
        REM Refresh PATH for current session
        set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%PATH%"
        where uv >nul 2>&1
        if !errorlevel! equ 0 (
            echo  [OK] uv installed.
        ) else (
            echo  [!] uv installed but not on PATH. Falling back to pip.
        )
    ) else (
        echo  [~] Continuing without uv ^(will use pip instead - slower but works^).
    )
    echo.
)

REM ── 4. Create / update virtual environment ───────────────────────────────────
set "NEEDS_INSTALL=false"

if not exist ".venv\Scripts\python.exe" (
    set "NEEDS_INSTALL=true"
)

REM If requirements.txt is newer than the venv, reinstall
if "!NEEDS_INSTALL!"=="false" (
    if exist "requirements.txt" (
        for %%F in (requirements.txt) do set "REQ_TIME=%%~tF"
        for %%F in (.venv\Scripts\python.exe) do set "VENV_TIME=%%~tF"
        if "!REQ_TIME!" gtr "!VENV_TIME!" set "NEEDS_INSTALL=true"
    )
)

if "!NEEDS_INSTALL!"=="true" (
    echo.
    echo  [~] Setting up Video Subtitler...
    echo.

    where uv >nul 2>&1
    if !errorlevel! equ 0 (
        if not exist ".venv\Scripts\python.exe" (
            echo  [~] Creating virtual environment with uv...
            uv venv .venv
            if !errorlevel! neq 0 (
                echo  [!] Failed to create virtual environment with uv. Falling back to python.
                set "USE_UV=false"
            ) else (
                set "USE_UV=true"
            )
        ) else (
            set "USE_UV=true"
        )
        if "!USE_UV!"=="true" (
            echo  [~] Installing Python packages...
            uv pip install -r requirements.txt
            if !errorlevel! neq 0 (
                echo  [!] uv install failed. Falling back to pip.
                set "USE_UV=false"
            )
        )
    ) else (
        set "USE_UV=false"
    )

    if "!USE_UV!"=="false" (
        if not exist ".venv\Scripts\python.exe" (
            echo  [~] Creating virtual environment with python...
            python -m venv .venv
            if !errorlevel! neq 0 (
                echo  [!] Failed to create virtual environment.
                echo      Make sure you have python-venv installed.
                echo.
                pause
                exit /b 1
            )
        )

        echo  [~] Installing Python packages ^(this may take a few minutes^)...
        .venv\Scripts\python.exe -m pip install --upgrade pip -q
        .venv\Scripts\pip.exe install -r requirements.txt
        if !errorlevel! neq 0 (
            echo  [!] Failed to install packages.
            echo.
            pause
            exit /b 1
        )
    )

    echo.
    echo  [OK] Setup complete!
    echo.
)

REM ── 5. Pre-download default Whisper model (if not cached) ───────────────────
set "MODEL_CACHE_DIR=%USERPROFILE%\.cache\huggingface\hub"
set "MODEL_DIR=%MODEL_CACHE_DIR%\models--Systran--faster-whisper-large-v3"

if not exist "%MODEL_DIR%" (
    echo.
    echo  Downloading Whisper model ^(large-v3, ~3 GB^)...
    echo.
    if defined HF_TOKEN (
        echo  [OK] Using HF_TOKEN for faster download.
    )
    .venv\Scripts\python.exe -c "import os; os.environ.pop('HF_HUB_ENABLE_HF_TRANSFER', None); from faster_whisper import WhisperModel; print('  Downloading large-v3 model...', flush=True); WhisperModel('large-v3', device='cpu', compute_type='int8'); print('  OK: large-v3 model cached')"
    if !errorlevel! neq 0 (
        echo  [!] Model download failed. It will be downloaded on first use instead.
    )
    echo.
)

REM ── 6. Start the web UI ─────────────────────────────────────────────────────
echo.
echo  [OK] Starting Video Subtitler...
echo.
echo  The web UI will open in your browser automatically.
echo  If it doesn't, go to: http://127.0.0.1:7860
echo.
echo  Press Ctrl+C to stop the server.
echo.

.venv\Scripts\python.exe server.py

pause
