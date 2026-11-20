# PRIORIZA · Hotfix 061.1

## Alterações

- O formulário mobile passou a usar 10 px entre os campos, 12 px antes do rodapé e 14 px abaixo dos botões. O painel continua centralizado e o conteúdo rola internamente em uma viewport reduzida. O ajuste aplica-se somente ao Checklist mobile.
- Área fica disponível em Pessoal e Profissional. A troca de categoria preserva a escolha. Sem área continua uma opção.
- A coluna opcional `checklist.area` separa o vínculo de área da categoria, mantida em `origem`. A migração adiciona a coluna sem regravar as rotinas antigas. Os registros legados continuam usando a apresentação e o filtro baseados em origem.
- O backend valida novas associações pelas áreas ativas da conta autenticada. A alteração de nome preserva o vínculo e áreas com histórico são arquivadas. O backup exporta a área. Na restauração, o vínculo é recuperado quando há uma área correspondente na conta de destino. Se ela estiver indisponível, a rotina é importada sem vínculo e o relatório de restauração informa a ocorrência.
- A edição pelo menu preenche a Área atual. No mobile, permite editar a Categoria pelo fluxo de diálogos já utilizado. O cadastro rápido e o comando de voz mantêm seu campo histórico de origem e continuam compatíveis com a API. O filtro por área usa o vínculo explícito quando preenchido e não inclui uma rotina explicitamente sem área só por causa da categoria.

## Arquivos

- `main.py` · migração aditiva, persistência, verificação de propriedade e integração com áreas e backup.
- `js/screens/checklist.js`, `js/core/admin.js`, `js/core/areas.js` e `js/app.js` · cadastro, edição, detalhes, filtros e controle da seleção.
- `css/responsive.css` · espaçamento do Checklist mobile.
- `index.html` e `sw.js` · versão `hotfix-061-1` e cache `prioriza-public-v76`.

## Validação

- Chromium e WebKit em 320, 360, 375, 390 e 430 px. Passaram centralização, área opcional em ambas as categorias, troca sem perda, cadastro, edição, cancelamento, filtros, ausência de rolagem horizontal e rolagem interna em viewport de 280 px. O Chromium ativou o cache v76 localmente.
- A API em SQLite temporário passou nos testes de associação, isolamento entre contas, mudança de categoria, renomeação, arquivamento, restauração, registros legados e desvinculação. Uma cópia SQLite com o esquema anterior recebeu a coluna e manteve o registro legado.
- As capturas desktop ficaram idênticas pixel a pixel em 1024, 1280 e 1440 px.
- O print físico mencionado não estava anexado a esta solicitação. O ajuste usou a descrição e as capturas do formulário. Teclado e áreas seguras em iPhone físico e a migração em PostgreSQL ficaram fora da execução local.

## Capturas

- [Mobile · Pessoal, Profissional e Sem área](docs/capturas-hotfix-061-1/mobile.webp)
- [Desktop · 1024 px](docs/capturas-hotfix-061-1/desktop-1024.webp)
- [Desktop · 1280 px](docs/capturas-hotfix-061-1/desktop-1280.webp)
- [Desktop · 1440 px](docs/capturas-hotfix-061-1/desktop-1440.webp)
