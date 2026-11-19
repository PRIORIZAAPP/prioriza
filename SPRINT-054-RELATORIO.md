# PRIORIZA — Sprint 054

Branch `sprint-054/home-mobile-ajustes`, baseada na `main` após a Sprint 053 (`2d874ef`). Aguardando revisão para merge e publicação.

## Home mobile

- Agenda e Checklist compartilham círculos de 22 px com alvos de toque de 44 px, menu oval e linhas compactas com divisórias. A Agenda mantém horário, prioridade, ações e cores de status.
- Títulos na Home mobile usam até duas linhas com reticências. Toque ou Enter/Espaço expande e recolhe o texto longo. O título completo continua disponível e os formulários e registros conservam o conteúdo original.
- O estilo base do painel contextual existia apenas a partir de 1100 px. Como o menu é anexado ao corpo da página, os seletores dos cartões também não alcançavam o painel no mobile. A Home mobile agora aplica estilo próprio ao painel, mede a área visível e a barra inferior, abre para cima quando preciso, e ajusta a posição durante a rolagem. Fechamento por toque externo, Escape, seleção ou abertura de outro menu.
- As ações usam os mesmos fluxos e confirmações. “Pular apenas hoje” já registrava a escolha localmente, mas o filtro da Home mobile não a consultava. O cartão agora respeita essa escolha.
- Concluídos mantêm círculo verde e título riscado. A Agenda mantém o horário e esconde a prioridade antiga. O Checklist mantém os metadados e oculta o badge de vencimento para o item concluído.
- O CSS e os scripts atualizados têm URLs versionadas. O service worker usa `prioriza-public-v61`.

## Causa do atraso recorrente

O Checklist guarda um registro por rotina. Na criação, o primeiro vencimento era calculado como o dia corrente sempre que faltava `ultimo_exec`. Depois de uma execução, quando o intervalo já tinha vencido, o cálculo substituía a data registrada por “hoje menos o intervalo”. Ao somar o intervalo de novo, a API retornava Hoje. Na reabertura, o valor ajustado podia inclusive ser gravado. A mesma API abastece a Home e a tela completa. Também foi corrigida a interpretação de “Única”, que caía no padrão semanal.

O cálculo agora usa a data de criação para a primeira execução quando disponível e a data registrada mais o intervalo existente para as demais. O reagendamento legado grava a data escolhida menos o intervalo. A operação inversa preserva o vencimento escolhido, inclusive se for futuro. O intervalo mensal continua com a semântica existente de 30 dias. A duração resumida do atraso usa meses completos de calendário a partir da data de vencimento. A Home usa vermelho para vencidos, inclusive em andamento, e “Hoje” para a data corrente.

Nenhuma migração ou regravação retroativa de datas foi introduzida. A sincronização de frequência que já existia passa a reconhecer também o rótulo feminino “Única”. O sistema conserva as datas ainda disponíveis e continua apresentando cada rotina uma única vez. Um registro sem data suficiente fica sem vencimento calculado. O modelo não separa última conclusão de âncora de reagendamento e não mantém um histórico por ocorrência. Dados já sobrescritos ou ausentes não podem ser reconstruídos. O caso relatado foi reproduzido com dados sintéticos. O registro de produção não foi consultado.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| Chromium a 320, 360, 390 e 430 px | Agenda e Checklist vazios e preenchidos, títulos curtos e extensos, expansão e recolhimento, alinhamento e alvos de toque conferidos. |
| Estados e prioridades | Pendente, em andamento e concluído exercitados. Três prioridades conferidas na Agenda. Status, horário e menu permanecem alinhados. Texto de atraso conferido em dias e meses e badge oculto na conclusão. |
| Interações a 320 px | Ciclos de status, gesto de conclusão, opções dos menus da Agenda e do Checklist, fluxos de edição, finalização, cancelamento de exclusão, pular hoje e navegação para as telas completas. Painel próximo ao rodapé abriu acima do acionador e fechou por Escape e toque externo. Rolagem conferida. |
| Comparação com a main | Captura da Home a 768 px e da timeline a 1440 px idênticas, após a abertura da aplicação, com os mesmos dados. |
| API com SQLite descartável | Recorrências diária, semanal, mensal e única, atrasos de 1 a 100 dias, domingo, ausência de data, reagendamento futuro, para hoje e para data passada, reabertura, conclusão e encerramento. Persistência conferida por nova leitura, sem duplicação ou alteração de registros alheios às ações testadas. |
| Cache e sintaxe | Service worker ativo com v61 e CSS atualizado em ambiente local. Sintaxe dos JavaScripts e Python e diff conferidos. Nenhum erro de página JavaScript observado. O teste dos menus também conferiu a ausência de requisições de escrita inesperadas. |

Os testes de interface usaram Chromium emulado e respostas controladas para os dados de Agenda e Checklist. As confirmações de exclusão foram canceladas na interface. A validação de persistência usou a API e SQLite temporário. Safari, dispositivos físicos e PostgreSQL de produção ficaram fora da validação.
