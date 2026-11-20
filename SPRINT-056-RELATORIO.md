# Sprint 056 — Agenda mobile e feriados oficiais

Base de comparação `main` em `d74f6b4`. A branch de entrega é `sprint-056/agenda-mobile`.

## Agenda mobile

- A aba Agenda abre no calendário mensal até 767 px. As células medem 57 px de altura, uma redução de aproximadamente 14% sobre os 66 px da base. Os indicadores de compromissos, a data atual e a data selecionada foram preservados.
- A seleção abre a agenda diária na mesma aba. Os controles permitem retornar ao mês e navegar dia a dia. A escolha permanece durante a sessão e o mês acompanha o dia selecionado nas transições entre meses.
- Eventos de dia inteiro vêm antes dos compromissos com horário. Cada item mostra título, linha secundária, indicador circular e menu oval. A área central abre o mesmo painel de detalhes usado na Sprint 055. O status, a edição, a exclusão, a recorrência e a abertura no Google usam os fluxos existentes. A lista longa rola dentro da visualização diária, com os controles e a navegação inferior acessíveis.
- O formulário de compromisso usa a data selecionada. O calendário mantém o botão flutuante e a agenda diária usa o botão junto à data. Os controles de Marcos ficam na mesma barra discreta acima das duas visualizações, com a busca expansível. Os marcos da data selecionada mantêm suas ações.
- O dia operacional e os horários do Google com fuso explícito são apresentados em `America/Sao_Paulo` na Agenda mobile. Eventos de dia inteiro preservam sua data civil.

## Feriados oficiais

O losango vermelho identifica o feriado no calendário e fica separado dos indicadores de compromissos e Marcos. O nome do feriado aparece em um aviso discreto acima da lista diária. A lógica é local, não cria compromissos e permite agendamentos normalmente. Um compromisso manual “Feriado” continua sendo um registro independente.

As datas seguem o calendário federal de referência. A Paixão de Cristo é calculada dois dias antes da Páscoa gregoriana e segue a classificação da portaria federal. A Lei nº 9.093/1995 também trata a Sexta-Feira da Paixão entre os feriados religiosos declarados por lei municipal. O Carnaval e o Corpus Christi ficam fora da lista nacional automática por constarem como pontos facultativos no calendário federal. O feriado de 20 de novembro começa em 2024, primeiro 20 de novembro após a Lei nº 14.759/2023. [Calendário federal 2026](https://agenciagov.ebc.com.br/noticias/202512/confira-o-calendario-oficial-de-feriados-nacionais-e-pontos-facultativos-em-2026) · [Lei nº 662/1949 atualizada](https://www2.camara.leg.br/legin/fed/lei/1940-1949/lei-662-6-abril-1949-347136-normaatualizada-pl.html) · [Lei nº 6.802/1980](https://www2.camara.leg.br/legin/fed/lei/1980-1987/lei-6802-30-junho-1980-357065-publicacaooriginal-1-pl.html) · [Lei nº 9.093/1995](https://www.planalto.gov.br/ccivil_03/leis/l9093.htm?origin=instituicao) · [Lei nº 14.759/2023](https://www2.camara.leg.br/legin/fed/lei/2023/lei-14759-21-dezembro-2023-795091-publicacaooriginal-170522-pl.html)

O código aceita dados regionais por UF e, para feriados municipais, código IBGE. A configuração e o catálogo regional não existem nesta sprint, portanto aparecem apenas as datas nacionais. A regra calcula o calendário vigente para anos passados e futuros e não pretende reproduzir todas as mudanças legislativas históricas.

## Validação

| Cenário | Resultado |
| --- | --- |
| Mobile 320, 360, 390 e 430 px | Testados abertura mensal, seleção, retorno, navegação diária e mensal, transição de mês, preservação da sessão, dias vazios, três compromissos em feriado e outra data com 12 itens. Inspeção visual e verificações geométricas confirmaram alinhamento e ausência de sobreposição no cenário. |
| Ações mobile | Testados detalhes com título e local completos, alteração de status, menu com Edição e Exclusão, formulário de criação com data selecionada, criação efetiva em SQLite local, registro de Marcos, busca e abertura do dia e da edição de um Marco encontrado. |
| Google Agenda | Integração simulada confirmou o evento de 01h30 UTC às 22h30 de Brasília no dia anterior e abriu o link pelo menu. |
| Feriados | Verificadas datas móveis de 2024 a 2028, anos bissextos, a vigência de 20 de novembro, a ausência de Carnaval e Corpus Christi e o filtro por UF e município. O marcador coexistiu com os indicadores no dia 20/11/2026, também usado para um compromisso manual “Feriado”. |
| Offline | Com o app aberto em Chromium, os feriados continuaram disponíveis ao alternar as visualizações sem rede. O service worker ativou `prioriza-public-v65`. |
| Desktop 1024, 1280 e 1440 px | As capturas da Agenda com os mesmos registros coincidiram pixel a pixel com a versão-base. |
| Sintaxe e escopo | `node --check` nos scripts modificados e `git diff --check` passaram. Backend, banco, autenticação e regras de recorrência ficaram fora da alteração. |

Os testes usaram dados locais, relógio controlado e Chromium. Produção, dispositivos físicos e uma conta Google real não fizeram parte da validação.

## Capturas

- Mobile, mês à esquerda e dia à direita — [320 px](docs/capturas-sprint-056/mobile-320.webp), [360 px](docs/capturas-sprint-056/mobile-360.webp), [390 px](docs/capturas-sprint-056/mobile-390.webp) e [430 px](docs/capturas-sprint-056/mobile-430.webp).
- Desktop, base à esquerda e Sprint 056 à direita — [1024 px](docs/capturas-sprint-056/desktop-1024.webp), [1280 px](docs/capturas-sprint-056/desktop-1280.webp) e [1440 px](docs/capturas-sprint-056/desktop-1440.webp).
