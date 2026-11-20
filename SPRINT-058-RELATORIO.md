# Sprint 058 — Validação de conflitos e bloqueio da Agenda

Branch `sprint-058/bloqueio-agenda`, baseada na main em `5544e4e`.

## Diagnóstico

A Agenda armazenava `blocked`, `all_day`, data civil, horário e duração em `tarefas`. A funcionalidade de resumo já identificava sobreposições para análise, mas as rotas de gravação não usavam essa informação para barrar um compromisso dentro de bloqueio. No formulário, a opção de bloquear sempre ativava o modo dia inteiro. Horários finais derivados também eram truncados em 23h59. As séries são materializadas em registros por ocorrência, e eventos Google vinculados podem estar materializados localmente.

## Correção

- Criação e edição com mudança de período ou bloqueio consultam a Agenda da conta. O cálculo usa datas civis de Brasília e intervalos com fim exclusivo. Preserva os limites adjacentes e considera a virada da meia-noite. O próprio registro fica fora da comparação.
- A primeira tentativa conflitante retorna HTTP 409 com os registros afetados. O token de confirmação vincula conta, operação, conteúdo, conflitos e prazo de 10 minutos. Um novo conflito torna inválido o aceite anterior.
- O aviso reutiliza o modal do aplicativo e oferece **Cancelar**, **Cadastrar mesmo assim** ou **Salvar mesmo assim**. Escape e toque fora cancelam. O formulário permite bloqueios com horário sem mudar o modo dia inteiro.
- O backend guarda um recibo por operação idempotente durante a janela de 24 horas, com limpeza de recibos vencidos em gravações posteriores da conta. A tabela aditiva `agenda_recibos` é criada pela inicialização existente e a gravação local do compromisso e do recibo é atômica. Nenhum registro preexistente precisa ser regravado.
- A Agenda diária mobile usa um losango antes do nome do feriado. O nome e o indicador mensal foram preservados. Os arquivos alterados foram versionados e o cache avançou para `prioriza-public-v67`.

## Validação

| Cenário | Resultado |
| --- | --- |
| “Feriado” de dia inteiro e “Tomar uma cerveja” às 10h | Em SQLite e PostgreSQL 18 isolados, a primeira tentativa retornou 409 e manteve a agenda intacta. Após confirmação explícita, quatro reenvios concorrentes retornaram o mesmo ID, com um único compromisso gravado. |
| Intervalos e edição | Bloqueio parcial, datas e horas livres, limites adjacentes, passagem de meia-noite, registro legado sem hora final, edição e verificação sem autoconsideração passaram nas duas bases. |
| Bloqueio sobre compromissos existentes | O aviso retornou os registros sobrepostos. Um registro incluído depois do primeiro aviso exigiu nova confirmação. Os registros existentes foram preservados. |
| APIs e séries | Foram exercitados criação direta, edição, rota legada, tentativa de importação Google e rotas manuais de Google. A série só foi gravada depois da confirmação, com as mesmas três ocorrências previstas. Foram verificados isolamento de contas, replay e chave reutilizada com conteúdo diferente. |
| Chromium em 320, 360, 390, 430, 1024 e 1440 px | Confirmou aviso, ausência de gravação antes do aceite, cancelamento e gravação única após o aceite. Entre os cenários executados estão botão Cancelar, Escape e toque fora. O losango foi verificado no mobile. Em 390 px, o fluxo de edição exibiu “Salvar mesmo assim”, e o service worker ativou o cache v67. |
| Sintaxe | `git diff --check`, análise de Python e `node --check` passaram. |

## Limitações

A comparação usa os registros presentes no PRIORIZA. Eventos existentes apenas no calendário remoto do Google não entram na comparação. As rotas Google foram testadas para rejeição antes de chamar o serviço remoto, sem uso de uma conta Google real. Importação em lote e restauração preservam o fluxo de cópia de dados existente. Clientes diretos devem usar `Idempotency-Key` para proteger reenvios de operações sem conflito. Os testes utilizaram exclusivamente dados locais, sem alterações em produção.

## Capturas

- Criação no mobile — [320 px](docs/capturas-sprint-058/aviso-320.webp), [360 px](docs/capturas-sprint-058/aviso-360.webp), [390 px](docs/capturas-sprint-058/aviso-390.webp) e [430 px](docs/capturas-sprint-058/aviso-430.webp).
- Criação no desktop — [1024 px](docs/capturas-sprint-058/aviso-1024.webp) e [1440 px](docs/capturas-sprint-058/aviso-1440.webp).
- [Aviso de edição em 390 px](docs/capturas-sprint-058/aviso-edicao-390.webp).
