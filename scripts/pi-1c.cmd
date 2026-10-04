@echo off
rem Launch Pi with this 1C profile only. Does not change the default pi profile.
for %%I in ("%~dp0..") do set "PI_CODING_AGENT_DIR=%%~fI"
where pi >nul 2>&1
if errorlevel 1 (
  echo pi не найден в PATH. Установите Pi Coding Agent 0.85.x. 1>&2
  exit /b 1
)
pi %*
