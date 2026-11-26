# Sprint 073 · Datas especiais e Conquistas

Datas especiais usa a data civil de Brasília para agrupar os registros. As recorrências mensal e anual partem da data original em cada período e usam o último dia do mês quando o dia original não existe. A virada do dia reaproveita a atualização operacional da aplicação.

Conquistas agrupa as metas concluídas por mês e ano de conclusão em Brasília. Reabrir uma meta usa o fluxo existente e retorna a meta à lista ativa.

## Banco de dados e backup

A inicialização cria a tabela `datas_especiais` pelo mecanismo existente de criação de esquema. A chave é composta por usuário e identificador. A chave estrangeira referencia `users` com exclusão em cascata. São armazenados título, data original, opção de repetição e data de criação. A alteração é aditiva. Conquistas é derivada dos dados de Metas.

O backup 2.4 inclui `datas_especiais` e mantém os dados dos módulos existentes. A restauração vincula os registros à conta autenticada e ignora identificadores de datas que já existem nessa conta. Backups 2.2 e 2.3 continuam aceitos.

## Implantação

1. Confirme que existe um backup recuperável antes de publicar.
2. No PostgreSQL, confirme `USAGE` e `CREATE` no schema para a função usada pela aplicação. Se a função não for proprietária de `users`, confirme a permissão `REFERENCES` sobre `users.id`. Se a tabela tiver sido provisionada por outra função, confira também `SELECT`, `INSERT`, `UPDATE` e `DELETE` nela.
3. Após a implantação, confira a inicialização, o carregamento da Evolução e o service worker `prioriza-public-v97`. Em caso de falha de inicialização, confira os logs antes de reimplantar.
4. Se precisar voltar à versão anterior, mantenha a nova tabela e seus dados. Exporte backups 2.4 antes de reverter sempre que o serviço estiver acessível, pois a versão anterior não oferece acesso às datas nem as inclui no backup. Garanta um backup do banco atualizado e suspenda exclusões de contas durante o rollback. Ao voltar à versão nova, verifique a disponibilidade das datas já gravadas.
