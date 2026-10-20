!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Preparando componentes de login..."
  System::Call 'Kernel32::SetEnvironmentVariable(t "PIO_INSTALL_DIR", t "$INSTDIR") i .r0'
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath (Join-Path $$env:PIO_INSTALL_DIR login-runtime.zip) -DestinationPath $$env:PIO_INSTALL_DIR -Force -ErrorAction Stop; exit 0 } catch { exit 1 }"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Nao foi possivel extrair os componentes de login. Execute o instalador novamente."
    Abort
  ${EndIf}
  Delete "$INSTDIR\login-runtime.zip"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\login-runtime"
!macroend
