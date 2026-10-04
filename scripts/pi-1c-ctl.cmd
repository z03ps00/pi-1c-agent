@echo off
rem Control panel for this 1C profile. The desktop shortcut launches this, not plain pi.
chcp 65001 >nul
setlocal
for %%I in ("%~dp0..") do set "PI_CODING_AGENT_DIR=%%~fI"
where node >nul 2>&1
if errorlevel 1 (
  echo node не найден в PATH. Нужен Node.js 22.19+. 1>&2
  exit /b 1
)
node "%~dp0pi-1c-ctl.mjs" %*
