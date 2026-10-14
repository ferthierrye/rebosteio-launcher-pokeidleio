# Contribuir e publicar

## Forks

Crie um fork e clone-o. O `.bat` respeita o acompanhamento do branch atual; não aponta automaticamente para o repositório original. Configure um remote adicional se quiser trazer alterações do projeto original e faça essa integração pelo seu fluxo de revisão.

A atualização automática é ignorada quando há alterações locais. Não há reset, stash ou merge automático. Para editar durante o uso, use o script de execução diretamente, que não faz pull:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/start-rust.ps1
```

## Fonte principal

- `rust-migration/ui`: interface usada pelo Rust. Não confunda com `index.html`/`src` da raiz, que pertencem ao Electron anterior.
- `rust-migration/src-tauri/src`: backend, WebViews, IPC e serviços.
- `rust-migration/src-tauri/capabilities` e `permissions`: fronteiras de acesso Tauri.
- `rust-migration/tools/turnstile_solver.py`: helper do login.

O inicializador usa o servidor estático embutido no Tauri CLI, sem Node.js. O modo `--no-watch` evita reinícios automáticos; reabra para aplicar mudanças. Código Rust usa o cache Cargo. Não apague `target` a cada edição.

Para trabalhar com recompilação e reinício automáticos, depois da preparação, execute dentro de `rust-migration`:

```powershell
cargo tauri dev -- --locked
```

Esse comando direto não prepara o ambiente Python do `.bat`. Se precisar do login helper, adicione `.runtime/python/Scripts` ao PATH ou configure `PIO_NAILO_PYTHON` com o caminho absoluto do Python desse ambiente.

## Verificação

```powershell
cargo test --locked --manifest-path rust-migration/src-tauri/Cargo.toml --lib
node --test test/rust-migration-contract.test.cjs test/rust-hud-economy.test.cjs
```

Node.js é necessário somente para essas verificações JavaScript. Testes Electron da implementação anterior exigem `npm ci`. Testes de contratos não comprovam login/farm real; registre separadamente o que foi observado em contas reais.

## Versões

Ao alterar o projeto, incremente e mantenha sincronizados `package.json`, as duas versões raiz de `package-lock.json`, `rust-migration/src-tauri/Cargo.toml`, a entrada do aplicativo em `Cargo.lock`, `tauri.conf.json` e `appVersion` em `ui/tauri-bridge.js`. Registre as mudanças no topo do `CHANGELOG.md`. A versão do pacote raiz também alimenta o aviso remoto da interface.

## Build de distribuição: somente quando decidir publicar

Não gere outro executável para cada ajuste. Quando houver uma versão pronta para distribuir, prepare o ambiente e execute:

```powershell
cd rust-migration
cargo tauri build --no-bundle -- --locked
```

O executável sai em `src-tauri/target/release/pio-nailo-rust.exe`. Um EXE isolado não prepara o helper Python. Para um pacote portátil com login, inclua o helper em `tools/turnstile_solver.py`, mantenha a execução com diretório de trabalho correto e forneça preparação Python/Camoufox, ou distribua o fluxo fonte completo. Não apresente um EXE isolado como equivalente ao `.bat`.

Teste o pacote em Windows limpo, registre requisitos, publique checksum SHA-256 e notas da versão em uma GitHub Release quando optar por distribuir. Não há workflow que gere releases por commit.

Não versione `.runtime`, `target`, executáveis, perfis, credenciais ou diagnósticos com contas reais. Preserve os dados de usuários; publicação de fonte não exige apagá-los.
