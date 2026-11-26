# PRIORIZA · Sprint 071 · Evolução e Metas

## Implementação

- Evolução ocupa a posição de Pessoal no menu desktop. No mobile, o acesso fica abaixo do Checklist na Home Hoje, com contagem de metas ativas e retorno à Home. A barra inferior mantém seus itens.
- Metas de quantidade aceitam até três casas decimais e unidade opcional. Metas percentuais usam o intervalo de 0 a 100. Metas de conclusão simples usam o indicador circular. Os cartões oferecem atualização direta, edição, confirmação de exclusão e reabertura.
- A conclusão é registrada no momento em que o progresso alcança o objetivo. Uma meta concluída pode voltar às ativas com um progresso menor. A ação **Reabrir** reduz o progresso numérico em uma unidade, até o mínimo de zero. Uma nova conclusão registra uma nova data. Alterar o tipo da meta exige zerar o progresso primeiro.
- O prazo é uma data civil opcional. A indicação de atraso usa o dia de Brasília e não altera o progresso. Não há criação automática de compromissos ou rotinas. Nenhuma meta de demonstração é criada pela sprint.
- A tela antiga do Pessoal consolidava dados da Agenda e do Checklist. A sprint remove essa visualização e mantém os dados e a categoria Pessoal nos módulos de origem.

## Dados e implantação

A tabela aditiva `metas` usa a chave composta `(user_id, id)`, com chave estrangeira para `users` e UUID para identificar a meta em backups. Armazena título, tipo, objetivo e progresso em decimal, unidade, prazo, criação, conclusão e versão. As operações usam a conta autenticada. A versão rejeita uma atualização concorrente baseada em estado antigo. A exclusão de uma conta agora inclui as metas dessa conta.

O backup passa à versão 2.2 e inclui `metas`. Backups anteriores continuam válidos. A restauração valida cada meta, associa o registro à conta autenticada e ignora UUIDs já presentes na mesma conta, preservando o estado mais recente. Os demais módulos mantêm seu fluxo de restauração.

1. Antes do deploy autorizado, confirmar um backup recuperável e a permissão de criação no schema. No PostgreSQL, se a função do banco não for dona de `users`, também precisa de permissão `REFERENCES` sobre `users.id`.
2. A inicialização cria a tabela pelo mecanismo existente do SQLAlchemy, sem apagar dados ou alterar tabelas existentes para cadastrar Metas. No PostgreSQL, a criação do esquema roda em transação com bloqueio consultivo e limite de espera de cinco segundos. Falha de DDL impede a inicialização. Se necessário, resolver a permissão com o responsável pelo banco antes de tentar publicar novamente.
3. Após o deploy autorizado, verificar a inicialização, o cache `prioriza-public-v92` e a abertura e listagem de Metas com uma conta de teste. A versão da implantação deve ser conferida no commit do Render. O campo `build` do endpoint `/health` já usava um identificador estático na base.
4. Para rollback, voltar ao commit anterior e manter a tabela `metas`. A versão anterior não expõe as metas nem as inclui em seus backups. Guardar uma exportação feita pela versão nova antes do rollback e usar novamente uma versão compatível para acessá-las.
