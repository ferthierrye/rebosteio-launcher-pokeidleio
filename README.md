# PIO Nailo — Rust / Tauri

Launcher de PokeIdle para Windows x64, com quatro contas, WebView2 e backend Rust. Esta é a versão principal do projeto. O código Electron permanece como referência e para testes de migração; seu antigo inicializador foi removido.

[English](README.en.md) · [Tutorial](TUTORIAL.md) · [Manual](MANUAL.md) · [FAQ](FAQ.md) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

## Abrir pelo código-fonte

1. Clone este repositório ou seu fork, ou use **Code → Download ZIP** e extraia tudo.
2. Execute **`Abrir PIO Nailo Rust.bat`** na raiz.
3. Aguarde a preparação inicial. Downloads e compilação podem levar bastante tempo e ocupar vários GB. Instaladores Microsoft podem pedir autorização de administrador ou reinicialização.

O inicializador verifica e prepara:

| Dependência | Uso |
|---|---|
| Rust stable / Cargo, via rustup | Compilação incremental do backend |
| Microsoft C++ Build Tools, carga VCTools e componentes recomendados | Compilador/linker e SDK do Windows |
| Microsoft Edge WebView2 Runtime | Interface e páginas das contas |
| Tauri CLI 2.12.1 | Execução da aplicação e servidor local da interface |
| Python e ambiente virtual em `.runtime/python` | Ponte de login |
| Camoufox 0.5.4 e seu navegador | Dependência do login pelo helper Python |
| Crates de `Cargo.lock` | Bibliotecas Rust baixadas pelo Cargo |

Node.js, npm e Electron não são necessários para o novo `.bat`. A instalação automática de componentes do Windows usa **winget**; alternativas manuais estão no [tutorial](TUTORIAL.md).

## Atualizar e modificar

Em clones Git sem alterações locais, o `.bat` tenta `git pull --ff-only` no acompanhamento do branch atual. Forks seguem o próprio upstream configurado; não são redirecionados ao repositório original. Em caso de falta de internet, divergência ou alterações locais, o código existente continua disponível. ZIPs devem ser atualizados baixando e extraindo uma nova cópia.

A interface principal está em `rust-migration/ui/`. Ela é servida localmente pelo Tauri, sem criar um executável de distribuição para cada mudança. Reabra pelo `.bat` para carregar alterações; mudanças em Rust requerem compilação incremental. O `.bat` usa `--no-watch` para evitar reiniciar automaticamente contas durante uma edição.

Executáveis de versões anteriores não são atualizados pelo `.bat`. Atalhos que apontam para eles também continuam abrindo a versão antiga: crie um atalho para o novo `.bat`.

## Estrutura

- `rust-migration/src-tauri/`: backend Rust, configuração e permissões Tauri.
- `rust-migration/ui/`: HTML, CSS, JavaScript, imagens e ponte Tauri.
- `rust-migration/tools/turnstile_solver.py`: helper de login.
- `tools/start-rust.ps1`: preparação e execução; `tools/update-source.ps1`: atualização conservadora pelo Git.
- `test/`: verificações, incluindo contratos de migração.
- `index.html`, `main.js`, `preload.js` e `src/`: implementação Electron anterior.

## Dados locais

O Rust usa `%APPDATA%/pionailo` para dados persistentes, incluindo credenciais protegidas por DPAPI no Windows. Não apague essa pasta ao atualizar. Perfis do Electron e do Rust são distintos; não há promessa de migração automática dos cookies entre engines. A execução de desenvolvimento usa uma origem local diferente do executável empacotado, podendo ter preferências de interface próprias.

Credenciais precisam ser enviadas aos serviços envolvidos no login; criptografia local não significa ausência de tráfego de autenticação. Não envie perfis, tokens, cookies ou arquivos de contas em commits/issues.

## Publicação

Não há build automática a cada commit. Pacotes de distribuição são gerados manualmente quando o mantenedor decidir publicar uma versão. Veja [CONTRIBUTING.md](CONTRIBUTING.md). O fluxo principal para usuários que fazem forks é o código-fonte.

Windows x64 é o alvo deste inicializador. Outros sistemas não estão cobertos por este fluxo.

Licença: [MIT](LICENSE).
