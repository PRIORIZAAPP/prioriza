# PRIORIZA · Sprint 061

## Nova rotina no mobile

Até 767 px, o formulário usa o painel centralizado e o botão X da Agenda. O título “Nova rotina” e o subtítulo “Essencial primeiro.” foram mantidos. Título, Frequência, Categoria e Área aparecem nessa ordem, sem etapa expansível. Quando a categoria é Pessoal, a Área continua desabilitada pela regra existente.

O botão Salvar usa cinza `#E2E8F0` com texto `#475569` quando o título está vazio e azul `#2563EB` com texto branco quando o formulário é válido. Durante o envio, exibe “Salvando…” e o indicador da Agenda e bloqueia novos envios. Em caso de erro, o formulário continua preenchido e o botão volta ao estado apropriado. X e Cancelar fecham o painel sem gravar.

O painel compartilha o controle de viewport e rolagem da Agenda. A viewport reduzida mantém cabeçalho e rodapé visíveis e abre rolagem somente no conteúdo. O fluxo existente de edição pelo menu continua disponível. O backend, os campos, as opções de recorrência e as operações de persistência continuam os mesmos.

## Arquivos

- `index.html` · botão X e contêiner de rolagem.
- `css/responsive.css` · estilos compartilhados do painel e apresentação vertical dos campos no mobile.
- `js/screens/checklist.js` e `js/app.js` · reaproveitamento do posicionamento móvel, validação visual e estado de gravação.
- `sw.js` · arquivos estáticos com versão `sprint-061` e cache `prioriza-public-v75`.

## Testes

- Chromium e WebKit em 320, 360, 375, 390 e 430 px, com API e SQLite locais. Foram verificados abertura e fechamento pelo X, ordem e visibilidade dos campos, centralização, ausência de rolagem horizontal, estados de Salvar, cadastro, edição e cancelamento.
- Em 390 px, uma resposta de erro simulada confirmou o estado “Salvando…”, o bloqueio de um segundo envio e a restauração do botão com os dados preenchidos. No Chromium, o cache v75 foi ativado em ambiente local.
- A viewport reduzida a 280 px simulou a perda de espaço com o teclado. A interface real do teclado e as áreas seguras do Safari em iPhone físico não foram testadas.
- A suíte de geometria da Agenda passou no Chromium nas cinco larguras após o reaproveitamento do painel.
- Desktop comparado com a main `df605f3`, com Mais opções expandido, em 1024, 1280 e 1440 px. As capturas ficaram idênticas pixel a pixel.

## Capturas

- [Mobile · inválido, válido, salvando e viewport reduzida](docs/capturas-sprint-061/mobile.webp)
- [Desktop · 1024 px](docs/capturas-sprint-061/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-sprint-061/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-sprint-061/desktop-1440.webp)
