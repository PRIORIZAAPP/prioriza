# PRIORIZA — Sprint 041

Estrutura externa criada a partir do arquivo final da Sprint 040.

## Execução

Publique a pasta inteira, preservando `index.html`, `css/`, `js/` e `assets/` no mesmo nível. O HTML isolado não contém mais o CSS e o JavaScript da aplicação.

## Ordem do CSS

1. `tokens.css`
2. `base.css`
3. `layout.css`
4. `components.css`
5. `screens.css`
6. `responsive.css`

As regras foram divididas em blocos contíguos, sem reordenar a cascata original.

## JavaScript

Os onze blocos originais foram externalizados e continuam sendo carregados como scripts clássicos, na ordem anterior. Essa decisão preserva os vínculos globais compartilhados e evita alterar autenticação, eventos, rotas e inicialização nesta fase.

