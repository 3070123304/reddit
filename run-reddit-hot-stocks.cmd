@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" "%SCRIPT_DIR%scripts\fetchRedditHotStocks.mjs"
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  node "%SCRIPT_DIR%scripts\fetchRedditHotStocks.mjs"
  exit /b %ERRORLEVEL%
)

echo Node.js was not found.
echo Please install Node.js from https://nodejs.org/ or run this project from Codex.
exit /b 1
