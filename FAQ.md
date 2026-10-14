# Perguntas frequentes — PIO Nailo Rust

## Qual arquivo abre a versão nova?

`Abrir PIO Rebosteio.bat`. O inicializador Electron foi removido. Executáveis antigos continuam sendo versões independentes.

## Preciso instalar Node.js ou Electron?

Não para o novo `.bat`. Ele usa Rust, Tauri e WebView2. Node.js/Electron ainda são usados em testes da implementação antiga.

## Por que a primeira abertura demora?

Downloads de ferramentas, bibliotecas Rust, Python/Camoufox e compilação inicial. Podem ocupar vários GB. As aberturas seguintes reaproveitam o cache; não apague `rust-migration/src-tauri/target` se quiser mantê-lo.

## Vai gerar uma build para cada CSS alterado?

Não gera um executável de distribuição. A interface vem dos arquivos locais, pelo servidor do Tauri. Reabra pelo `.bat` após editar. Alterações nativas em Rust ainda precisam de compilação incremental.

## Funciona no meu fork?

Sim: o script usa o upstream do branch atual. Ele não força o repositório original. Com alterações locais, a atualização automática é ignorada. Use seu fluxo normal de commits/branches para sincronizar contribuições.

## Baixei ZIP. Atualiza sozinho?

Não. Baixe e extraia uma nova cópia. Para atualização via Git, use um clone com branch de acompanhamento configurado.

## O winget não existe ou a instalação falhou

Veja as alternativas oficiais em [TUTORIAL.md](TUTORIAL.md). Instalar ferramentas C++ pode requerer autorização de administrador e reinicialização. Não desative antivírus para contornar um erro; leia a mensagem e confira a origem dos arquivos.

## Preciso cadastrar todas as contas outra vez?

O fluxo preserva `%APPDATA%/pionailo`. Não apague dados ao atualizar. Perfis Electron e Rust são distintos; cookies do Electron não são automaticamente transferidos. O modo servido localmente pode ter preferências de interface diferentes das versões empacotadas.

## Fechar a janela encerra o aplicativo?

Sim. Fechar encerra o aplicativo; minimizar envia para a bandeja quando a opção está habilitada.

## Qual pasta devo editar?

Interface Rust: `rust-migration/ui`. Backend: `rust-migration/src-tauri/src`. A cópia da interface na raiz pertence ao Electron antigo.

## Existem builds automáticas no GitHub?

Este fluxo não cria builds por commit. Um mantenedor pode gerar e publicar manualmente uma versão estável; veja [CONTRIBUTING.md](CONTRIBUTING.md).
