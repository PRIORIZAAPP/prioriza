# Sprint 054 — Correção emergencial da tela Hoje

O hotfix parte da Sprint 054 publicada (`c7086f72`) e usa a Sprint 053 (`2d874ef5`) como referência visual do desktop. Os ajustes mobile se concentram na Agenda do dia e no limite de duas linhas dos títulos dos cartões da Home.

## Causa e correção

- A Sprint 054 atribuiu `role="button"` aos títulos expansíveis. A regra global `[role="button"]` impunha dimensões mínimas de 42 px e deixava à mostra parte de uma terceira linha. O CSS mobile neutraliza esse mínimo apenas nos títulos dos cartões da Home e mantém a expansão por toque ou teclado.
- A quebra de linha irrestrita no local e nas observações aumentava a altura dos compromissos. A Agenda mobile passou a reservar colunas para status, horário, conteúdo e ações. Local e observações ocupam até uma linha cada na visualização compacta e aparecem por inteiro ao expandir o título. O indicador de status mantém área de toque de 44 × 44 px. Foram preservados o menu oval, as divisórias, as cores e o tratamento de concluídos.
- A atualização imediata do badge do Checklist introduzida pela Sprint 054 também era executada no desktop. A 1024 px, a diferença foi reproduzida após mudar o status de um item, mesmo com a tela inicial idêntica à referência. A atualização imediata ficou restrita à Home mobile. O estilo de conclusão da Agenda também passou a depender do indicador dentro do CSS mobile, eliminando a classe adicional no item compartilhado.
- O cache dos arquivos estáticos avançou para `prioriza-public-v62`. O backend e o cálculo de vencimentos continuam como na Sprint 054.

## Validação

As capturas iniciais vieram de três instâncias locais da aplicação com os mesmos registros persistidos em bancos SQLite separados. Os dados de teste incluíram três compromissos, um título longo com local e observações, três prioridades e os estados pendente, em andamento e concluído. O Checklist foi verificado com atividades e vazio.

| Cenário | Resultado observado |
| --- | --- |
| Mobile 320 px | Colunas alinhadas, título longo limitado a duas linhas e expansão funcionando. O compromisso mais longo passou de 185,7 para 97,3 px no cenário medido. |
| Mobile 390 e 430 px | Colunas alinhadas e sem sobreposição. O compromisso mais longo passou de 139,6 para 97,3 px e as linhas de título curto ficaram entre 50 e 51 px. |
| Checklist vazio em 390 px | Mesmo texto, apresentação e dimensões do cartão da Sprint 054, 370 × 91 px. |
| Desktop 1024 e 1440 px | Capturas iniciais da correção idênticas à Sprint 053 na comparação de pixels. |
| Desktop 1024, 1280 e 1440 px após mudar status | Capturas da correção idênticas à Sprint 053 em um cenário controlado com respostas de API simuladas. A divergência da versão publicada foi reproduzida a 1024 px. |
| Interações | Expansão e recolhimento por toque, abertura e fechamento de menus, opções da Agenda e ação **Pular apenas hoje** conferidos com a aplicação local. Um cenário controlado também verificou mudança de status nos dois cartões, gesto de conclusão e confirmação de exclusão com cancelamento. |
| Recorrências | Testes de API com SQLite temporário cobriram itens diários, semanais, mensais e únicos, atraso de 100 dias, reagendamento, conclusão e preservação dos registros. |
| Arquivos estáticos | Sintaxe JavaScript e `git diff --check` passaram. Service worker ativo no Chromium com cache `prioriza-public-v62` e arquivos versionados. |

Houve inspeção visual das cinco larguras solicitadas no Chromium. Os testes foram locais, com registros representativos criados para a validação. Produção e dispositivos físicos ficaram fora da validação. O teste de exclusão encerrou na confirmação com cancelamento.

## Capturas comparativas

A ordem das três versões é Sprint 053, Sprint 054 publicada e correção proposta.

- [Home 320 px](docs/capturas-hotfix-054-layout/home-320.webp)
- [Home 390 px](docs/capturas-hotfix-054-layout/home-390.webp)
- [Home 430 px](docs/capturas-hotfix-054-layout/home-430.webp)
- [Home 1024 px](docs/capturas-hotfix-054-layout/home-1024.webp)
- [Home 1440 px](docs/capturas-hotfix-054-layout/home-1440.webp)
- [Checklist vazio a 390 px, Sprint 054 e correção](docs/capturas-hotfix-054-layout/checklist-vazio-390.webp)
- [Desktop 1024 px após mudança de status](docs/capturas-hotfix-054-layout/desktop-1024-apos-status.webp)
