# Sprint 054 — Correção emergencial da tela Hoje

O hotfix parte da Sprint 054 publicada (`c7086f72`) e usa a Sprint 053 (`2d874ef5`) como referência visual do desktop. Os ajustes mobile se concentram na Agenda do dia e no limite de duas linhas dos títulos dos cartões da Home.

## Causa e correção

- A Sprint 054 atribuiu `role="button"` aos títulos expansíveis. A regra global `[role="button"]` impunha dimensões mínimas de 42 px e deixava à mostra parte de uma terceira linha. O CSS mobile neutraliza esse mínimo apenas nos títulos dos cartões da Home e mantém a expansão por toque ou teclado.
- A quebra de linha irrestrita no local e nas observações aumentava a altura dos compromissos. A Agenda mobile passou a reservar colunas para status, horário, conteúdo e ações. Local e observações ocupam até uma linha cada na visualização compacta e aparecem por inteiro ao expandir o título. O indicador de status mantém área de toque de 44 × 44 px. Foram preservados o menu oval, as divisórias, as cores e o tratamento de concluídos.
- A atualização imediata do badge do Checklist introduzida pela Sprint 054 também era executada no desktop. A 1024 px, a diferença foi reproduzida após mudar o status de um item, mesmo com a tela inicial idêntica à referência. A atualização imediata ficou restrita à Home mobile. O estilo de conclusão da Agenda também passou a depender do indicador dentro do CSS mobile, eliminando a classe adicional no item compartilhado.
- O cache dos arquivos estáticos avançou para `prioriza-public-v63`. A fórmula de vencimentos da Sprint 054 foi preservada.

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
| Arquivos estáticos | Sintaxe JavaScript e `git diff --check` passaram. Service worker ativo no Chromium com cache `prioriza-public-v63` e arquivos versionados. |

Houve inspeção visual das cinco larguras solicitadas no Chromium. Os testes foram locais, com registros representativos criados para a validação. Produção e dispositivos físicos ficaram fora da validação. O teste de exclusão encerrou na confirmação com cancelamento.

## Complemento — Virada do Checklist à meia-noite

Na versão publicada, o backend usava `datetime.now()` sem explicitar o fuso e bloqueava a exibição do Checklist antes das 05h do servidor. Reproduzi o bug executando essa versão em UTC. Às 20h59 de Brasília, a API retornou `pode_mostrar_hoje=true` para uma rotina mensal com vencimento em 19/11. Às 21h00 de Brasília, quando o servidor chegou a 00h00 UTC, passou a retornar `false` e “Disponível às 05:00”, com o mesmo vencimento gravado. A Home obedecia a esse indicador. Ela também consultava a data do dispositivo e só atualizava o relógio da interface, deixando a lista sem atualização automática na virada.

O backend agora usa `America/Sao_Paulo` para o dia operacional e elimina o bloqueio das primeiras horas. A listagem usa uma única data operacional para calcular elegibilidade e dias de atraso. O frontend usa o mesmo fuso e atualiza a Home e o Checklist na meia-noite de Brasília ou ao retornar a uma aba suspensa depois da virada. As conclusões do próprio dia podem continuar visíveis no cartão até a virada, sem que o reset de recorrências altere o status de uma conclusão daquele dia. As regras existentes de fim de semana foram mantidas.

| Horário de Brasília | Resultado na API e na Home aberta |
| --- | --- |
| 19/11, 20h59 | Dia 19. Rotinas previstas para 19 disponíveis. |
| 19/11, 21h00 | Dia 19. As mesmas rotinas continuam disponíveis. |
| 19/11, 23h59 e 23h59min59s | Dia 19. A lista permanece estável. |
| 20/11, 00h00 | Dia 20. A página atualiza automaticamente. Rotinas do dia 20 aparecem e as pendentes ou em andamento do dia 19 ficam com um dia de atraso. |
| 20/11, 00h01 | Dia 20. Exibição, estados e vencimentos continuam corretos. |

Foram testadas 12 rotinas persistidas em SQLite temporário, entre diárias, semanais e mensais. A matriz cobriu pendentes, em andamento, concluídas e previstas para o dia seguinte. Os IDs, estados, frequências, datas de criação, conclusões e vencimentos permaneceram iguais antes e depois da virada. O teste automático usou Chromium em UTC no mobile e confirmou a atualização ao retornar à aba desktop em um navegador configurado para Tóquio. A suíte de API da Sprint 054 também passou, incluindo reagendamento, encerramento de recorrência e atraso de 100 dias.

Após o complemento, repeti a comparação desktop em 1024, 1280 e 1440 px com a Sprint 053. As capturas controladas continuaram idênticas antes e depois da alteração de status. Também repeti os cenários mobile em 320, 390 e 430 px.

A alteração mantém o cálculo das datas-base de recorrência já gravadas. O fuso de Brasília passa a determinar o dia de comparação e a identificação de conclusões do próprio dia. Os testes foram isolados, sem acesso aos dados de produção ou implantação.

## Capturas comparativas

A ordem das três versões é Sprint 053, Sprint 054 publicada e correção proposta.

- [Home 320 px](docs/capturas-hotfix-054-layout/home-320.webp)
- [Home 390 px](docs/capturas-hotfix-054-layout/home-390.webp)
- [Home 430 px](docs/capturas-hotfix-054-layout/home-430.webp)
- [Home 1024 px](docs/capturas-hotfix-054-layout/home-1024.webp)
- [Home 1440 px](docs/capturas-hotfix-054-layout/home-1440.webp)
- [Checklist vazio a 390 px, Sprint 054 e correção](docs/capturas-hotfix-054-layout/checklist-vazio-390.webp)
- [Desktop 1024 px após mudança de status](docs/capturas-hotfix-054-layout/desktop-1024-apos-status.webp)
