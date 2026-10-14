# Abrir o PIO Nailo Rust no Windows

## 1. Baixe o código

Para contribuir, prefira criar um fork no GitHub e clonar o **seu fork** com Git. Para apenas experimentar, use **Code → Download ZIP** e **Extrair Tudo**. Não execute o `.bat` de dentro do ZIP.

Escolha uma pasta em que seu usuário possa gravar arquivos. Mantenha a estrutura inteira, incluindo `tools` e `rust-migration`.

## 2. Abra o inicializador novo

Execute **`Abrir PIO Rebosteio.bat`**. O antigo `Abrir Poke Idle IO.bat` do Electron foi removido.

O script prepara Rust/Cargo, ferramentas C++ e SDK do Windows, WebView2, Tauri CLI e Python/Camoufox. Ele reaproveita ferramentas instaladas, cria um ambiente Python isolado e baixa as bibliotecas Rust conforme o lockfile. Não instala Electron nem exige Node.js.

A primeira compilação pode demorar e usar vários GB; não há prazo fixo. A execução fica em segundo plano e o andamento é registrado em `.runtime/launcher.log`. Se um instalador pedir reinicialização, reinicie e execute o `.bat` novamente. Uma falha de inicialização exibe um aviso.

## 3. Se a instalação automática falhar

Instale os componentes oficiais necessários e execute o `.bat` outra vez:

- **winget**: instale/atualize [App Installer](https://apps.microsoft.com/detail/9nblggh4nns1) na Microsoft Store.
- **C++**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/), selecionando **Desktop development with C++**, ferramentas MSVC x64/x86 e Windows SDK.
- **Rust**: [rustup](https://rustup.rs/), com a toolchain stable MSVC para Windows x64.
- **WebView2**: [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
- **Python**: [Python para Windows](https://www.python.org/downloads/windows/). O script tenta instalações existentes e usa Python 3.11 na instalação automática.

Os requisitos nativos seguem a [documentação do Tauri](https://v2.tauri.app/start/prerequisites/).

Para consultar a detecção sem instalar nada:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/start-rust.ps1 -CheckOnly
```

## 4. Use suas contas

Abra Treinadores/Configurações, confira as quatro contas e use **Logar equipe**. A execução pelo código usa os dados Rust em `%APPDATA%/pionailo`. Preserve essa pasta. Preferências da interface podem diferir entre o modo local e executáveis antigos; não limpe perfis para resolver uma atualização.

## 5. Atualize

Com Git: feche o app e abra o `.bat` novamente. Ele atualiza somente se o clone estiver limpo e o acompanhamento do branch permitir avanço direto. Alterações locais, branches sem upstream e divergências precisam ser resolvidos por quem mantém o fork. O script não faz reset, stash ou merge automático.

Com ZIP: baixe novamente, extraia em uma pasta nova e execute o novo `.bat`. Os dados persistentes Rust ficam fora da pasta do projeto.

## 6. Crie um atalho

Crie um atalho para **`Abrir PIO Rebosteio.bat`**. Atalhos antigos para `.exe` não passam pelo fluxo de atualização do código.

## 7. Edite sem publicar builds

Edite `rust-migration/ui/` para a interface. Reabra pelo `.bat` para carregar os arquivos locais. Para mudanças em `rust-migration/src-tauri/src/`, reabra e aguarde a compilação incremental. Ela usa o cache de `target`; não cria arquivos `PIO-Nailo-v2.x-Rust.exe` a cada edição.

O `.bat` executa em segundo plano, sem manter terminal aberto. O log fica em `.runtime/launcher.log`; falhas exibem um aviso. Fechar encerra o aplicativo; minimizar envia para a bandeja quando a opção está habilitada.
