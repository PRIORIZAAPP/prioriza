# SPRINT 048 — Padronização das Ações Contextuais

## Entrega

- Criado um único componente reutilizável: `criarMenuAcoesContextuais`.
- Agenda, Hoje, Checklist e Notas agora utilizam exatamente o mesmo botão `...`, card flutuante, tipografia e comportamento.
- Botões fixos de edição, cancelamento e exclusão foram removidos das listagens de compromissos.
- Controles primários de status permanecem disponíveis sem misturar ações administrativas.
- Ações exibidas são contextuais: `Finalizar recorrência` aparece apenas em itens recorrentes.
- O card usa posicionamento flutuante em relação à janela, abre acima quando não existe espaço abaixo e não altera dimensões ou posição dos itens da lista.
- O menu mantém o mesmo comportamento em desktop, tablet e mobile.

## Validação

- Sintaxe Python e JavaScript verificada.
- Busca estrutural confirmou a remoção dos componentes de ação antigos das telas cobertas.
- Cache do service worker atualizado para `prioriza-public-v48`.
- Build identificado como `acoes-contextuais-v1`.
