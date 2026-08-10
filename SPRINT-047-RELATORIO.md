# SPRINT 047 — Gerenciamento Inteligente de Recorrências

## Entrega

- Agenda recorrente agora é persistida e gera as ocorrências previstas até a data final informada.
- Compromissos e rotinas recorrentes recebem indicador visual discreto `↻` junto ao título.
- Edição de itens recorrentes oferece os escopos `Apenas este` e `Toda a recorrência`.
- Alterações em toda a recorrência da Agenda alcançam apenas a ocorrência selecionada e as futuras.
- A ação `Finalizar recorrência` foi adicionada aos menus de ações da Agenda e do Checklist.
- O encerramento mantém ocorrências passadas, itens concluídos e histórico; somente ocorrências futuras pendentes da Agenda são desativadas.
- No Checklist, a rotina encerrada permanece no histórico, mas deixa de retornar à aba Hoje.
- Exclusão permanece restrita ao item selecionado.
- A lógica de confirmação, atualização e encerramento é compartilhada pela interface dos dois módulos.

## Banco de dados

- Foram adicionados somente metadados de recorrência e encerramento.
- Não é criado um identificador novo de série: as ocorrências da Agenda são vinculadas pela marca temporal comum da criação.
- Migração automática e retrocompatível incluída para SQLite e PostgreSQL.

## Validação

- `python -m py_compile main.py`: aprovado.
- `node --check` nos arquivos JavaScript alterados: aprovado.
- Cache do service worker atualizado para `prioriza-public-v47`.
- Identificador de build atualizado para `recorrencias-inteligentes-v1`.
