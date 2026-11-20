# PRIORIZA · Sprint 060

## Checklist mobile

Até 767 px, a tela mantém o título e o ícone, mostra os filtros de frequência e área lado a lado e usa os contadores nas três abas como único resumo visível. Os itens têm duas linhas. A primeira usa o indicador de status, o título e o menu de três pontos. A segunda segue a ordem Frequência, Recorrência/data e Área. Datas atrasadas em tarefas abertas aparecem em vermelho. Quando não há data de retorno, o campo desaparece sem deixar separador sobrando.

Títulos e áreas extensos usam reticências. O toque no item abre os detalhes com o conteúdo completo. O menu e o indicador de status preservam uma área de toque de 44 px. O cálculo de recorrência, os filtros e as operações de escrita usam os mesmos fluxos. Ao filtrar para uma lista vazia no mobile, os contadores refletem o total zero da lista.

## Arquivos alterados

| Arquivo | Alteração |
| --- | --- |
| `css/responsive.css` | Cabeçalho, grade e apresentação compacta dos itens, escopados à tela Checklist mobile. |
| `js/screens/checklist.js` | Metadados mobile na ordem solicitada, cor de atraso e contadores sem resultados. |
| `js/core/admin.js` | Reuso da formatação de retorno, incluindo rotinas diárias quando têm data, e detalhes acessíveis até 767 px. |
| `index.html`, `sw.js` | Identificador de arquivos `sprint-060` e cache `prioriza-public-v73`. |

## Validação

- Chromium e WebKit em 320, 360, 375, 390 e 430 px, com API local e SQLite temporário. Passaram as três abas, itens recorrentes e únicos, atraso e data em vermelho, títulos e áreas extensos, filtros combinados, lista sem resultados, atualização dos contadores após mudar status, menu, detalhes e ausência de sobreposição e rolagem horizontal.
- Em 390 px, o Chromium confirmou a rolagem vertical de uma lista longa, a navegação inferior e o botão flutuante visíveis e o cache v73 ativo.
- A comparação desktop com a main `e15208d` ficou idêntica pixel a pixel em 1024, 1280 e 1440 px.
- Os testes foram executados em Linux. Safari e PWA em dispositivo físico ficaram fora da validação.

## Capturas

- [Mobile · Pendentes, Em andamento e Concluídas](docs/capturas-sprint-060/mobile.webp)
- [Desktop · 1024 px](docs/capturas-sprint-060/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-sprint-060/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-sprint-060/desktop-1440.webp)
