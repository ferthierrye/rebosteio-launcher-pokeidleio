param([switch]$SkipPrepare)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
Set-Location $root
if (!$SkipPrepare) {
    & "$root\.runtime\python\Scripts\python.exe" "$PSScriptRoot\prepare-login-runtime.py"
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar componentes de login.' }
}
$config = @{
    bundle = @{
        targets = @('nsis')
        resources = @{ '../../.runtime/distribution/login-runtime.zip' = 'login-runtime.zip' }
        windows = @{
            webviewInstallMode = @{ type = 'offlineInstaller'; silent = $true }
            nsis = @{ installMode = 'currentUser'; languages = @('PortugueseBR'); displayLanguageSelector = $false; compression = 'none'; installerHooks = '../../tools/installer-hooks.nsh' }
        }
    }
}
$configPath = "$root\.runtime\distribution\bundle.json"
$config | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $configPath
Set-Location "$root\rust-migration"
& cargo.exe tauri build --bundles nsis --config $configPath -- --locked
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar instalador.' }
$version = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).version
$output = "$root\dist\PIO-Nailo-$version-Setup.exe"
New-Item "$root\dist" -ItemType Directory -Force | Out-Null
$installer = Get-ChildItem "$root\rust-migration\src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$installer) { throw 'Instalador nao encontrado.' }
Copy-Item -LiteralPath $installer.FullName -Destination $output -Force
Get-FileHash -LiteralPath $output -Algorithm SHA256
