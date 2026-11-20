# PRIORIZA · Hotfix 059.1

## Diagnóstico

- A regra mobile da Sprint 059 substituía o alinhamento central do painel compartilhado por `align-items: flex-end` e removia a margem inferior. O painel continuava dentro da tela Agenda e do shell animado. A animação do shell usa transformação e pode criar temporariamente outro referencial para elementos fixos.
- O bloqueio global usava `overflow: hidden` e `touch-action: none` no corpo. Ele não capturava nem restaurava a posição do documento e aplicava uma restrição de gestos acima do conteúdo que precisava rolar. O auxiliar geral de foco também podia tentar rolar todos os ancestrais de um campo.
- O painel, o formulário e o conteúdo dependiam de uma cadeia de contêineres flexíveis com limites diferentes. As grades já usavam colunas proporcionais, mas os wrappers e os controles nativos precisavam de limites próprios para não impor largura intrínseca, especialmente em telas estreitas.
- A consulta pública ao service worker mostrou que a produção já servia exatamente o arquivo da main com `prioriza-public-v68`. Isso não determina o que estava no cache do iPhone em que o problema foi observado. O hotfix trata diretamente os problemas de layout e rolagem encontrados.

## Correção

O formulário móvel é movido temporariamente para o corpo do documento, centralizado na viewport visual e limitado pela área disponível. O fundo fica fixo e inativo enquanto o modal está aberto, com restauração da posição original no fechamento. Apenas o conteúdo central rola. Cabeçalho e rodapé permanecem separados da rolagem, com margens que consideram as áreas seguras informadas pelo navegador. O foco rola somente o conteúdo quando um campo sai da área visível.

Os campos ocupam a largura que a grade disponibiliza. Início e Término mantêm colunas iguais e controles nativos. Mais opções continua no mesmo painel e conserva os grupos e campos da Sprint 059. A mudança é limitada ao formulário da Agenda até 767 px. Os ativos alterados usam `hotfix-059-1` e o service worker usa `prioriza-public-v69`.

## Verificações

- Chromium em 320, 360, 375, 390 e 430 px, com API local e SQLite temporário. Passaram a centralização, os limites horizontais, a expansão e rolagem até Integração, o acesso aos botões com viewport reduzida, o cadastro, a edição de recorrência e o cancelamento sem gravação. Os campos de data e hora mantiveram seus tipos e valores nativos.
- WebKit em Linux (Playwright WPE) passou nas mesmas cinco larguras para centralização, dimensões, rolagem interna, viewport reduzida, cadastro e edição com escolha de escopo. A rolagem por gesto touch foi verificada no Chromium.
- Em 390 px, um arraste touch emulado no Chromium confirmou que o fundo permanece imóvel e o conteúdo interno rola. O fechamento restaurou a posição de 160 px do documento.
- O aviso de conflito da Sprint 058 passou nas cinco larguras em Chromium e WebKit. Cancelar preservou os dados e confirmar gravou uma vez.
- A suíte de regressão da API da Sprint 058 em SQLite temporário passou para bloqueios, intervalos, edição, isolamento de contas, recorrência e idempotência.
- Desktop comparado com a main `32b66ab` usando os mesmos dados, em 1024, 1280 e 1440 px. As capturas do formulário foram idênticas pixel a pixel.
- Node.js validou a sintaxe dos scripts alterados. O Chromium confirmou a ativação do cache v69 no ambiente local.

## Validação física pendente

O iPhone físico e o PWA instalado não estavam disponíveis. A viewport reduzida simula a perda de altura provocada pelo teclado, sem reproduzir o teclado virtual, as áreas seguras físicas ou as interfaces dos seletores nativos do Safari. A aprovação definitiva fica condicionada ao reteste no iPhone após a publicação.

## Capturas

- [Mobile · recolhido e expandido](docs/capturas-sprint-059-1/mobile.webp)
- [Desktop · base e hotfix em 1024 px](docs/capturas-sprint-059-1/desktop-1024.webp)
- [Desktop · base e hotfix em 1280 px](docs/capturas-sprint-059-1/desktop-1280.webp)
- [Desktop · base e hotfix em 1440 px](docs/capturas-sprint-059-1/desktop-1440.webp)
