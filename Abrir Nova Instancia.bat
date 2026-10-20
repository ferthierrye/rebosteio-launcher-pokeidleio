@echo off
set PIO_INSTANCE=2
start "" wscript.exe //nologo "%~dp0tools\launch-rust.vbs" --instance=2
exit /b
