# PRIORIZA — Sprint 050

A sprint remove a implementação dos módulos Operação e Finanças, incluindo 30 endpoints. A branch `sprint-050/remover-operacao-financas` foi criada a partir de `main` no commit `00e9b48`.

## Dependências e compatibilidade

- A inicialização autenticada que estava em `operation.js` passou para `js/app.js`. Ela mantém a navegação, os eventos de Agenda, Checklist, Pessoal e Notas, os Ajustes, o backup, a restauração e a inicialização das notificações.
- Os Marcos Importantes pertencem à Agenda. Sua interface, categoria “Operação”, busca, API e dados de backup continuam disponíveis. Os termos profissionais presentes nos cenários genéricos de demonstração também foram preservados. A geração e a remoção de demonstrações deixaram de acessar os módulos descontinuados.
- O backup 2.1 continua exportando Agenda, Checklist, Notas e Marcos Importantes. A restauração lê essas mesmas seções e ignora chaves adicionais de arquivos legados.
- A inicialização deixa de criar ou migrar as oito tabelas descontinuadas. Bancos existentes conservam seu esquema e seus registros ao atualizar. O fluxo de exclusão de conta continua removendo, na mesma transação, os dados do titular nas tabelas legadas que existirem, somente após a confirmação com senha. Bancos novos omitem essas tabelas.
- O service worker passa a usar `prioriza-public-v57`, mantém fora do cache a API dos Marcos Importantes e atualiza a referência ao CSS responsivo. O manifesto de estrutura acompanha a ordem de carregamento do HTML.

## Arquivos

**Excluídos**

- `js/screens/finance.js`
- `js/screens/operation.js`

**Modificados**

- `index.html` — telas, formulários, botões, menus e scripts removidos.
- `css/screens.css` e `css/responsive.css` — estilos exclusivos removidos e seletores compartilhados mantidos.
- `js/app.js` — inicialização autenticada e eventos compartilhados preservados.
- `js/core/admin.js` — consulta e indicador de Finanças retirados do Status do Dia.
- `js/core/runtime.js` e `js/integrations/notifications.js` — registros dos módulos descontinuados removidos.
- `main.py` — rotas, modelos, schemas, regras, migrações e dados demonstrativos exclusivos retirados. Exclusão de conta compatível com bancos legados.
- `sw.js` e `structure-manifest.json` — cache e lista de scripts atualizados.

**Adicionado**

- `SPRINT-050-RELATORIO.md`

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `py_compile` nos três arquivos Python e `node --check` em todos os JavaScript mantidos, incluindo `sw.js` | Aprovada |
| Análise das referências globais dos scripts, conferência da ordem e da existência dos arquivos no manifesto e comparação das rotas da API com `main` | Aprovada. Nenhuma nova referência global não resolvida. Remoção restrita aos 30 endpoints de Operação e Finanças. |
| FastAPI com SQLite novo e SQLite legado simulado, em bancos temporários | Aprovada. Cadastro, login, sessão, onboarding, remoção da demonstração, áreas, recorrência de Agenda, conclusão de rotina e nota, criação e busca de Marcos, resumo, status local de Google e push, backup e restauração, retorno 404 para rotas e scripts removidos e exclusão confirmada de conta. |
| Preservação dos dados legados | Aprovada. A inicialização manteve as oito tabelas e seus registros simulados. A exclusão confirmada removeu somente os registros da conta testada. O hash do `prioriza.db` versionado coincidiu com o de `main`. |
| Chromium em desktop (1440 × 900), tablet (820 × 1000) e mobile (390 × 844) | Fluxos exercitados passaram. Login, escolha de cenário, navegação por Hoje, Agenda, Checklist, Notas e Ajustes, abertura dos formulários de Marcos e Notas, download de backup, ativação do service worker e cache v57. Nenhuma chamada aos módulos retirados, erro JavaScript não tratado ou resposta HTTP 4xx/5xx nas requisições locais monitoradas. |
| Console durante o teste no Chromium | O log intermitente `[Agenda] status Google undefined` apareceu e foi reproduzido também no commit-base de `main`. Os fluxos exercitados prosseguiram. |
| Checagem de whitespace com a convenção de finais de linha do repositório | Aprovada |

## Limitações

A validação funcional utilizou SQLite temporário e Chromium em modo headless com tamanhos de tela emulados. A execução em PostgreSQL, dispositivos físicos, outros navegadores, OAuth e sincronização real com Google Agenda, entrega externa de push ou e-mail e atualização do cache em clientes já instalados ficaram fora dos testes. Credenciais e hospedagem foram preservadas. O PR foi preparado para revisão, sem merge ou publicação em produção.
