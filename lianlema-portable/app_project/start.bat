@echo off
REM Lian Le Ma - one-click launcher (double-click to run)
REM Detect LAN IP -> write app/.env -> start model server + Expo
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
