# PRIORIZA · Hotfix 059.2

## Diagnóstico

- O painel limitava a altura pela viewport visual, mas definia a largura com o posicionamento lateral da viewport de layout. Assim, com 390 px na viewport de layout e 320 px na área visual com deslocamento de 24 px, o lado direito do painel de 374 px excedia a área visível. Essa diferença foi reproduzida com medidas controladas na automação.
- Em 320 px, o descendente `.agenda-repetir-ate .agenda-data-formatada` tinha apenas 63 px para um texto de 97 px no Chromium. O transbordamento local também apareceu no WebKit. Medir somente a rolagem do painel não detectava esse problema.
- Na viewport padrão da automação, Início e Término não ultrapassaram a grade da versão-base. O corte específico dos campos relatado no iPhone não foi reproduzido no aparelho. A nova estrutura desacopla a largura dos controles nativos da largura intrínseca que o navegador pode atribuir a esses elementos.

## Correção

A largura e o deslocamento lateral agora acompanham a viewport visual, junto com a altura e o deslocamento vertical. Os controles nativos de data e hora ocupam células de largura definida pela grade, com colunas iguais e alvos de toque de 44 px. O texto de Repetir até ganhou espaço dentro da célula.

A compactação removeu margens e espaçamentos acumulados no cabeçalho, nos campos, nos interruptores e nos grupos de Mais opções, mantendo as orientações existentes. Num cenário com repetição em 320 × 760 px no Chromium, a distância de rolagem interna caiu de 223 para 113 px. O formulário recolhido ficou sem rolagem vertical nessa viewport. Cabeçalho, rodapé, bloqueio do fundo e restauração da posição continuam funcionando como no Hotfix 059.1.

Os arquivos estáticos afetados usam `hotfix-059-2`. O service worker foi atualizado para `prioriza-public-v70`.

## Verificações

- Chromium e WebKit em Linux, com API local e SQLite temporário, em 320, 360, 375, 390 e 430 px. Foram verificados limites horizontais de contêineres e campos, larguras iguais dos horários, centralização, expansão, rolagem até Integração, criação e edição, incluindo duração através da meia-noite.
- Em 390 px, a automação verificou o painel com uma viewport visual simulada mais estreita e deslocada. Um arraste emulado no Chromium confirmou que o conteúdo rola verticalmente, que o gesto horizontal não o desloca e que o fundo fica imóvel. Ao fechar, a rolagem voltou a 160 px.
- O aviso da Sprint 058 passou no Chromium e no WebKit nas cinco larguras. Cancelar preservou os registros e confirmar gravou uma vez. O Chromium também confirmou a ativação local do cache v70.
- O desktop foi comparado com a main `c229666` em 1024, 1280 e 1440 px. As capturas ficaram idênticas pixel a pixel.

A verificação de geometria está em `tests/agenda_mobile_layout.py`. Requer Playwright, os navegadores e uma conta de teste em instância isolada. Informe `PRIORIZA_TEST_EMAIL` e `PRIORIZA_TEST_PASSWORD` e execute `python tests/agenda_mobile_layout.py --engine chromium --url http://127.0.0.1:8164` ou use `--engine webkit`.

## Validação pendente

Este teste usou o relato dos sintomas. Os prints físicos do Hotfix 059.1 não estavam anexados. Safari e PWA no iPhone, os seletores nativos do aparelho e o gesto físico ainda precisam ser validados.

## Capturas

- [Mobile · recolhido e expandido](docs/capturas-sprint-059-2/mobile.webp)
- [Desktop · 1024 px](docs/capturas-sprint-059-2/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-sprint-059-2/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-sprint-059-2/desktop-1440.webp)
