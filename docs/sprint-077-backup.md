# PRIORIZA · Sprint 077 · Backup e restauração

## Diagnóstico e solução

Base `0db1b45`, com a Sprint 076 integrada. Agenda, Checklist, Notas e Marcos recriavam registros a cada importação. A Agenda também descartava os campos que identificam as séries. A Evolução já tinha chaves compostas por usuário e UUID.

O backup **2.5** acrescenta `backup_id` aos quatro módulos com chaves inteiras e `backup_serie_id` às ocorrências de Agenda que têm início de série. A identidade de um registro nativo vem da chave e do instante original de criação. A identidade de um registro importado é mantida mesmo quando o banco destino atribui outro ID local. A repetição distingue registros existentes e conflitos, preservando edições e exclusões locais. Dois registros com conteúdo igual continuam separados quando têm identidades distintas.

A Agenda restaura o tipo, o limite, o início e o fim da recorrência. Duas séries distintas com o mesmo instante de origem recebem chaves locais separadas. Exportações posteriores mantêm a identidade e o instante de origem. A rotina de edição de série continua usando os mesmos campos da Agenda. O Checklist preserva a última execução, a criação e o fim da recorrência disponíveis no backup. Uma Área legada é preservada na coluna histórica quando disponível e no mapa de restauração, com reexportação sem reintroduzir o recurso na interface. Metas, Hábitos e Datas especiais preservam as chaves e a proteção existentes. Conquistas continuam derivadas das metas concluídas.

## Isolamento e atomicidade

O servidor valida a estrutura, a versão, os tipos de registros e as identidades antes da gravação. Campos JSON repetidos e constantes inválidas são rejeitados. A identidade nunca é usada para escolher a conta. A conta de destino vem exclusivamente da autenticação. A exportação usa `Cache-Control: no-store` e não inclui credenciais de conta, tokens ou os identificadores e links operacionais do Google. Campos de autorização e de sincronização recebidos em arquivos antigos são desconsiderados. Compromissos importados ficam locais, preservando o conteúdo, e não herdam autorização para alterar eventos externos.

O PostgreSQL serializa restaurações com bloqueio da conta autenticada. O SQLite usa `BEGIN IMMEDIATE`. Registros, históricos e identidades compartilham uma transação, com rollback em qualquer falha. A resposta discrimina importados, já existentes e conflitos por módulo e apresenta um resumo em Ajustes. Os conflitos preservam o destino. O layout e os estáticos da interface foram preservados. O cache continua em **v100**.

## Compatibilidade

| Arquivo | Leitura | Deduplicação |
|---|---|---|
| 2.5 | Sete seções obrigatórias, com listas vazias permitidas | Identidades persistentes nas quatro listas inteiras e nas três listas da Evolução |
| 2.2, 2.3 e 2.4 | Seções históricas podem estar ausentes | UUID na Evolução. ID inteiro mais criação nos demais módulos quando disponíveis |
| 1.0, 2.0, 2.1 e sem versão | Leitura das seções reconhecidas | Se faltar identidade confiável, impressão digital do arquivo mais posição dentro da seção |
| Versão desconhecida, JSON corrompido ou 2.5 incompleto | Rejeição antes de gravar | Sem alterações |

Para registros legados sem ID e data de criação, uma releitura do mesmo arquivo canônico é idempotente. Quando arquivos distintos contêm esses registros, o importador preserva ambos. Arquivos sem identidade e estruturalmente idênticos são indistinguíveis nessa condição. Duplicações gravadas antes da sprint não são corrigidas retroativamente. Arquivos históricos que não registraram detalhes de recorrência, execuções ou vínculos não podem recuperar informações ausentes. A exportação das listas tradicionais mantém o recorte anterior de registros ativos. A instalação física e a carga de arquivos muito grandes não foram medidas.

## Comparativo quantitativo

Mesma massa sintética em conta vazia, com um registro por módulo. Números após cada restauração.

| Módulo | Antes · 1ª / 2ª / 3ª | Depois · 1ª / 2ª / 3ª |
|---|---:|---:|
| Agenda | 1 / 2 / 3 | 1 / 1 / 1 |
| Checklist | 1 / 2 / 3 | 1 / 1 / 1 |
| Notas | 1 / 2 / 3 | 1 / 1 / 1 |
| Marcos | 1 / 2 / 3 | 1 / 1 / 1 |
| Total | 4 / 8 / 12 | 4 / 4 / 4 |

## Testes executados

- SQLite e PostgreSQL 18.7 isolados. Exportação completa, conta de origem, conta vazia e conta com dados preexistentes, três reimportações, backups sobrepostos, conteúdo igual, edição local, chaves manipuladas, formatos legados, históricos e isolamento.
- Uma exportação 2.5 de seis módulos foi restaurada de SQLite para PostgreSQL e no sentido inverso, em contas novas.
- Três restaurações concorrentes produziram uma única gravação. Falha injetada depois do início das escritas provocou rollback completo, com nova tentativa bem-sucedida.
- Duas séries com o mesmo instante de origem permaneceram distintas. Edição por série alterou somente as ocorrências do grupo selecionado.
- Rejeição de dados corrompidos, duplicação de campo JSON, formato incompleto, versão desconhecida e ausência de autenticação. Exclusão de conta removeu as identidades da conta excluída e preservou a origem.
- Inicialização em esquema legado sintético criou somente a tabela aditiva esperada e preservou o registro de conferência, nos dois bancos.
- Suítes existentes de Metas, Hábitos e Datas especiais nos dois bancos, calendário em Node, expiração de credenciais e verificações de configuração da Sprint 076.
- Ajustes em Chromium desktop a 1440 px e WebKit mobile a 390 px. Upload, confirmação, três restaurações e resumo foram exercitados, com exportação 2.5 e verificação do total.

## Implantação e rollback

A inicialização existente cria `backup_identidades`, com chave por usuário, módulo e identidade, restrição de unicidade para o registro local e referência a `users`. O processo requer as permissões usuais de criação no schema e, quando outra função possui a tabela `users`, acesso de referência à chave. Verificar essas permissões em homologação, mantendo a lista de verificação da Sprint 076. Confirmar backup recuperável antes da implantação e exercitar `/health`, exportação e restauração em conta sintética. O esquema anterior não precisa ser reescrito.

Para rollback, retornar à revisão `0db1b45` preservando as tabelas e os registros existentes. Pausar restaurações durante a reversão, pois a versão anterior ignora identidades e volta a duplicar registros. As exportações anteriores também omitem as novas chaves. Retomar o uso após voltar à versão com suporte ao 2.5. O banco e as configurações de produção não foram acessados.

## Arquivos

- `main.py` para formato, validação, restauração, identidades e exclusão de conta.
- `tests/backup_restauracao.py` para cenários de integridade.
- `tests/evolucao_datas_especiais.py`, `tests/evolucao_habitos.py` e `tests/evolucao_metas.py` para o novo formato e a compatibilidade legada.
- `docs/sprint-077-backup.md` para este relatório.
