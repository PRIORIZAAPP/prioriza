# PRIORIZA · Sprint 072 · Hábitos

## Dados e comportamento

- `habitos` registra o identificador estável, proprietário, título, dia de criação e dia de arquivamento atual.
- `habitos_frequencias` registra a frequência vigente desde uma segunda-feira. Uma mudança substitui a frequência da semana corrente e vale para as seguintes. Semanas anteriores mantêm seu valor.
- `habitos_periodos` registra os intervalos de atividade. O último dia é inclusivo. Arquivar e reativar no mesmo dia reabre o intervalo. Reativar em outro dia preserva a pausa.
- `habitos_realizacoes` usa a chave composta de usuário, hábito e data. A rota recebe o estado realizado ou desfeito de forma idempotente. Gravações no mesmo hábito são serializadas. O calendário usa o dia civil de Brasília.
- O resumo inclui hábitos que estiveram ativos em algum dia da semana selecionada. Quando um hábito é arquivado, ele sai da lista ativa e pode ser consultado em **Ver hábitos arquivados**. Dias dentro de seus períodos de atividade continuam disponíveis para correção.
- O backup 2.3 contém as quatro informações por hábito, sem depender de IDs locais de outra conta. A restauração 2.2 continua disponível. Um identificador já restaurado na conta é ignorado nas novas importações, preservando seu estado atual. A exclusão definitiva da conta inclui os dados de Hábitos.

## Implantação e rollback

1. Antes de publicar, confirmar um backup recuperável. No PostgreSQL, verificar `USAGE` e `CREATE` no schema de destino e `REFERENCES` sobre `users.id` se a função da aplicação não for dona da tabela. Se outro papel criar as tabelas, a função da aplicação precisará também das permissões normais de leitura e gravação nas quatro tabelas.
2. A inicialização cria as quatro tabelas aditivas com o SQLAlchemy. O PostgreSQL usa o bloqueio consultivo existente e espera por até cinco segundos por bloqueios. SQLite usa `BEGIN IMMEDIATE` para serializar a criação do esquema. A falha de criação impede a inicialização. Nenhuma tabela preexistente precisa ser alterada.
3. Após publicação autorizada, verificar o commit do serviço, a inicialização, a disponibilidade da rota autenticada de Hábitos e o cache `prioriza-public-v95`. Usar uma conta de teste para conferir o registro e sua reversão.
4. Se for necessário voltar ao commit anterior, manter as quatro tabelas. A versão anterior não mostra Hábitos nem os inclui em seus backups. Guardar um backup gerado pela versão 2.3 antes de voltar e suspender exclusões definitivas de contas durante o rollback. Acessar novamente os dados com uma versão compatível.
