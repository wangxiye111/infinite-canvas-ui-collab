@echo off
setlocal
set "CANVAS_NODE=node.exe"
where node.exe >nul 2>nul
if errorlevel 1 set "CANVAS_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%CANVAS_NODE%" "%~dp0start-windows.mjs"
set "CANVAS_EXIT=%ERRORLEVEL%"
if not "%CANVAS_EXIT%"=="0" pause
exit /b %CANVAS_EXIT%
