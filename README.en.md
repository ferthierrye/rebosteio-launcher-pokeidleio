# PIO Rebosteio — Multi-Account Launcher

PokeIdle launcher for Windows x64, with four account slots, a Rust backend and WebView2. Rust is now the main implementation. The older Electron source remains for reference and migration tests; its launcher batch file has been removed.

[Português](README.md) · [Tutorial (PT)](TUTORIAL.md) · [Contributing (PT)](CONTRIBUTING.md)

## Run from source

Clone this repository or your fork, or extract **Code → Download ZIP**. Run **`Abrir PIO Rebosteio.bat`** from the repository root.

On first use, the script checks/installs Rust stable, Microsoft C++ Build Tools with VCTools and recommended components, WebView2, Tauri CLI 2.12.1, Python, and Camoufox 0.5.4 plus its browser. Python packages live in `.runtime/python`; Rust dependencies use `Cargo.lock`. Windows component setup requires winget. Administrator approval or a restart may be needed. Initial downloads and compilation can take significant time and several GB. Node.js/npm/Electron are not required by this launcher.

## Updates and forks

For clean Git clones, startup attempts a fast-forward-only pull from the current branch's configured upstream. Local edits are preserved by skipping automatic updates. Forks keep their own tracking configuration. ZIP downloads require manual replacement with a newer ZIP. Failed updates do not prevent trying the existing local source.

The frontend lives in `rust-migration/ui` and is served locally by Tauri. Frontend edits do not need a new distribution executable. Restart through the batch file after editing; native Rust changes compile incrementally. Automatic source watching is disabled to avoid restarting account sessions while editing.

Old standalone executables and shortcuts are not updated by this script. Point shortcuts to the new batch file.

## Local data

Rust stores persistent data under `%APPDATA%/pionailo`, with Windows DPAPI protecting credential files. Preserve this directory during updates. Electron and Rust browser profiles are distinct. Development and packaged apps can also have separate frontend preferences because their origins differ. Authentication sends credentials to the relevant services; local encryption does not remove login network traffic.

Do not commit credentials, tokens, browser profiles, caches or binaries. Release packages are built manually when a maintainer chooses to publish, rather than on every commit. See the Portuguese contributor guide for commands and versioning.

This startup flow supports Windows x64. [MIT license](LICENSE).
