@echo off
setlocal
title PIO Nailo - Rust
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-source.ps1"
if errorlevel 1 echo Atualizacao indisponivel. Tentando abrir o codigo local.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-rust.ps1"
if errorlevel 1 (
  echo.
  echo Nao foi possivel abrir. Confira a mensagem acima e o TUTORIAL.md.
  pause
  exit /b 1
)
