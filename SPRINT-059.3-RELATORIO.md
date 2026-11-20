# PRIORIZA · Hotfix 059.3

## Diagnóstico

- No Hotfix 059.2, a grade já delimitava as células. A borda de Data, Início e Término ainda era pintada pelo próprio input nativo. Assim, o retângulo medido pelo CSS podia estar correto enquanto a pintura do controle interno dependia do Safari iOS. O corte exato relatado no iPhone não foi reproduzido no WebKit de Linux.
- A validação mobile desabilita Salvar se o título estiver vazio, se faltar a data ou se o intervalo for inválido. O estado cinza foi reproduzido com título vazio. Sem as capturas originais anexadas, não foi possível confirmar o estado do formulário no momento do print.
- O botão habilitado dependia de regras compartilhadas para o fundo. A cor do texto desabilitado também podia ser influenciada pelo `-webkit-text-fill-color` global.

## Correção

As células Data, Início e Término desenham as quatro bordas e o foco. Cada input nativo fica contido na própria moldura, com a decoração nativa normalizada via `appearance`. Os inputs continuam sendo os elementos interativos de tipo `date` e `time`. A data visível segue DD/MM/AAAA e o valor do input continua em ISO. Os horários mantêm a separação de 8 px e a largura igual.

Salvar fica com fundo `#2563EB` e texto branco quando habilitado. Quando desabilitado, usa fundo `#E2E8F0` e texto `#475569`. Durante o envio, a mensagem “Salvando…” é acompanhada de indicador visual, com animação condicionada à preferência de movimento. A validação e o estado ocupado existentes controlam a disponibilidade do botão.

A mudança de interface está restrita à Agenda mobile. O CSS usa o identificador `hotfix-059-3` e o service worker usa `prioriza-public-v71`.

## Testes

- Chromium e WebKit em 320, 360, 375, 390 e 430 px. Verificados os limites das molduras e inputs, as quatro bordas, a data ISO e a apresentação em DD/MM/AAAA, horários lado a lado, ausência de transbordamento, Mais opções recolhido e expandido e cores de Salvar com título vazio e preenchido.
- Criação e edição verificadas em ambiente local com SQLite temporário, inclusive término após a meia-noite e preservação de campos avançados.
- Envio interceptado em 320 px para verificar o estado ocupado, o indicador, o bloqueio de novo clique e o retorno ao estado habilitado após erro simulado.
- A regressão da API da Sprint 058 passou em SQLite temporário, incluindo bloqueios, recorrências e idempotência.
- Desktop comparado pixel a pixel em 1024, 1280 e 1440 px com a main `583e383`.
- A regressão de geometria permanece disponível em `tests/agenda_mobile_layout.py`. O Chromium confirmou a ativação local de `prioriza-public-v71`.

## Limitações

Os testes automatizados verificaram o tipo, a edição e o valor dos inputs nativos. O seletor apresentado pelo sistema, o recorte original e o toque no Safari e no PWA do iPhone precisam de validação no aparelho físico.

## Capturas

- [Mobile · Chromium e WebKit, estados de Salvar e Mais opções](docs/capturas-sprint-059-3/mobile.webp)
- [Desktop · 1024 px](docs/capturas-sprint-059-3/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-sprint-059-3/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-sprint-059-3/desktop-1440.webp)
