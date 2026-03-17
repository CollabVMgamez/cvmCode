@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1" %*
endlocal
