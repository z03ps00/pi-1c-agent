@echo off
rem Launch Pi with this 1C profile only. Does not change the default pi profile.
setlocal EnableExtensions EnableDelayedExpansion
for %%I in ("%~dp0..") do set "PI_CODING_AGENT_DIR=%%~fI"
where pi >nul 2>&1
if errorlevel 1 (
  echo pi не найден в PATH. Установите Pi Coding Agent 0.85.x. 1>&2
  exit /b 1
)

if "%~1"=="" goto :run

set "CAND=%~1"
if "!CAND!"=="~" set "CAND=%USERPROFILE%"
if "!CAND:~0,2!"=="~\" set "CAND=%USERPROFILE%!CAND:~1!"
if "!CAND:~0,2!"=="~/" set "CAND=%USERPROFILE%!CAND:~1!"

if exist "!CAND!\" (
  cd /d "!CAND!"
  shift
  goto :collect
)

call :looks_like_dir_arg "%~1"
if not errorlevel 1 (
  echo Каталог не найден: %~1 1>&2
  exit /b 1
)

:collect
set "ARGS="
:collect_loop
if "%~1"=="" goto :run
set ARGS=!ARGS! %1
shift
goto :collect_loop

:run
if defined ARGS (
  pi%ARGS%
) else (
  pi
)
exit /b %ERRORLEVEL%

:looks_like_dir_arg
set "P=%~1"
if "%P%"=="~" exit /b 0
if "%P:~0,1%"=="\" exit /b 0
if "%P:~0,1%"=="/" exit /b 0
if "%P:~0,2%"=="~\" exit /b 0
if "%P:~0,2%"=="~/" exit /b 0
if "%P:~0,2%"==".\" exit /b 0
if "%P:~0,2%"=="./" exit /b 0
if "%P:~0,3%"=="..\" exit /b 0
if "%P:~0,3%"=="../" exit /b 0
if "%P:~1,1%"==":" exit /b 0
exit /b 1
