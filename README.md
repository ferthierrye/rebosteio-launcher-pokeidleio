<div align="center">

<img src="src/ui/assets/pokeidle-logo-smooth.png" width="320" alt="PokeIdle.IO">

<p>By</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/ui/assets/rebosteio-logo.png">
  <img src="src/ui/assets/rebosteio-logo-ink.png" width="280" alt="Rebosteio">
</picture>

# PIO Rebosteio — Launcher Multi-Contas

**Quatro contas, uma equipe e muita história pra compartilhar.** 🎮

Um cantinho da comunidade para quem curte PokeIdle, boas caçadas e aquela resenha entre treinadores.

![Windows x64](https://img.shields.io/badge/Windows-x64-0078D6?style=flat-square)
![Rust](https://img.shields.io/badge/backend-Rust-D97757?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square)
![Contas](https://img.shields.io/badge/contas-4-A78BFA?style=flat-square)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-58A65C?style=flat-square)](LICENSE)

[English](README.en.md) · [Tutorial](TUTORIAL.md) · [Manual](MANUAL.md) · [FAQ](FAQ.md) · [Contribuir](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

## 👋 Chega mais, treinador!

Launcher de PokeIdle para Windows x64, com quatro contas, WebView2 e backend Rust. Esta é a versão principal do projeto. O código Electron permanece como referência e para testes de migração; seu antigo inicializador foi removido.

> 🌱 **Primeira vez por aqui?** Comece pelo [tutorial](TUTORIAL.md). O passo a passo te acompanha na preparação do launcher.

## 📊 Quanto o launcher consome?

Cinco modos lado a lado para você comparar o consumo de CPU e memória. 💜

| Modo | CPU média | CPU pico | RAM média | RAM pico |
|:---|---:|---:|---:|---:|
| 🟣 **Normal** | 38,4% | 88,6% | 3.323 MiB | 4.022 MiB |
| 🔵 **Eco** | 26,2% | 37,1% | 2.205 MiB | 2.383 MiB |
| 🩵 **Só caça** | 24,4% | 40,4% | 2.171 MiB | 2.417 MiB |
| 🟡 **Batalha** | **4,9%** | **11,2%** | 928 MiB | 1.126 MiB |
| 🟢 **Headless** | 6,1% | 14,3% | **560 MiB** | **769 MiB** |

<sub>Valores transcritos da tabela enviada pelo mantenedor. Hardware, versão do launcher, quantidade de contas, duração e método de medição não informados; os resultados não representam uma garantia de consumo no seu computador.</sub>

## 🚀 Bora abrir o launcher

1. Clone este repositório ou seu fork, ou use **Code → Download ZIP** e extraia tudo.
2. Execute **`Abrir PIO Rebosteio.bat`** na raiz.
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

## 🔄 Manter a equipe em dia

Em clones Git sem alterações locais, o `.bat` tenta `git pull --ff-only` no acompanhamento do branch atual. Forks seguem o próprio upstream configurado; não são redirecionados ao repositório original. Em caso de falta de internet, divergência ou alterações locais, o código existente continua disponível. ZIPs devem ser atualizados baixando e extraindo uma nova cópia.

A interface principal está em `rust-migration/ui/`. Ela é servida localmente pelo Tauri, sem criar um executável de distribuição para cada mudança. Reabra pelo `.bat` para carregar alterações; mudanças em Rust requerem compilação incremental. O `.bat` usa `--no-watch` para evitar reiniciar automaticamente contas durante uma edição.

Executáveis de versões anteriores não são atualizados pelo `.bat`. Atalhos que apontam para eles também continuam abrindo a versão antiga: crie um atalho para o novo `.bat`.

## 🧭 Por dentro do projeto

- `rust-migration/src-tauri/`: backend Rust, configuração e permissões Tauri.
- `rust-migration/ui/`: HTML, CSS, JavaScript, imagens e ponte Tauri.
- `rust-migration/tools/turnstile_solver.py`: helper de login.
- `tools/start-rust.ps1`: preparação e execução; `tools/update-source.ps1`: atualização conservadora pelo Git.
- `test/`: verificações, incluindo contratos de migração.
- `index.html`, `main.js`, `preload.js` e `src/`: implementação Electron anterior.

## 🔐 Seu cantinho no computador

O Rust usa `%APPDATA%/pionailo` para dados persistentes, incluindo credenciais protegidas por DPAPI no Windows. Não apague essa pasta ao atualizar. Perfis do Electron e do Rust são distintos; não há promessa de migração automática dos cookies entre engines. A execução de desenvolvimento usa uma origem local diferente do executável empacotado, podendo ter preferências de interface próprias.

Credenciais precisam ser enviadas aos serviços envolvidos no login; criptografia local não significa ausência de tráfego de autenticação. Não envie perfis, tokens, cookies ou arquivos de contas em commits/issues.

## 📦 Publicação

Não há build automática a cada commit. Pacotes de distribuição são gerados manualmente quando o mantenedor decidir publicar uma versão. Veja [CONTRIBUTING.md](CONTRIBUTING.md). O fluxo principal para usuários que fazem forks é o código-fonte.

Windows x64 é o alvo deste inicializador. Outros sistemas não estão cobertos por este fluxo.

Licença: [MIT](LICENSE).

---

## 💬 A comunidade também faz parte

Achou um problema, teve uma ideia ou quer ajudar quem está chegando? Tem espaço pra isso aqui.

- **Encontrou um bug?** Abra uma issue contando o que aconteceu e como reproduzir. Lembre de remover dados pessoais dos prints e logs.
- **Tem uma ideia?** Conte o que ela facilitaria nas suas caçadas.
- **Quer colocar a mão no código?** O [guia de contribuição](CONTRIBUTING.md) mostra por onde começar.
- **Ficou com dúvida?** Dê uma olhada no [FAQ](FAQ.md), no [manual](MANUAL.md) e no [tutorial](TUTORIAL.md).

Vale perguntar, ensinar e discordar com respeito. Cada contribuição ajuda o próximo treinador. 💜

<div align="center">

**Boa caçada — e que venha aquele shiny!** ✨

<sub>PokeIdle.IO · By Rebosteio · Comunidade PokeIdle</sub>

</div>
