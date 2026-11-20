# PRIORIZA · Hotfix 060.1

## Causa e correção

Na Sprint 060, o Checklist geral criava o menu compartilhado sem habilitar a apresentação mobile da Home. Como o painel é anexado diretamente ao corpo para escapar do recorte e da pilha de sobreposição das linhas, regras ligadas ao item também não alcançam o painel. Em 390 px, a versão-base usava `display: block`, fundo transparente, raio zero e ações de 42 px. O posicionamento genérico usava a viewport de layout e não acompanhava eventos de rolagem do Checklist.

O menu mobile do Checklist usa um painel branco vertical de até 200 px, bordas arredondadas, sombra e ações de pelo menos 44 px. Ele abre abaixo do botão quando há espaço e acima quando necessário. O cálculo considera os limites horizontais, a viewport visual, as margens seguras e a navegação inferior. O painel acompanha o botão durante a rolagem e fecha quando a âncora sai da área útil.

Tocar novamente no botão, tocar fora, selecionar uma ação, pressionar Escape ou trocar de aba/filtro fecha o painel. Os itens aplicáveis e todas as operações existentes continuam definidos pelo Checklist. A altura das linhas da Sprint 060 permanece igual.

## Arquivos

- `js/core/admin.js` e `js/app.js` · apresentação, posicionamento e acompanhamento de eventos do painel.
- `js/screens/checklist.js` · ativação no Checklist geral e fechamento na atualização da lista.
- `css/responsive.css` · estilos do painel no mobile.
- `index.html` e `sw.js` · arquivos versionados como `hotfix-060-1` e cache `prioriza-public-v74`.

## Validação

- Chromium e WebKit em 320, 360, 375, 390 e 430 px, com API e SQLite locais. Cenários exercitados incluem os três status, ações aplicáveis a tarefas únicas e recorrentes, abertura e fechamento, toque fora, atualização de filtros, limites da viewport e abertura perto da navegação inferior.
- Em 390 px, o menu abriu acima de botões junto à borda inferior, acompanhou a rolagem e fechou ao sair da área útil. O Chromium também confirmou fechamento ao alternar aba e área, retorno de foco com Escape e ativação local do cache v74.
- As cinco ações foram executadas em bancos locais no Chromium e no WebKit. Foram verificados cancelamento, atualização de registro e confirmação de finalização e exclusão.
- Comparação de desktop com a main `ebcb9db`, com o menu aberto, em 1024, 1280 e 1440 px. As capturas ficaram idênticas pixel a pixel.
- A inspeção em aparelho físico e os limites da área segura do Safari iOS em um iPhone real continuam pendentes.

## Capturas

- [Mobile · Menu nas três abas](docs/capturas-hotfix-060-1/mobile.webp)
- [Desktop · 1024 px](docs/capturas-hotfix-060-1/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-hotfix-060-1/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-hotfix-060-1/desktop-1440.webp)
