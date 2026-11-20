# Sprint 057 — Refinamento da Agenda mobile

Base de comparação `main` no commit `13aa34e`. Branch `sprint-057/agenda-mobile-refinamento`.

## Alterações

- O losango de feriado foi para o canto superior direito da célula. Os pontos de compromissos continuam na base. Quando há registros excedentes no mesmo feriado, o contador ocupa uma faixa intermediária. A altura das células permaneceu em 57 px.
- Na agenda diária, “‹ Calendário” fica à esquerda e as setas simples ficam à direita, com área de toque de 44 × 44 px nas setas. A data por extenso ocupa a segunda linha. O feriado aparece abaixo, apenas pelo nome, em vermelho sobre o fundo da tela e com quebra para títulos longos.
- O mesmo botão flutuante azul atende ao calendário e à agenda diária. O botão do cabeçalho passa a ficar oculto apenas no mobile. A data selecionada é enviada ao formulário pelo fluxo existente.
- O CSS responsivo e o script de apresentação da Agenda receberam `?v=sprint-057`. O cache avançou para `prioriza-public-v66`.

## Validação

| Cenário | Resultado |
| --- | --- |
| Chromium mobile em 320, 360, 390 e 430 px | Todos os losangos visíveis em novembro de 2026 ficaram alinhados, sem colisão com números, contador ou pontos. Os testes incluíram o dia selecionado com feriado, marcações e compromissos. |
| Cabeçalho diário e feriados | Retorno ao calendário, setas sem fundo e sem borda, data alinhada à esquerda e feriados curtos e longos conferidos. |
| Botão flutuante e ações | Visível nos dois modos, acima da navegação inferior. O formulário usou a data correta e a criação foi confirmada em SQLite local. Foram testados a transição entre meses, listas vazias e preenchidas, detalhes, alteração de status e abertura dos menus. |
| Marcos, Google e feriados | Acesso ao cadastro e à busca de Marcos conferido. Uma resposta simulada do Google confirmou o horário em Brasília e a abertura do link pelo menu. Foram verificadas datas móveis, anos bissextos e uso sem rede com a Agenda já aberta. |
| Desktop em 1024, 1280 e 1440 px | Capturas com os mesmos dados coincidiram pixel a pixel com a versão-base. |
| Arquivos estáticos | Sintaxe JavaScript e `git diff --check` passaram. O cache `prioriza-public-v66` foi ativado no Chromium. |

Os testes usaram instâncias locais, dados SQLite separados e relógio controlado. Produção, dispositivos físicos e uma conta Google real ficaram fora da validação. O backend, o banco de dados, a autenticação e as regras de recorrência ficaram fora do diff.

## Capturas comparativas

- Mobile, da esquerda para a direita, calendário base, calendário Sprint 057, dia base e dia Sprint 057 — [320 px](docs/capturas-sprint-057/mobile-320.webp), [360 px](docs/capturas-sprint-057/mobile-360.webp), [390 px](docs/capturas-sprint-057/mobile-390.webp) e [430 px](docs/capturas-sprint-057/mobile-430.webp).
- Desktop, base à esquerda e Sprint 057 à direita — [1024 px](docs/capturas-sprint-057/desktop-1024.webp), [1280 px](docs/capturas-sprint-057/desktop-1280.webp) e [1440 px](docs/capturas-sprint-057/desktop-1440.webp).
