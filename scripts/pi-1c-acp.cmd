@echo off
rem ACP stdio entry for this 1C profile. Does not change the default pi profile.
setlocal EnableExtensions
for %%I in ("%~dp0..") do set "PI_CODING_AGENT_DIR=%%~fI"
where node >nul 2>&1
if errorlevel 1 (
  echo node не найден в PATH. 1>&2
  exit /b 1
)
node "%PI_CODING_AGENT_DIR%\packages\pi-1c-agent\tools\acp-server.mjs"
exit /b %ERRORLEVEL%
