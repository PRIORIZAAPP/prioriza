# Sprint 045.1 — Primeira Experiência

## Implementado

- Modal de primeiro acesso com escolha entre explorar exemplos e organizar a própria rotina.
- Banner permanente e minimizável na Home, mantendo um indicador visível durante a exploração.
- Selo global “Exploração”, explicação curta na Home e estado da conta abaixo do avatar.
- CTA único “Organizar minha rotina” no banner e em Ajustes.
- Tentativas de criação, edição ou exclusão são interrompidas antes da persistência e direcionadas ao onboarding.
- Os dados fictícios só são removidos após conclusão do onboarding e confirmação explícita.
- Cancelamento ou abandono do onboarding preserva integralmente a demonstração.
- Confirmação final “Tudo pronto!” após a transição para o uso real.
- Contas que já utilizam dados reais permanecem sem qualquer elemento da experiência de demonstração.

## Validação técnica

- Sintaxe JavaScript validada.
- Backend Python compilado sem erros.
- Cache público renovado para evitar arquivos antigos após a publicação.
- Identificador de saúde atualizado para `primeira-experiencia-v1`.
