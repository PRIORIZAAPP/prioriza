# Sprint 055 — Home mobile compacta

A sprint parte da `main` no commit `34f1fb7`. Até 767 px os dois cartões usam a mesma disposição, com círculo de status, área central de duas linhas e menu oval. Os títulos ocupam uma linha e usam reticências quando necessário. A segunda linha usa o mesmo alinhamento do título.

- **Agenda do dia.** A segunda linha mostra o horário de início ou “Dia inteiro”, uma vez. O toque no centro abre o modal já usado pelo aplicativo, preenchido com o título completo e as informações do compromisso, como intervalo, prioridade, bloqueio, local e observações. A base não tinha um painel de consulta dedicado à Agenda na Home. Eventos do Google com link mantêm a opção de abri-lo pelo menu no mobile.
- **Checklist de hoje.** Os badges laterais foram retirados da apresentação mobile. A segunda linha mostra a frequência ou “Atrasado” em vermelho, seguida da categoria. O toque abre o painel existente, com a frequência original, o título completo e, quando fornecidos pela API, a data de vencimento e o tempo de atraso. Timestamps exibidos nesses detalhes usam o horário de Brasília.
- **Entrega.** O CSS e os scripts alterados usam `?v=sprint-055`. O service worker passou para `prioriza-public-v64`. O backend, o banco e as regras de recorrência e vencimento não receberam alterações.

## Validação

As capturas foram obtidas em Chromium com os mesmos registros representativos, persistidos em dois bancos SQLite locais. A Agenda incluiu “Feriado” de dia inteiro, compromissos com horário, prioridade, título longo, local e observações. O Checklist incluiu rotina em dia, rotina atrasada e os estados pendente, em andamento e concluído.

| Cenário | Resultado |
| --- | --- |
| 320, 360, 390 e 430 px | Inspeção visual e verificação geométrica passaram. Os títulos e as linhas secundárias ficaram alinhados entre o círculo e o menu, sem sobreposição. As seis linhas medidas ficaram entre 50 e 51 px. |
| Detalhes no mobile | Toque abriu os dois painéis. Foi conferido o título completo, “Dia inteiro” e os demais campos do feriado, horário, local e prioridade na Agenda, e frequência, vencimento e duração do atraso no Checklist. Também foi testada a abertura por teclado. |
| Status e menus | O círculo chamou a API local e alterou o status sem abrir o painel. Os menus abriram pelos três pontinhos e fecharam com Escape. Em 390 px, deslizar no centro da rotina concluiu o item sem abrir os detalhes. |
| 1024, 1280 e 1440 px | As capturas da Home coincidiram pixel a pixel com a `main` nos cenários comparados. |
| Arquivos estáticos | Sintaxe JavaScript e `git diff --check` passaram. O cache `prioriza-public-v64` foi ativado pelo service worker em Chromium. |

Os testes usaram emulação de viewport e dados locais. Esta rodada não incluiu dispositivos físicos, uma conta Google conectada ou ambiente de produção.

## Capturas comparativas

Cada imagem mostra a `main` à esquerda e a Sprint 055 à direita.

- Mobile — [320 px](docs/capturas-sprint-055/home-320.webp), [360 px](docs/capturas-sprint-055/home-360.webp), [390 px](docs/capturas-sprint-055/home-390.webp), [430 px](docs/capturas-sprint-055/home-430.webp)
- Desktop — [1024 px](docs/capturas-sprint-055/home-1024.webp), [1280 px](docs/capturas-sprint-055/home-1280.webp), [1440 px](docs/capturas-sprint-055/home-1440.webp)
