# PRIORIZA · Hotfix 059.4

## Diagnóstico e correção

A moldura externa do Hotfix 059.3 cobria Data, Início e Término. O campo Repetir até ainda dependia da pintura do próprio controle nativo. O seletor Frequência tinha altura mínima, permitindo que o navegador calculasse uma altura maior que a da célula de data. A rotina de atualização também limpava Repetir até ao selecionar Não repetir.

O CSS mobile reaproveita a moldura externa em Repetir até e fixa a altura dos dois controles em 44 px, com colunas iguais e espaço de 8 px. O input continua sendo um seletor nativo do tipo `date`, com apresentação DD/MM/AAAA e valor ISO. No mobile, a data digitada permanece no formulário ao alternar frequências. Com Não repetir, o campo fica oculto e desabilitado e sua data fica fora da gravação. A regra desktop e o backend permanecem como na versão-base.

Os arquivos estáticos afetados usam `hotfix-059-4` e o service worker usa `prioriza-public-v72`.

## Validação

- Chromium e WebKit em 320, 360, 375, 390 e 430 px. Verificados Não repetir, Todos os dias, Toda semana e Todo mês, alinhamento, altura e largura iguais, as quatro bordas, preservação da data durante alternância e recolhimento, e ausência de transbordamento.
- O input de data aceitou o valor ISO e exibiu a data brasileira. Os testes exercitaram o controle nativo no navegador, mas a interface do seletor do iOS e o toque em iPhone físico ficam pendentes.
- Criação e edição com recorrência semanal foram testadas contra a API local e SQLite temporário. O Chromium confirmou a ativação local do cache v72.
- Em uma requisição interceptada no Chromium, Não repetir preservou o rascunho e enviou a data-limite vazia.
- Desktop comparado em 1024, 1280 e 1440 px com a main `83a41a9`. As capturas do formulário expandido com Toda semana ficaram idênticas pixel a pixel.

## Capturas

- [Mobile · Toda semana no Chromium e no WebKit](docs/capturas-sprint-059-4/recorrencia.webp)
