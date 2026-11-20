# PRIORIZA · Sprint 059

## Diagnóstico

O cadastro da Agenda compartilhava o formulário de hora inicial e duração entre mobile e desktop. A edição usava o diálogo existente de edição, com escolha de escopo para compromissos recorrentes. O backend recebe duração em minutos e aceita horário de término, inclusive na manhã seguinte. O aviso de conflito da Sprint 058 já tinha seu próprio diálogo e fluxo de confirmação.

## Alterações

- Até 767 px, criação e edição na Agenda usam um painel compacto, com título, data, início e término, interruptores independentes para Dia inteiro e Bloquear agenda, e rodapé com Cancelar e Salvar.
- A duração é calculada a partir dos horários. O formulário identifica quando o término cai no dia seguinte. Ao desligar Dia inteiro, os horários informados reaparecem.
- Mais opções começa recolhido e agrupa Organização, Repetição e Integração. Repetir até aparece conforme a frequência. A criação de área mantém os campos preenchidos.
- A edição preserva a escolha de escopo da recorrência, os campos avançados e os valores que o usuário deixou intactos. Os fluxos de conflito e prevenção de duplicidade da Sprint 058 continuam usando o backend existente.
- Arquivos estáticos atualizados com o identificador `sprint-059` e o service worker com o cache `prioriza-public-v68`.

## Validação

| Verificação | Ambiente | Resultado |
| --- | --- | --- |
| Cadastro, edição, Mais opções, horários e virada da meia-noite, área, bloqueio parcial e cancelamento | Chromium em 320, 360, 390 e 430 px, com API local e SQLite temporário | Aprovado |
| Bloqueio “Feriado”, tentativa de cadastro, cancelamento sem gravar e confirmação com um único registro | Chromium nas quatro larguras mobile e SQLite temporário | Aprovado |
| Suíte API Sprint 058: limites, edição, isolamento entre contas, séries e idempotência concorrente | FastAPI e SQLite temporário | Aprovado |
| Bloqueio de dia inteiro e manutenção do rodapé com a viewport reduzida | Chromium em 390 px | Aprovado |
| Envio da opção de sincronização com Google Agenda | Estado de conexão simulado com captura do payload local | Aprovado para o envio da opção |
| Formulário desktop de cadastro, mesmas informações e mesmo estado | Chromium em 1024, 1280 e 1440 px, base `b4908f7` contra a Sprint 059 | Capturas idênticas pixel a pixel |
| Sintaxe do JavaScript alterado, espaços inválidos no diff e ativação do service worker | Node.js, Git e Chromium | Aprovado |

## Limitações

- O endpoint de edição atual preserva a série e permite escolher o escopo, mas não oferece alteração da frequência ou da data-limite da série. Na edição mobile, esses dados são exibidos para consulta.
- A integração externa com Google Agenda não foi executada. O teste verificou o envio da opção com conexão simulada.
- A viewport reduzida exercitou o comportamento do modal com pouco espaço. O teclado virtual e os seletores nativos do Safari em um iPhone físico não foram testados.

## Capturas

- [Mobile · cadastro e edição, opções recolhidas e abertas](docs/capturas-sprint-059/mobile.webp)
- [Desktop · base e Sprint 059 em 1024 px](docs/capturas-sprint-059/desktop-1024.webp)
- [Desktop · base e Sprint 059 em 1280 px](docs/capturas-sprint-059/desktop-1280.webp)
- [Desktop · base e Sprint 059 em 1440 px](docs/capturas-sprint-059/desktop-1440.webp)
