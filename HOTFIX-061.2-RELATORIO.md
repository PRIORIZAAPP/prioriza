# PRIORIZA · Hotfix 061.2 · Migração do PR #21

**Parecer de publicação imediata: NÃO APTO enquanto a permissão do papel do Render e o mecanismo operacional de rollback não forem confirmados.** A correção passou nos cenários técnicos em PostgreSQL 18.7 isolado. O banco de produção ficou fora do teste.

## Arquivos

- `main.py` · migração transacional de `checklist.area` com `ADD COLUMN IF NOT EXISTS` no PostgreSQL e `lock_timeout` de 3 segundos. Em bancos existentes, a verificação precede as rotinas genéricas de inicialização. Valida `VARCHAR` sem limite de tamanho e anulável. Qualquer falha interrompe a importação da aplicação antes de o Uvicorn aceitar tráfego. A migração mantém o caminho compatível com SQLite.
- `HOTFIX-061.2-RELATORIO.md` · evidências, condições de publicação e rollback.

## Evidências em PostgreSQL 18.7 isolado

| Cenário | Resultado |
| --- | --- |
| Banco legado | Criou uma coluna anulável, sem valor padrão. IDs, donos, títulos, origens, frequências, estados e datas existentes mantiveram os mesmos valores. |
| Banco já migrado | Reiniciou sem DDL adicional. Um papel com acesso aos dados e sem permissão de alterar a tabela também iniciou, com HTTP 200 em `/health` e `/checklist`. |
| Duas inicializações concorrentes | As duas terminaram com sucesso. Ficou uma coluna, sem erro de duplicidade. |
| Bloqueio exclusivo | A migração abortou pelo timeout. Tempo total aproximado de 4,2 segundos incluindo o início do processo. Após liberar o bloqueio, a nova tentativa concluiu. |
| Tipo ou nulabilidade incompatível | Colunas preexistentes em `INTEGER` e em `VARCHAR NOT NULL` foram rejeitadas. |
| Papel sem permissão e coluna ausente | O PostgreSQL retornou `InsufficientPrivilege`. O Uvicorn saiu antes de abrir a porta e a consulta HTTP a `/health` recebeu conexão recusada. |
| Registros e vínculos | A listagem, a próxima execução e a edição de rotina legada passaram. A API confirmou criação, isolamento entre contas, edição, renomeação, arquivamento, backup, restauração e desvinculação. O mesmo conjunto funcional passou com PostgreSQL novo e com SQLite temporário. |
| Rollback para o binário anterior | A versão anterior iniciou com a coluna presente e a edição de título manteve o valor gravado. Ela omitiu os vínculos do backup e permitiu excluir uma área utilizada apenas na coluna nova. |

## Conferência de permissão antes de publicar

O operador autorizado deve conferir a tabela e a coluna usando o mesmo papel de banco configurado no serviço do Render. Se a coluna ainda estiver ausente, o papel precisa ter acesso efetivo à propriedade da tabela para executar `ALTER TABLE`. Se a coluna já estiver válida, o teste confirmou que o papel pode iniciar sem DDL. A consulta abaixo é somente leitura. Ela não foi executada em produção.

```sql
SELECT current_user AS papel,
       pg_get_userbyid(c.relowner) AS dono,
       pg_has_role(current_user, c.relowner, 'USAGE') AS privilegios_do_dono,
       format_type(a.atttypid, a.atttypmod) AS tipo_area,
       CASE WHEN a.attname IS NOT NULL THEN NOT a.attnotnull END AS aceita_nulos
FROM pg_class AS c
LEFT JOIN pg_attribute AS a
  ON a.attrelid = c.oid AND a.attname = 'area' AND NOT a.attisdropped
WHERE c.oid = to_regclass('checklist');
```

## Rollback que preserva vínculos

1. Antes da publicação, identificar a versão estável `33d8463893d953d8d176315852f3d615eefd820e` e confirmar que há um backup recuperável. Se o hotfix já tiver aceitado gravações, capturar o estado atual incluindo a tabela de áreas e `checklist.area`.
2. Para manter as operações normais, preparar e testar uma revisão de rollback que preserve a persistência de `checklist.area`, a proteção em renomeação/exclusão de áreas e a inclusão do vínculo em backup e restauração. Nenhuma revisão desse tipo foi criada nesta etapa.
3. Em emergência, se precisar reimplantar o binário anterior, fazer o retorno em manutenção ou bloquear gravações antes de reabrir o serviço. Manter a coluna e o banco atual. Enquanto a versão anterior estiver em uso, manter restritas as operações que possam apagar ou invalidar vínculos, incluindo renomeação ou exclusão de áreas, exclusão de rotinas ou contas e restauração de backups. O backup JSON da versão antiga não preserva a coluna nova.
4. Reabrir as gravações após reimplantar a versão compatível e conferir os vínculos. A possibilidade operacional de manutenção no Render não foi validada.

O PR permanece aberto. Nenhum acesso ao banco de produção, merge, deploy ou mudança de interface foi realizado.
