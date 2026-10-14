# Manual — PIO Nailo Rust

Para instalar e atualizar, siga o [tutorial](TUTORIAL.md). O aplicativo principal usa Rust/Tauri e quatro contas.

## Contas e janelas

Em **Treinadores**, confira nomes, credenciais e configuração das contas. **Logar equipe** solicita login para a equipe. Cada conta tem seu próprio perfil WebView2. Não limpe dados de uma conta para atualizar o projeto.

Use **Janelas**, **Lista** e **Simples** conforme o acompanhamento desejado. Os controles de cada conta permitem ajustar o zoom, expandir e recarregar sua página. Recarregar o jogo é diferente de atualizar o código do launcher.

## Batalha e Headless

**Batalha** abre o painel com animação e informações da conta. **Pausar animação** controla a animação desse painel. **Headless** alterna para o modo de conexão sem a página de jogo visível. O estado da conta e as confirmações do servidor devem ser observados no painel; uma solicitação de início não comprova que a conta já entrou no jogo.

## Ferramentas e acompanhamento

Use **Painel** para consultar as informações e atividades observadas. Em **Ferramentas**, configure as funções disponíveis na versão atual, como destinos de caça e reposição. Confira conta, destino e opções antes de executar ações que gastem recursos do jogo.

## Kick e Twitch

As integrações são configuradas por conta. Na Kick, conexão e consultas de saldo não geram pontos por estimativa e não abrem player. O resgate automático é opcional e usa os pontos da conta vinculada. Respostas sem confirmação pausam o automático; confira o histórico antes de tentar novamente. Recompensas sem saldo suficiente ou indisponíveis não são elegíveis.

## Bandeja e encerramento

Fechar a janela encerra o aplicativo. Minimizar envia para a bandeja quando a opção está habilitada; clique no ícone da bandeja para restaurar.

## Dados e versões

Dados Rust: `%APPDATA%/pionailo`. Preserve essa pasta; não compartilhe seus arquivos de contas, cookies ou tokens. O novo `.bat` executa o código da pasta atual. Executáveis antigos e seus atalhos continuam apontando para versões antigas.

Para personalizar, editar e publicar contribuições, veja [CONTRIBUTING.md](CONTRIBUTING.md).
