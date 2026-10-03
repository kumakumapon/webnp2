@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Error: Install Node.js 22.12 or later with npm: https://nodejs.org/
  if "%~1"=="" pause
  exit /b 1
)

node "%~dp0scripts\start-local.mjs" %*
set "WEBNP2_EXIT_CODE=%ERRORLEVEL%"
if not "%WEBNP2_EXIT_CODE%"=="0" if not "%WEBNP2_EXIT_CODE%"=="130" if not "%WEBNP2_EXIT_CODE%"=="143" if "%~1"=="" pause
exit /b %WEBNP2_EXIT_CODE%
