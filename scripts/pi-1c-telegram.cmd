@echo off
rem Telegram plugin for this 1C profile. Does not change the Pi kernel.
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "PI_CODING_AGENT_DIR=%%~fI"
where node >nul 2>&1
if errorlevel 1 (
  echo node не найден в PATH. 1>&2
  exit /b 1
)
node "%PI_CODING_AGENT_DIR%\packages\pi-1c-telegram\bin\pi-1c-telegram.mjs"
