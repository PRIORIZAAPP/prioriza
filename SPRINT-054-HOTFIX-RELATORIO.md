# PRIORIZA — Correção da Home desktop da Sprint 054

Referência visual `2d874ef5` (Sprint 053). Versão publicada comparada `c7086f72` (Sprint 054). Branch `hotfix/sprint-054-home-desktop` para revisão, sem merge ou publicação.

## Causa e correção

Na Sprint 054, a atualização imediata do badge do Checklist após mudar o status passou a rodar em todas as larguras. Em 1024 px, a Home ainda exibe os cartões de Agenda e Checklist. Após mudar “Revisar estoque” de pendente para em andamento, a versão 054 trocava o badge “Hoje” por “Em andamento”, alargando a coluna direita. A Sprint 053 mantinha o badge do carregamento inicial. A diferença foi reproduzida com os mesmos dados e a mesma ação.

A atualização imediata do badge e a leitura do item retornado pelo endpoint agora se aplicam apenas à Home de até 767 px. Nos demais casos, o manipulador mantém o comportamento anterior. O estado concluído da Agenda mobile passou a ser estilizado a partir do próprio botão de status, retirando a classe adicional que a Sprint 054 aplicava à linha em qualquer largura. A geometria, a paleta e os controles da timeline desktop continuaram com suas regras originais. CSS e scripts alterados têm URLs versionadas, com service worker no cache v62.

## Capturas comparativas

As imagens mostram, da esquerda para a direita, Sprint 053, Sprint 054 publicada e correção. Na primeira linha está a Home após abertura. Na segunda, a Home após a mesma mudança de status nas três versões. As capturas foram feitas no Chromium, com altura de 960 px, relógio fixo e respostas equivalentes de Agenda e Checklist.

| Largura | Referência × correção |
| --- | --- |
| [1024 px](docs/capturas-hotfix-054/home-1024.webp) | Idênticas pixel a pixel, na abertura e após alterar o status. A coluna central registra a mudança de badge da Sprint 054. |
| [1280 px](docs/capturas-hotfix-054/home-1280.webp) | Idênticas pixel a pixel, na abertura e após alterar o status. |
| [1440 px](docs/capturas-hotfix-054/home-1440.webp) | Idênticas pixel a pixel, na abertura e após alterar o status. |

## Validação complementar

- Home mobile em 320, 390 e 430 px com Agenda e Checklist vazios e preenchidos, títulos extensos e diferentes estados. Expansão e recolhimento de títulos verificados. A 320 px, também foram exercitados menus, mudança de status, gesto de conclusão e estilo dos concluídos.
- Testes da API com SQLite temporário passaram para rotinas diárias, semanais, mensais e únicas, datas ausentes, atraso de 100 dias, reagendamento, conclusão e encerramento. `main.py` é idêntico ao do commit publicado.
- Sintaxe JavaScript, diff e cache v62 ativo com CSS versionado conferidos.

A comparação desktop cobre o mesmo conjunto de dados e as mesmas ações. A correção de vencimentos da Sprint 054 pode legitimamente mudar quais rotinas aparecem em Hoje e em Próximas atividades, porque esses blocos usam as datas e a quantidade de itens retornados. A reprodução não usou conta ou registros de produção. Outros navegadores e aparelhos físicos ficaram fora dos testes.
