@echo off
REM ============================================================
REM  StudyBoost AI - one-click local launcher (Windows)
REM  Double-click this file to start the app.
REM ============================================================
cd /d "%~dp0"

REM 1) Make sure the Python launcher is available
where py >nul 2>nul
if errorlevel 1 (
    echo.
    echo  [!] Python was not found. Install Python 3 from https://www.python.org/
    echo      and make sure "py" works in a terminal, then run this again.
    echo.
    pause
    exit /b 1
)

REM 2) Install/refresh dependencies (quiet; safe to run every time)
echo Checking dependencies...
py -m pip install -r requirements.txt >nul 2>nul

REM 3) Open the browser a couple seconds after the server starts (detached)
echo Opening http://127.0.0.1:8765/ in your browser...
start "StudyBoost browser" /min cmd /c "timeout /t 3 >nul & explorer http://127.0.0.1:8765/"

REM 4) Start the server (this window must stay open while you use the app)
echo.
echo ============================================================
echo   StudyBoost AI is running at http://127.0.0.1:8765/
echo   KEEP THIS WINDOW OPEN while using the app.
echo   Close this window (or press Ctrl+C) to stop the server.
echo ============================================================
echo.
py server.py

echo.
echo Server stopped.
pause
