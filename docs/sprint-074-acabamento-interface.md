# PRIORIZA · Sprint 074

## Alterações

- A Evolução abre com Metas, Hábitos, Datas especiais e Conquistas recolhidos. O acordeão permite abrir um painel por vez e informa o estado via `aria-expanded`. Cada cabeçalho mostra o resumo dos dados carregados. Em Hábitos, o resumo considera os hábitos ativos e aplicáveis na semana exibida. Os botões de cadastro ficam no conteúdo dos três painéis correspondentes.
- O botão de retorno acima da Evolução foi retirado. O acesso pelo cartão da Home mobile e o retorno pela barra inferior seguem o fluxo existente.
- O alinhamento do microfone vinha do `align-items: flex-start` no cabeçalho. O bloco da logo e da data era mais alto que o grupo de controles, que ficava no topo. O grupo agora se centraliza verticalmente no layout mobile. As medidas do cabeçalho desktop continuaram iguais na comparação.
- Os formulários de Agenda, Checklist, Notas e Evolução reutilizam estilos para rótulos, campos de 44 px, botões, cores e preenchimento de texto no WebKit. Campos multilinha e seletores nativos foram preservados. Os caminhos legados de gravação passaram a apresentar o mesmo estado Salvando… e bloqueio de reenvio.

## Arquivos

- `index.html` e `css/responsive.css` concentram as mudanças de marcação e estilo.
- `js/app.js`, `js/screens/evolucao.js`, `js/screens/habitos.js` e `js/screens/datas-especiais.js` ligam a navegação, o acordeão e os contadores.
- `js/screens/checklist.js` e `js/screens/workspace.js` atualizam os estados dos formulários.
- `sw.js` versiona os arquivos e o cache `prioriza-public-v99`.

## Validação executada

- Chromium desktop em 1280 × 720, 1366 × 768, 1440 × 900 e 1920 × 1080. Chromium e WebKit mobile em 320, 390 e 430 px. Foram exercitadas as aparências Azul, Verde, Roxo e Grafite.
- Abertura inicial recolhida, abertura por teclado, fechamento individual, troca de painel, reentrada na Evolução e manutenção do painel após cadastro. Conclusão e reabertura de meta confirmaram a atualização dos contadores de Metas e Conquistas.
- Estados habilitado e desabilitado, preenchimento efetivo da cor do texto, altura e largura dos controles, botões de ação, ausência de rolagem horizontal e campos de recorrência da Agenda em WebKit a 320 px.
- Gravações reais em Agenda, Checklist e Notas e cadastro, edição e progresso na Evolução com API local e SQLite temporário. Exercitados cancelamento, persistência após recarga, falha HTTP simulada e envio repetido durante a gravação.
- Comparação do cabeçalho com a base `fd17bc3`, testes de sintaxe, calendário das Datas especiais e ativação local do cache v99.

## Limitações

A validação do WebKit foi automatizada. O seletor nativo no iPhone físico e o reconhecimento de voz com hardware real ficaram pendentes. A sprint é de frontend, sem mudança no backend, no banco de dados ou no formato de backup.
