# SPRINT 048 — Padronização das Ações Contextuais

## Entrega

- Criado um único componente reutilizável: `criarMenuAcoesContextuais`.
- Agenda, Hoje, Checklist e Notas agora utilizam exatamente o mesmo botão `...`, card flutuante, tipografia e comportamento.
- Botões fixos de edição, cancelamento e exclusão foram removidos das listagens de compromissos.
- Controles primários de status permanecem disponíveis sem misturar ações administrativas.
- Ações exibidas são contextuais: `Finalizar recorrência` aparece apenas em itens recorrentes.
- O card usa posicionamento flutuante em relação à janela, abre acima quando não existe espaço abaixo e não altera dimensões ou posição dos itens da lista.
- O menu mantém o mesmo comportamento em desktop, tablet e mobile.
- Correção pós-publicação: o card passou a ser montado diretamente no `body`, eliminando interferência de `overflow`, `transform` e contexto de empilhamento dos itens em desktop e mobile.

## Validação

- Sintaxe Python e JavaScript verificada.
- Busca estrutural confirmou a remoção dos componentes de ação antigos das telas cobertas.
- Cache do service worker atualizado para `prioriza-public-v49`.
- Build identificado como `acoes-contextuais-v2`.
