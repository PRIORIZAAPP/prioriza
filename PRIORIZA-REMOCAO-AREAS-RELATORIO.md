# PRIORIZA · Remoção de Áreas

A organização na interface passa a usar Pessoal e Profissional. A alteração parte da `main` em `33d8463` e está na branch `produto/remover-areas`.

## Alterações

- Agenda, Checklist e Hoje deixam de mostrar Área nos formulários, detalhes, listas, sugestões e filtros. O Checklist ganha filtro por categoria. Cadastro rápido e comandos de voz enviam categorias. O Local proveniente de eventos do Google continua disponível.
- Ajustes deixa de oferecer o gerenciamento de Áreas. Notas já funcionava sem Área. O fluxo de demonstração mantém a seleção de cenários, com exemplos organizados por categoria e sem cadastrar Áreas.
- A API de gerenciamento `/areas` e o script de migração de Áreas foram removidos. Os campos históricos continuam no banco, inclusive o valor usado para distinguir séries antigas na visualização de recorrências.
- O PR #21 foi revisado. Apliquei, de forma independente, apenas os espaçamentos mobile do formulário de rotina inspirados no Hotfix 061.1. As mudanças para cadastrar Área nas duas categorias, a migração do Hotfix 061.2 e a prontidão condicionada a essa coluna foram deixadas de fora.

## Arquivos

| Arquivos | Alteração |
| --- | --- |
| `index.html`, `css/screens.css`, `css/responsive.css` | Remoção de controles e estilos exclusivos e ajuste de espaço no formulário mobile |
| `js/app.js`, `js/core/admin.js`, `js/screens/agenda.js`, `js/screens/checklist.js`, `js/screens/workspace.js` | Formulários, rótulos, filtros, criação rápida, voz, navegação e avisos de restauração |
| `main.py`, `demo_scenarios.json` | Remoção da API de Áreas, dados demonstrativos e compatibilidade com backup legado |
| `sw.js`, `structure-manifest.json` | Cache `prioriza-public-v77` e inventário dos arquivos |
| `js/core/areas.js`, `migrate_user_areas.py` | Excluídos |
| `PRIORIZA-REMOCAO-AREAS-RELATORIO.md` | Relatório |

## Dados e backups

- A mudança dispensa migração de Área e não executa exclusão ou reclassificação de registros existentes. Origens legadas continuam armazenadas. A interface interpreta `PESSOAL` como Pessoal e os demais valores históricos como Profissional, inclusive campos vazios. Editar o título de uma rotina legada mantém a origem original.
- O backup continua incluindo as informações legadas já exportadas. Se `checklist.area` existir, o backup exporta os vínculos e a restauração os grava quando o destino dispõe dessa coluna. Em um destino sem a coluna, as rotinas são restauradas com a categoria e o histórico disponíveis, a interface informa que houve avisos e o arquivo original continua com os vínculos.
- A restauração preserva as datas do Checklist usadas no cálculo de recorrência. O formato JSON existente permanece compatível. A limitação anterior da restauração de séries da Agenda permanece. Testes de backup cobriram compromissos individuais e rotinas.

## Validação

| Verificação | Resultado |
| --- | --- |
| Chromium e WebKit em 320, 390, 430, 1024 e 1440 px | Filtros Pessoal/Profissional, rotina legada, três campos do formulário sem excesso de largura e navegação entre Checklist, Agenda, Notas, Ajustes e Hoje. Sem exceções JavaScript observadas nesses fluxos |
| PostgreSQL 18 isolado, com e sem `checklist.area` | Inicialização e health, restauração e exportação, edição preservando origem, criação por categoria e frequências, coluna e tabela legadas preservadas |
| SQLite temporário | Fluxos equivalentes sem a coluna legada |
| Suíte da Agenda da Sprint 058 em SQLite temporário | Passou para bloqueios, limites, virada da meia-noite, edição, isolamento entre contas, séries e idempotência concorrente. Google exercitado pela suíte local |
| Chromium com service worker | Cache `prioriza-public-v77` ativo e sete arquivos versionados armazenados |
| Python, JavaScript, JSON e diff | Sintaxe e consistência verificadas |

Microfone físico, sincronização real do Google, iPhone físico e produção ficaram fora da validação.

## Publicação e retorno

1. Após a aprovação, integrar apenas o PR da branch `produto/remover-areas`. Confirmar que a produção dispõe de backup recuperável e registrar o commit publicado anterior.
2. No Render, conferir o commit implantado, `/health`, os arquivos com `v=sem-areas` e o cache `prioriza-public-v77`. Em um PWA que já esteja aberto, reabrir o aplicativo para carregar a sessão com os novos arquivos. Conferir uma rotina legada e os filtros das duas categorias.
3. Se for preciso voltar, publicar o commit anterior conhecido sem restaurar ou modificar o banco. Isso volta a exibir Área. Os valores antigos permanecem no banco. Registros criados na versão nova têm categoria e podem não ter vínculo de Área para a versão anterior exibir.

A entrega não inclui merge, deploy, alterações na hospedagem nem acesso ao banco de produção.
